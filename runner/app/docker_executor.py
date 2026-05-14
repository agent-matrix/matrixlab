from __future__ import annotations

import shlex
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from .config import WARM_POOL


@dataclass
class DockerExecResult:
    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool = False


def _run(cmd: List[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def provision_and_freeze(
    image_name: str,
    *,
    cpu_limit: float = 1.0,
    mem_limit_mb: int = 1024,
    pids_limit: int = 256,
) -> str:
    """Start a clean container, wait until it is ready, then pause it.

    This uses Docker's cgroup freezer (`docker pause`) for the practical local
    implementation of the warm-pool architecture. The container is intentionally
    started with network disabled and must be destroyed after one active use.
    """
    container_name = f"mlab-warm-{uuid.uuid4().hex[:12]}"
    cmd = [
        "docker",
        "run",
        "-d",
        "--name",
        container_name,
        "--init",
        "--network",
        "none",
        "--pids-limit",
        str(pids_limit),
        "--cpus",
        str(cpu_limit),
        "--memory",
        f"{mem_limit_mb}m",
        "--security-opt",
        "no-new-privileges",
        "--cap-drop",
        "ALL",
        "--workdir",
        "/workspace",
        "--label",
        "matrixlab.pool=warm",
        "--label",
        "matrixlab.state=provisioning",
        "--user",
        "root",
        image_name,
        "bash",
        "-lc",
        "mkdir -p /workspace /output && chmod 777 /workspace /output && touch /tmp/matrixlab-ready && sleep infinity",
    ]
    started = _run(cmd, timeout=WARM_POOL.container_ready_timeout_seconds)
    if started.returncode != 0:
        raise RuntimeError(f"failed to provision warm sandbox: {started.stderr or started.stdout}")

    container_id = started.stdout.strip()
    try:
        ready = _run(["docker", "exec", container_id, "test", "-f", "/tmp/matrixlab-ready"], timeout=WARM_POOL.container_ready_timeout_seconds)
        if ready.returncode != 0:
            raise RuntimeError(ready.stderr or ready.stdout or "warm sandbox did not become ready")
        paused = _run(["docker", "pause", container_id], timeout=10)
        if paused.returncode != 0:
            raise RuntimeError(paused.stderr or paused.stdout)
        return container_id
    except Exception:
        destroy_sandbox(container_id)
        raise


def unfreeze_and_activate(container_id: str) -> None:
    unpaused = _run(["docker", "unpause", container_id], timeout=10)
    if unpaused.returncode != 0:
        raise RuntimeError(unpaused.stderr or unpaused.stdout)


def destroy_sandbox(container_id: str) -> None:
    subprocess.run(["docker", "rm", "-f", container_id], capture_output=True, text=True, timeout=15, check=False)


def execute_in_warm_container(
    container_id: str,
    *,
    workspace_dir: Optional[Path],
    out_dir: Path,
    cmd: str,
    cwd: str,
    env: Dict[str, str],
    timeout: int,
) -> DockerExecResult:
    """Inject a workspace into a warm container and execute one command.

    The container is single-use: callers must destroy it in a finally block.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    setup = _run(["docker", "exec", container_id, "bash", "-lc", "rm -rf /workspace/* /output/* && mkdir -p /workspace /output && chmod 777 /workspace /output"], timeout=20)
    if setup.returncode != 0:
        return DockerExecResult(setup.returncode, setup.stdout, setup.stderr)

    if workspace_dir is not None and workspace_dir.exists():
        copy_cmd = ["docker", "cp", f"{workspace_dir}/.", f"{container_id}:/workspace"]
        copied = _run(copy_cmd, timeout=60)
        if copied.returncode != 0:
            return DockerExecResult(copied.returncode, copied.stdout, copied.stderr)

    exec_cmd = ["docker", "exec"]
    for key, value in env.items():
        exec_cmd.extend(["-e", f"{key}={value}"])
    script = f"set -euo pipefail\nmkdir -p /output\ncd {shlex.quote(cwd)}\n{cmd}"
    exec_cmd.extend(["--workdir", "/workspace", container_id, "bash", "-lc", script])

    timed_out = False
    try:
        completed = _run(exec_cmd, timeout=timeout)
        result = DockerExecResult(completed.returncode, completed.stdout, completed.stderr)
    except subprocess.TimeoutExpired as exc:
        timed_out = True
        result = DockerExecResult(124, exc.stdout or "", (exc.stderr or "") + "\nTIMEOUT", timed_out=True)

    (out_dir / "stdout.log").write_text(result.stdout, encoding="utf-8", errors="ignore")
    (out_dir / "stderr.log").write_text(result.stderr, encoding="utf-8", errors="ignore")

    tmp_output = out_dir / "_container_output"
    if tmp_output.exists():
        shutil.rmtree(tmp_output, ignore_errors=True)
    copied_output = subprocess.run(
        ["docker", "cp", f"{container_id}:/output/.", str(tmp_output)],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if copied_output.returncode == 0 and tmp_output.exists():
        for child in tmp_output.iterdir():
            target = out_dir / child.name
            if child.is_dir():
                shutil.copytree(child, target, dirs_exist_ok=True)
            else:
                shutil.copy2(child, target)
        shutil.rmtree(tmp_output, ignore_errors=True)

    result.timed_out = result.timed_out or timed_out
    return result
