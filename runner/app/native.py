from __future__ import annotations

import base64
import json
import mimetypes
import os
import posixpath
import shlex
import tempfile
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .docker_executor import execute_in_warm_container
from .models import (
    ArtifactRecord,
    CodeRunRequest,
    CodeRunResponse,
    NativeRunRequest,
    NativeRunResponse,
    RepoRunRequest,
    RunRequest,
    Step,
    WorkspaceUploadRequest,
    WorkspaceUploadResponse,
)
from .pool_manager import warm_pool_manager
from .sandbox import run_job_with_details

PROTOCOL = "matrixlab.runner.v1"
SERVICE = "matrixlab-runner"
VERSION = os.environ.get("MATRIXLAB_VERSION", "0.1.0")

MAX_TIMEOUT_SEC = int(os.environ.get("MATRIXLAB_MAX_TIMEOUT_SEC", "900"))
MAX_OUTPUT_BYTES = int(os.environ.get("MATRIXLAB_MAX_OUTPUT_BYTES", str(10 * 1024 * 1024)))
MAX_WORKSPACE_BYTES = int(os.environ.get("MATRIXLAB_MAX_WORKSPACE_BYTES", str(500 * 1024 * 1024)))
MAX_ARTIFACT_BYTES = int(os.environ.get("MATRIXLAB_MAX_ARTIFACT_BYTES", str(100 * 1024 * 1024)))

RUNNER_STATE_DIR = Path(os.environ.get("MATRIXLAB_STATE_DIR", os.path.join(os.getcwd(), "runner_state")))
UPLOAD_DIR = RUNNER_STATE_DIR / "uploads"
RUN_DIR = RUNNER_STATE_DIR / "runs"

IMAGE_ALIASES = {
    "utils": "matrix-lab-sandbox-utils:latest",
    "python": "matrix-lab-sandbox-python:latest",
    "node": "matrix-lab-sandbox-node:latest",
    "go": "matrix-lab-sandbox-go:latest",
    "rust": "matrix-lab-sandbox-rust:latest",
    "build": "matrix-lab-sandbox-build:latest",
}

# When the runner is shipped via ``docker pull``, the bare image names
# above don't exist on Docker Hub — they're published under a namespace
# (e.g. ``ruslanmv/matrix-lab-sandbox-python``).  Operators set
# ``MATRIXLAB_IMAGE_NAMESPACE`` to that prefix so every alias resolves to
# the published image; the default is empty so locally-built bare images
# (``make build-images`` with no push) keep working unchanged.
_IMAGE_NAMESPACE = os.environ.get("MATRIXLAB_IMAGE_NAMESPACE", "").strip().rstrip("/")
if _IMAGE_NAMESPACE:
    IMAGE_ALIASES = {
        alias: f"{_IMAGE_NAMESPACE}/{ref}" for alias, ref in IMAGE_ALIASES.items()
    }


def ensure_state_dirs() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RUN_DIR.mkdir(parents=True, exist_ok=True)


def runner_capabilities() -> Dict[str, Any]:
    return {
        "version": VERSION,
        "protocol": PROTOCOL,
        "images": list(IMAGE_ALIASES.keys()),
        "image_aliases": IMAGE_ALIASES,
        "features": {
            "workspace_zip": True,
            "repo_clone": True,
            "streaming": True,
            "artifacts": True,
            "env_lifecycle": True,
            "network_policy": True,
            "legacy_steps": True,
            "warm_pool": warm_pool_manager.enabled,
            "code_run": True,
            "chatbot_snippets": True,
        },
        "limits": {
            "max_timeout_sec": MAX_TIMEOUT_SEC,
            "max_output_bytes": MAX_OUTPUT_BYTES,
            "max_workspace_bytes": MAX_WORKSPACE_BYTES,
            "max_artifact_bytes": MAX_ARTIFACT_BYTES,
        },
    }


def resolve_image(image_or_profile: str) -> str:
    return IMAGE_ALIASES.get((image_or_profile or "python").strip(), image_or_profile)


def _bounded_timeout(timeout: int) -> int:
    return max(1, min(int(timeout), MAX_TIMEOUT_SEC))


def _safe_cwd(cwd: str) -> str:
    cwd = (cwd or ".").strip()
    if cwd.startswith("/") or ".." in Path(cwd).parts:
        raise ValueError("cwd must be a relative path inside the workspace")
    return cwd


def _safe_repo_ref(ref: Optional[str]) -> Optional[str]:
    if not ref:
        return None
    if any(ch in ref for ch in ["\n", "\r", "\x00"]):
        raise ValueError("ref contains invalid control characters")
    return ref


def _decode_b64_zip(zip_base64: str) -> bytes:
    raw = base64.b64decode(zip_base64, validate=True)
    if len(raw) > MAX_WORKSPACE_BYTES:
        raise ValueError(f"workspace exceeds max size of {MAX_WORKSPACE_BYTES} bytes")
    return raw


def _safe_extract_zip(raw: bytes, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    zip_path = dest / ".workspace.zip"
    zip_path.write_bytes(raw)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            total = 0
            for info in zf.infolist():
                total += info.file_size
                if total > MAX_WORKSPACE_BYTES:
                    raise ValueError(f"workspace exceeds max size of {MAX_WORKSPACE_BYTES} bytes")
                normalized = posixpath.normpath(info.filename)
                if normalized.startswith("../") or normalized == ".." or normalized.startswith("/"):
                    raise ValueError(f"unsafe zip path: {info.filename}")
            zf.extractall(dest)
    finally:
        zip_path.unlink(missing_ok=True)


def upload_workspace(req: WorkspaceUploadRequest) -> WorkspaceUploadResponse:
    ensure_state_dirs()
    raw = _decode_b64_zip(req.zip_base64)
    upload_id = f"ws_{uuid.uuid4().hex}"
    upload_path = UPLOAD_DIR / f"{upload_id}.zip"
    upload_path.write_bytes(raw)
    return WorkspaceUploadResponse(upload_id=upload_id, size=len(raw), excluded=[])


def _workspace_zip_for_ref(workspace: Any) -> Optional[bytes]:
    if workspace is None:
        return None
    if workspace.zip_base64:
        return _decode_b64_zip(workspace.zip_base64)
    if workspace.upload_id:
        upload_path = UPLOAD_DIR / f"{workspace.upload_id}.zip"
        if not upload_path.is_file():
            raise FileNotFoundError(f"workspace upload not found: {workspace.upload_id}")
        raw = upload_path.read_bytes()
        if len(raw) > MAX_WORKSPACE_BYTES:
            raise ValueError(f"workspace exceeds max size of {MAX_WORKSPACE_BYTES} bytes")
        return raw
    return None


def _artifact_records(out_dir: str) -> List[ArtifactRecord]:
    records: List[ArtifactRecord] = []
    root = Path(out_dir)
    if not root.is_dir():
        return records
    total = 0
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        rel = path.relative_to(root).as_posix()
        size = path.stat().st_size
        total += size
        if total > MAX_ARTIFACT_BYTES:
            break
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        records.append(ArtifactRecord(id=rel, name=rel, mime=mime, size=size))
    return records


def _persist_run(sandbox_id: str, out_dir: str, response: NativeRunResponse) -> None:
    run_dir = RUN_DIR / sandbox_id
    run_dir.mkdir(parents=True, exist_ok=True)
    meta = response.model_dump(mode="json")
    meta["out_dir"] = out_dir
    (run_dir / "metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


def _load_run_meta(sandbox_id: str) -> Dict[str, Any]:
    meta_path = RUN_DIR / sandbox_id / "metadata.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"run not found: {sandbox_id}")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def get_run_artifacts(sandbox_id: str) -> List[ArtifactRecord]:
    meta = _load_run_meta(sandbox_id)
    return [ArtifactRecord.model_validate(a) for a in meta.get("artifacts", [])]


def get_artifact_path(sandbox_id: str, artifact_id: str) -> Path:
    meta = _load_run_meta(sandbox_id)
    out_dir = Path(meta["out_dir"]).resolve()
    artifact_path = (out_dir / artifact_id).resolve()
    if out_dir not in artifact_path.parents and artifact_path != out_dir:
        raise ValueError("artifact path escapes run output directory")
    if not artifact_path.is_file():
        raise FileNotFoundError(f"artifact not found: {artifact_id}")
    return artifact_path


def stream_run_events(sandbox_id: str) -> Iterable[str]:
    meta = _load_run_meta(sandbox_id)
    if meta.get("stdout"):
        yield _sse({"type": "stdout", "data": meta["stdout"]})
    if meta.get("stderr"):
        yield _sse({"type": "stderr", "data": meta["stderr"]})
    for artifact in meta.get("artifacts", []):
        yield _sse({"type": "artifact", "artifact": artifact})
    yield _sse({"type": "exit", "exit_code": meta.get("exit_code"), "duration_ms": meta.get("duration_ms")})


def _sse(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _native_response_from_run(raw: Dict[str, Any], out_dir: str, started: float) -> NativeRunResponse:
    results = raw.get("results") or []
    last = results[-1] if results else {"exit_code": 0, "stdout": "", "stderr": ""}
    stdout = "\n".join((r.get("stdout") or "") for r in results)
    stderr = "\n".join((r.get("stderr") or "") for r in results)
    timed_out = any(r.get("exit_code") == 124 or "TIMEOUT" in (r.get("stderr") or "") for r in results)

    truncated = False
    if len(stdout.encode("utf-8", errors="ignore")) > MAX_OUTPUT_BYTES:
        stdout = stdout.encode("utf-8", errors="ignore")[:MAX_OUTPUT_BYTES].decode("utf-8", errors="ignore")
        truncated = True
    if len(stderr.encode("utf-8", errors="ignore")) > MAX_OUTPUT_BYTES:
        stderr = stderr.encode("utf-8", errors="ignore")[:MAX_OUTPUT_BYTES].decode("utf-8", errors="ignore")
        truncated = True

    out_root = Path(out_dir)
    out_root.mkdir(parents=True, exist_ok=True)
    (out_root / "stdout.log").write_text(stdout, encoding="utf-8", errors="ignore")
    (out_root / "stderr.log").write_text(stderr, encoding="utf-8", errors="ignore")

    artifacts = _artifact_records(out_dir)
    response = NativeRunResponse(
        sandbox_id=raw.get("job_id", f"sb_{uuid.uuid4().hex}"),
        exit_code=int(last.get("exit_code", 0)),
        stdout=stdout,
        stderr=stderr,
        duration_ms=int((time.monotonic() - started) * 1000),
        timed_out=timed_out,
        truncated=truncated,
        artifacts=artifacts,
    )
    _persist_run(response.sandbox_id, out_dir, response)
    return response


def _command_step(cmd: str, cwd: str, timeout: int, allow_network: bool, env: Dict[str, str]) -> Step:
    cwd = _safe_cwd(cwd)
    command = f"cd {shlex.quote(cwd)}\n{cmd}"
    return Step(
        name="command",
        command=command,
        timeout_seconds=_bounded_timeout(timeout),
        network="egress" if allow_network else "none",
        env=env,
    )


def _run_with_warm_pool(req: NativeRunRequest, seed_dir: Optional[Path], started: float) -> Optional[NativeRunResponse]:
    # Docker cgroup-freezer warm containers are provisioned with network=none.
    # Fall back to the legacy per-run container path when egress is requested.
    if req.allow_network:
        return None

    image = resolve_image(req.image)
    lease = warm_pool_manager.acquire(
        image,
        cpu_limit=req.cpu_limit,
        mem_limit_mb=req.mem_limit_mb,
        pids_limit=req.pids_limit,
    )
    if lease is None:
        return None

    out_dir = RUNNER_STATE_DIR / "warm-runs" / lease.container_id / "out"
    try:
        result = execute_in_warm_container(
            lease.container_id,
            workspace_dir=seed_dir,
            out_dir=out_dir,
            cmd=req.cmd,
            cwd=_safe_cwd(req.cwd),
            env=req.env,
            timeout=_bounded_timeout(req.timeout),
        )
        raw = {
            "job_id": lease.container_id,
            "results": [
                {
                    "name": "command",
                    "exit_code": result.exit_code,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                }
            ],
            "warm_pool": {"enabled": True, "hit": lease.warm_hit, "image": lease.image},
        }
        return _native_response_from_run(raw, str(out_dir), started)
    finally:
        # Enterprise isolation rule: never return an ACTIVE sandbox to the pool.
        warm_pool_manager.release(lease)


def run_workspace_command(req: NativeRunRequest) -> NativeRunResponse:
    ensure_state_dirs()
    started = time.monotonic()
    seed_dir: Optional[Path] = None
    raw_zip = _workspace_zip_for_ref(req.workspace)
    if raw_zip is not None:
        seed_dir = RUNNER_STATE_DIR / "seeds" / f"seed_{uuid.uuid4().hex}"
        _safe_extract_zip(raw_zip, seed_dir)

    warm_response = _run_with_warm_pool(req, seed_dir, started)
    if warm_response is not None:
        return warm_response

    run_req = RunRequest(
        repo_url="workspace://upload",
        steps=[_command_step(req.cmd, req.cwd, req.timeout, req.allow_network, req.env)],
        cpu_limit=req.cpu_limit,
        mem_limit_mb=req.mem_limit_mb,
        pids_limit=req.pids_limit,
        sandbox_image=resolve_image(req.image),
    )
    raw, _, out_dir = run_job_with_details(run_req, workspace_seed_path=str(seed_dir) if seed_dir else None)
    return _native_response_from_run(raw, out_dir, started)


def _safe_package_args(packages: List[str]) -> List[str]:
    safe: List[str] = []
    for package in packages:
        package = package.strip()
        if not package:
            continue
        if len(package) > 200:
            raise ValueError(f"package specifier is too long: {package[:40]}...")
        if any(ch in package for ch in [";", "&", "|", "`", "$", "\n", "\r", "<", ">"]):
            raise ValueError(f"unsafe package specifier: {package}")
        safe.append(package)
    return safe


def _package_install_command(language: str, packages: List[str], allow_network: bool) -> str:
    safe_packages = _safe_package_args(packages)
    if not safe_packages:
        return ""
    if not allow_network:
        raise ValueError("packages require allow_network=true so dependency installation is explicit")

    quoted = " ".join(shlex.quote(package) for package in safe_packages)
    if language == "python":
        return f"python -m pip install --user {quoted}\n"
    if language == "node":
        return f"npm install --no-audit --no-fund {quoted}\n"
    raise ValueError("packages are only supported for python and node/javascript code runs")


def run_code_snippet(req: CodeRunRequest) -> CodeRunResponse:
    language = "node" if req.language == "javascript" else req.language
    with tempfile.TemporaryDirectory(prefix="matrixlab-code-") as tmp:
        root = Path(tmp)
        stdin_redirect = ""
        if req.stdin is not None:
            (root / "stdin.txt").write_text(req.stdin, encoding="utf-8")
            stdin_redirect = " < stdin.txt"

        package_cmd = _package_install_command(language, req.packages, req.allow_network)

        if language == "python":
            (root / "main.py").write_text(req.code, encoding="utf-8")
            cmd = f"{package_cmd}python main.py{stdin_redirect}"
            image = req.image or "python"
        elif language == "node":
            (root / "main.js").write_text(req.code, encoding="utf-8")
            cmd = f"{package_cmd}node main.js{stdin_redirect}"
            image = req.image or "node"
        else:
            (root / "script.sh").write_text(req.code, encoding="utf-8")
            cmd = f"bash script.sh{stdin_redirect}"
            image = req.image or "utils"

        workspace_zip = _zip_workspace_to_base64(root)
        native_req = NativeRunRequest(
            cmd=cmd,
            cwd=".",
            workspace={"type": "zip", "zip_base64": workspace_zip},
            env=req.env,
            timeout=req.timeout,
            image=image,
            allow_network=req.allow_network,
            stdin=req.stdin,
            metadata={**req.metadata, "source": "code-run", "language": req.language},
            cpu_limit=req.cpu_limit,
            mem_limit_mb=req.mem_limit_mb,
            pids_limit=req.pids_limit,
        )
        result = run_workspace_command(native_req)
        console = [
            "Run started",
            "Initializing environment",
            "Installing packages" if req.packages else "No packages requested",
            "Running code",
            f"Run completed in {result.duration_ms}ms",
        ]
        return CodeRunResponse(
            sandbox_id=result.sandbox_id,
            language=req.language,
            exit_code=result.exit_code,
            stdout=result.stdout,
            stderr=result.stderr,
            duration_ms=result.duration_ms,
            timed_out=result.timed_out,
            truncated=result.truncated,
            console=console,
            artifacts=result.artifacts,
        )


def _zip_workspace_to_base64(root: Path) -> str:
    raw_path = root / "workspace.zip"
    try:
        with zipfile.ZipFile(raw_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for path in root.rglob("*"):
                if path == raw_path or not path.is_file():
                    continue
                zf.write(path, path.relative_to(root).as_posix())
        return base64.b64encode(raw_path.read_bytes()).decode("ascii")
    finally:
        raw_path.unlink(missing_ok=True)


def run_repo_command(req: RepoRunRequest) -> NativeRunResponse:
    ensure_state_dirs()
    started = time.monotonic()
    ref = _safe_repo_ref(req.ref)
    checkout = f"git checkout {shlex.quote(ref)} || true" if ref else "true"
    clone = Step(
        name="clone",
        network="egress",
        timeout_seconds=min(MAX_TIMEOUT_SEC, max(120, _bounded_timeout(req.timeout))),
        command=(
            "set -euo pipefail\n"
            "export GIT_TERMINAL_PROMPT=0\n"
            "rm -rf repo\n"
            f"git clone --depth=1 {shlex.quote(req.repo_url)} repo\n"
            "cd repo\n"
            f"{checkout}\n"
        ),
    )
    run = Step(
        name="command",
        network="egress" if req.allow_network else "none",
        timeout_seconds=_bounded_timeout(req.timeout),
        command=f"cd repo\n{req.cmd}",
        env=req.env,
    )
    run_req = RunRequest(
        repo_url=req.repo_url,
        ref=ref,
        steps=[clone, run],
        cpu_limit=req.cpu_limit,
        mem_limit_mb=req.mem_limit_mb,
        pids_limit=req.pids_limit,
        sandbox_image=resolve_image(req.profile),
    )
    raw, _, out_dir = run_job_with_details(run_req)
    return _native_response_from_run(raw, out_dir, started)
