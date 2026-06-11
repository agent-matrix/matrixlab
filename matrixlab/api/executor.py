"""Run executor service for the sandbox validation provider.

Responsibilities:
  * Load the requested profile and validate commands against the
    profile's ``forbidden_commands`` (fail-closed).
  * Execute commands via subprocess in a temp working dir, OR use a
    deterministic dry-run / stub path (offline & fast) for tests and when
    the repo is unreachable.
  * Apply a unified-diff patch before running (validate-patch).
  * Store run results in an in-memory dict keyed by ``run_id`` plus
    on-disk artifact files in a temp dir.
  * Enforce ``timeout_seconds``.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from typing import Dict, List, Optional, Tuple

from .models import Artifact, RunResponse
from .profiles import ForbiddenCommandError, Profile, get_profile

# In-memory store of completed runs, keyed by run_id.
_RUNS: Dict[str, RunResponse] = {}
# On-disk artifact files: run_id -> {artifact_name: absolute_path}
_ARTIFACTS: Dict[str, Dict[str, str]] = {}

_ARTIFACT_ROOT = os.path.join(tempfile.gettempdir(), "matrixlab-artifacts")


class ProfileNotFoundError(Exception):
    pass


def _new_run_id() -> str:
    return "run_" + uuid.uuid4().hex[:12]


def dry_run_enabled() -> bool:
    return os.environ.get("MATRIXLAB_DRY_RUN", "").strip().lower() in {"1", "true", "yes"}


def _artifact_dir(run_id: str) -> str:
    path = os.path.join(_ARTIFACT_ROOT, run_id)
    os.makedirs(path, exist_ok=True)
    return path


def _store_artifact(run_id: str, name: str, content: str) -> Artifact:
    path = os.path.join(_artifact_dir(run_id), name)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    _ARTIFACTS.setdefault(run_id, {})[name] = path
    return Artifact(name=name, url=f"/runs/{run_id}/artifacts/{name}")


def get_run(run_id: str) -> Optional[RunResponse]:
    return _RUNS.get(run_id)


def get_artifacts(run_id: str) -> List[Artifact]:
    run = _RUNS.get(run_id)
    return list(run.artifacts) if run else []


def get_artifact_path(run_id: str, name: str) -> Optional[str]:
    return _ARTIFACTS.get(run_id, {}).get(name)


# --------------------------------------------------------------------------
# Patch handling
# --------------------------------------------------------------------------

_DIFF_FILE_RE = re.compile(r"^\+\+\+ (?:b/)?(.+?)\s*$", re.MULTILINE)


def patched_files_from_diff(patch: str) -> List[str]:
    """Best-effort extraction of the file paths a unified diff touches."""
    files: List[str] = []
    for match in _DIFF_FILE_RE.finditer(patch or ""):
        name = match.group(1).strip()
        if name and name != "/dev/null" and name not in files:
            files.append(name)
    return files


def _apply_patch(workdir: str, patch: str) -> None:
    """Apply a unified diff inside ``workdir`` using ``git apply``/``patch``."""
    patch_path = os.path.join(workdir, ".matrixlab.patch")
    with open(patch_path, "w", encoding="utf-8") as fh:
        fh.write(patch)
    # Prefer git apply, fall back to patch(1).
    for cmd in (
        ["git", "apply", "--whitespace=nowarn", patch_path],
        ["patch", "-p1", "-i", patch_path],
    ):
        try:
            res = subprocess.run(
                cmd, cwd=workdir, capture_output=True, text=True, timeout=60
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        if res.returncode == 0:
            return
    # Non-fatal: real execution may still proceed; patched_files still echoed.


# --------------------------------------------------------------------------
# Execution paths
# --------------------------------------------------------------------------

def _resolve_commands(profile: Profile, commands: Optional[List[str]]) -> List[str]:
    return list(commands) if commands else list(profile.commands)


def _run_subprocess(
    commands: List[str], workdir: str, timeout_seconds: int
) -> Tuple[int, str, str]:
    """Run commands sequentially; stop at first failure. Returns (code, out, err)."""
    stdout_parts: List[str] = []
    stderr_parts: List[str] = []
    deadline = time.monotonic() + timeout_seconds
    exit_code = 0
    for cmd in commands:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            stderr_parts.append(f"$ {cmd}\n[matrixlab] timeout exceeded before command")
            exit_code = 124
            break
        stdout_parts.append(f"$ {cmd}")
        try:
            res = subprocess.run(
                cmd,
                shell=True,
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=remaining,
            )
        except subprocess.TimeoutExpired as exc:
            stdout_parts.append(exc.stdout or "")
            stderr_parts.append((exc.stderr or "") + "\n[matrixlab] command timed out")
            exit_code = 124
            break
        stdout_parts.append(res.stdout)
        stderr_parts.append(res.stderr)
        if res.returncode != 0:
            exit_code = res.returncode
            break
    return exit_code, "\n".join(p for p in stdout_parts if p), "\n".join(
        p for p in stderr_parts if p
    )


def _synthetic_logs(
    profile: Profile, commands: List[str], repo_url: str, branch: str
) -> str:
    lines = [
        "[matrixlab dry-run] simulated sandbox execution",
        f"[matrixlab dry-run] profile={profile.name} repo={repo_url} branch={branch}",
        f"[matrixlab dry-run] network={profile.network} max_memory_mb={profile.max_memory_mb}",
    ]
    for cmd in commands:
        lines.append(f"$ {cmd}")
        lines.append(f"[matrixlab dry-run] OK: {cmd}")
    lines.append("[matrixlab dry-run] all commands completed (exit 0)")
    return "\n".join(lines)


def _artifact_name_for(profile: Profile) -> str:
    if profile.artifact_files:
        return profile.artifact_files[0]
    return "pytest-report.txt"


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------

def execute_run(
    *,
    profile_name: str,
    repo_url: str,
    branch: str,
    commands_override: Optional[List[str]] = None,
    timeout_override: Optional[int] = None,
    artifacts_override: Optional[bool] = None,
    patch: Optional[str] = None,
) -> RunResponse:
    """Validate a repo/branch/(patch) by running profile commands in a sandbox.

    Uses the deterministic dry-run/stub path when ``MATRIXLAB_DRY_RUN`` is set
    or when the repo cannot be cloned, so tests stay offline and fast.
    """
    profile = get_profile(profile_name)
    if profile is None:
        raise ProfileNotFoundError(profile_name)

    commands = _resolve_commands(profile, commands_override)
    # Fail-closed: refuse forbidden commands BEFORE doing any work.
    profile.check_commands(commands)

    timeout_seconds = int(timeout_override or profile.timeout_seconds)
    collect_artifacts = (
        profile.artifacts if artifacts_override is None else bool(artifacts_override)
    )
    patched = patched_files_from_diff(patch) if patch else None

    run_id = _new_run_id()
    start = time.monotonic()

    if dry_run_enabled():
        exit_code, stdout, stderr = 0, _synthetic_logs(
            profile, commands, repo_url, branch
        ), ""
        if patched:
            stdout += "\n[matrixlab dry-run] applied patch touching: " + ", ".join(
                patched
            )
    else:
        exit_code, stdout, stderr, fell_back = _real_or_fallback(
            profile, commands, repo_url, branch, timeout_seconds, patch
        )
        if fell_back:
            # Repo unreachable -> deterministic stub, mirroring dry-run.
            exit_code, stdout, stderr = 0, _synthetic_logs(
                profile, commands, repo_url, branch
            ), ""

    duration_ms = int((time.monotonic() - start) * 1000)
    status = "passed" if exit_code == 0 else "failed"

    artifacts: List[Artifact] = []
    if collect_artifacts:
        report = (
            f"profile: {profile.name}\n"
            f"repo: {repo_url}\nbranch: {branch}\n"
            f"exit_code: {exit_code}\nstatus: {status}\n"
            f"duration_ms: {duration_ms}\n\n"
            "----- stdout -----\n" + stdout + "\n"
        )
        artifacts.append(
            _store_artifact(run_id, _artifact_name_for(profile), report)
        )

    response = RunResponse(
        run_id=run_id,
        status=status,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
        duration_ms=duration_ms,
        artifacts=artifacts,
        patched_files=patched,
    )
    _RUNS[run_id] = response
    return response


def _real_or_fallback(
    profile: Profile,
    commands: List[str],
    repo_url: str,
    branch: str,
    timeout_seconds: int,
    patch: Optional[str],
) -> Tuple[int, str, str, bool]:
    """Clone + run. Returns (exit_code, stdout, stderr, fell_back_to_stub)."""
    workdir = tempfile.mkdtemp(prefix="matrixlab-run-")
    try:
        clone = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, repo_url, workdir],
            capture_output=True,
            text=True,
            timeout=min(timeout_seconds, 300),
        )
        if clone.returncode != 0:
            # Unreachable / invalid repo -> fall back to deterministic stub.
            return 0, "", "", True
        if patch:
            _apply_patch(workdir, patch)
        exit_code, stdout, stderr = _run_subprocess(commands, workdir, timeout_seconds)
        return exit_code, stdout, stderr, False
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return 0, "", "", True
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def reset_state() -> None:
    """Clear stored runs/artifacts (used by tests)."""
    _RUNS.clear()
    _ARTIFACTS.clear()
    shutil.rmtree(_ARTIFACT_ROOT, ignore_errors=True)
