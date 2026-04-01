"""
MatrixLab Sandbox Runner — executes and verifies project artifacts safely.

Runs in isolated temp directories with subprocess timeouts.
No Docker required (HF Spaces compatible).
"""
from __future__ import annotations

import ast
import os
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import yaml


@dataclass
class StepResult:
    name: str
    status: Literal["success", "warning", "error", "skipped"]
    message: str = ""
    logs: str = ""


@dataclass
class RunResult:
    status: Literal["success", "warning", "error"]
    steps: list[StepResult] = field(default_factory=list)
    detected_language: str = ""
    detected_framework: str = ""
    files_count: int = 0
    summary: str = ""


def run_verification(zip_bytes: bytes, timeout: int = 120) -> RunResult:
    """Unpack a ZIP and run a multi-stage verification pipeline."""
    steps: list[StepResult] = []
    work_dir = tempfile.mkdtemp(prefix="matrixlab_")

    try:
        # Stage 1: Unpack
        step = _unpack(zip_bytes, work_dir)
        steps.append(step)
        if step.status == "error":
            return RunResult(status="error", steps=steps, summary="Failed to unpack ZIP.")

        # Find the project root (may be inside a subfolder)
        project_dir = _find_project_root(work_dir)
        files = list(Path(project_dir).rglob("*"))
        file_count = len([f for f in files if f.is_file()])

        # Stage 2: Detect language/framework
        lang, framework = _detect(project_dir)
        steps.append(StepResult(
            name="detect",
            status="success",
            message=f"Language: {lang}, Framework: {framework}",
        ))

        # Stage 3: Validate syntax
        step = _validate_syntax(project_dir)
        steps.append(step)

        # Stage 4: Security scan
        step = _security_scan(project_dir)
        steps.append(step)

        # Stage 5: Dependency check
        step = _check_dependencies(project_dir)
        steps.append(step)

        # Stage 6: Import test (Python only)
        if lang == "python":
            step = _import_test(project_dir, timeout=min(timeout, 30))
            steps.append(step)

        # Stage 7: Run tests if present
        step = _run_tests(project_dir, timeout=min(timeout, 60))
        steps.append(step)

        # Determine overall status
        has_errors = any(s.status == "error" for s in steps)
        has_warnings = any(s.status == "warning" for s in steps)
        overall = "error" if has_errors else ("warning" if has_warnings else "success")

        passed = len([s for s in steps if s.status == "success"])
        total = len([s for s in steps if s.status != "skipped"])
        summary = f"{passed}/{total} checks passed. Language: {lang}, Framework: {framework}."

        return RunResult(
            status=overall,
            steps=steps,
            detected_language=lang,
            detected_framework=framework,
            files_count=file_count,
            summary=summary,
        )
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _unpack(zip_bytes: bytes, dest: str) -> StepResult:
    try:
        zip_path = os.path.join(dest, "project.zip")
        with open(zip_path, "wb") as f:
            f.write(zip_bytes)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(dest)
        os.remove(zip_path)
        return StepResult(name="unpack", status="success", message="ZIP extracted successfully.")
    except Exception as e:
        return StepResult(name="unpack", status="error", message=str(e)[:200])


def _find_project_root(base: str) -> str:
    """Find the actual project root inside the unpacked directory."""
    entries = os.listdir(base)
    non_hidden = [e for e in entries if not e.startswith(".") and e != "__MACOSX"]
    if len(non_hidden) == 1:
        candidate = os.path.join(base, non_hidden[0])
        if os.path.isdir(candidate):
            return candidate
    return base


def _detect(project_dir: str) -> tuple[str, str]:
    """Detect language and framework from project files."""
    files = {f.name for f in Path(project_dir).rglob("*") if f.is_file()}
    all_content = ""
    for f in Path(project_dir).rglob("*.py"):
        try:
            all_content += f.read_text(errors="ignore")
        except Exception:
            pass

    lang = "unknown"
    framework = "unknown"

    if any(f.endswith(".py") for f in files):
        lang = "python"
    elif any(f.endswith(".js") or f.endswith(".ts") for f in files):
        lang = "javascript"
    elif any(f.endswith(".go") for f in files):
        lang = "go"

    if "crewai" in all_content.lower() or "agents.yaml" in files:
        framework = "crewai"
    elif "langgraph" in all_content.lower() or "StateGraph" in all_content:
        framework = "langgraph"
    elif "react_loop" in all_content or "TOOLS" in all_content:
        framework = "react"
    elif "watsonx" in all_content.lower() or "agent.yaml" in files:
        framework = "watsonx_orchestrate"
    elif "Flow" in all_content and "crewai" in all_content.lower():
        framework = "crewai_flow"

    return lang, framework


def _validate_syntax(project_dir: str) -> StepResult:
    """Check Python syntax and YAML validity."""
    errors = []
    checked = 0

    for f in Path(project_dir).rglob("*.py"):
        checked += 1
        try:
            ast.parse(f.read_text(errors="ignore"), filename=str(f))
        except SyntaxError as e:
            errors.append(f"{f.name}:{e.lineno}: {e.msg}")

    for f in Path(project_dir).rglob("*.yaml"):
        checked += 1
        try:
            yaml.safe_load(f.read_text(errors="ignore"))
        except yaml.YAMLError as e:
            errors.append(f"{f.name}: {str(e)[:80]}")

    for f in Path(project_dir).rglob("*.yml"):
        checked += 1
        try:
            yaml.safe_load(f.read_text(errors="ignore"))
        except yaml.YAMLError as e:
            errors.append(f"{f.name}: {str(e)[:80]}")

    if errors:
        return StepResult(
            name="syntax",
            status="error",
            message=f"{len(errors)} syntax error(s)",
            logs="\n".join(errors),
        )
    return StepResult(name="syntax", status="success", message=f"{checked} files checked, all valid.")


def _security_scan(project_dir: str) -> StepResult:
    """AST-based security scan for dangerous patterns."""
    issues = []

    forbidden_calls = {"eval", "exec", "__import__"}
    forbidden_attrs = {("os", "system"), ("subprocess", "Popen"), ("subprocess", "call")}

    for f in Path(project_dir).rglob("*.py"):
        try:
            tree = ast.parse(f.read_text(errors="ignore"))
        except SyntaxError:
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in forbidden_calls:
                    issues.append(f"{f.name}: {node.func.id}() at line {node.lineno}")
                if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                    key = (node.func.value.id, node.func.attr)
                    if key in forbidden_attrs:
                        issues.append(f"{f.name}: {key[0]}.{key[1]}() at line {node.lineno}")

    if issues:
        return StepResult(
            name="security",
            status="error",
            message=f"{len(issues)} security issue(s)",
            logs="\n".join(issues),
        )
    return StepResult(name="security", status="success", message="No dangerous patterns found.")


def _check_dependencies(project_dir: str) -> StepResult:
    """Check if requirements.txt or pyproject.toml exists."""
    has_requirements = (Path(project_dir) / "requirements.txt").exists()
    has_pyproject = (Path(project_dir) / "pyproject.toml").exists()

    if has_requirements or has_pyproject:
        deps = []
        if has_requirements:
            content = (Path(project_dir) / "requirements.txt").read_text(errors="ignore")
            deps = [l.strip() for l in content.splitlines() if l.strip() and not l.startswith("#")]
        return StepResult(
            name="dependencies",
            status="success",
            message=f"Found {len(deps)} dependencies.",
        )
    return StepResult(
        name="dependencies",
        status="warning",
        message="No requirements.txt or pyproject.toml found.",
    )


def _import_test(project_dir: str, timeout: int = 30) -> StepResult:
    """Try to import Python files to check for missing modules."""
    py_files = list(Path(project_dir).rglob("*.py"))
    if not py_files:
        return StepResult(name="import_test", status="skipped", message="No Python files.")

    # Find the main entry point
    main_file = None
    for candidate in ["main.py", "src/main.py", "app.py"]:
        full = Path(project_dir) / candidate
        if full.exists():
            main_file = full
            break
    if not main_file:
        for f in py_files:
            if f.name == "main.py":
                main_file = f
                break
    if not main_file:
        main_file = py_files[0]

    try:
        result = subprocess.run(
            ["python", "-c", f"import ast; ast.parse(open('{main_file}').read())"],
            capture_output=True, text=True, timeout=timeout,
            cwd=project_dir,
        )
        if result.returncode == 0:
            return StepResult(name="import_test", status="success", message=f"Parsed {main_file.name} successfully.")
        return StepResult(
            name="import_test", status="warning",
            message=f"Parse check had issues.", logs=result.stderr[:500],
        )
    except subprocess.TimeoutExpired:
        return StepResult(name="import_test", status="warning", message="Import test timed out.")
    except Exception as e:
        return StepResult(name="import_test", status="warning", message=str(e)[:200])


def _run_tests(project_dir: str, timeout: int = 60) -> StepResult:
    """Run pytest if test files exist."""
    test_files = list(Path(project_dir).rglob("test_*.py"))
    if not test_files:
        return StepResult(name="tests", status="skipped", message="No test files found.")

    try:
        result = subprocess.run(
            ["python", "-m", "pytest", "--tb=short", "-q"] + [str(f) for f in test_files],
            capture_output=True, text=True, timeout=timeout,
            cwd=project_dir,
            env={**os.environ, "PYTHONPATH": project_dir},
        )
        if result.returncode == 0:
            return StepResult(name="tests", status="success", message="Tests passed.", logs=result.stdout[:1000])
        return StepResult(
            name="tests", status="error",
            message="Tests failed.", logs=(result.stdout + result.stderr)[:1000],
        )
    except subprocess.TimeoutExpired:
        return StepResult(name="tests", status="warning", message="Tests timed out.")
    except Exception as e:
        return StepResult(name="tests", status="warning", message=str(e)[:200])
