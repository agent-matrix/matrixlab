import base64
import os
import shlex
import subprocess
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from typing import List, Optional

from .main import RunRequest, StepResult


@dataclass
class CmdOut:
    exit_code: int
    stdout: str
    stderr: str


def _run_local(cmd: List[str], timeout: int) -> CmdOut:
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return CmdOut(p.returncode, p.stdout, p.stderr)


def _zip_dir_to_base64(dir_path: str) -> str:
    fd, zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(dir_path):
                for f in files:
                    abs_path = os.path.join(root, f)
                    rel_path = os.path.relpath(abs_path, dir_path)
                    z.write(abs_path, rel_path)
        with open(zip_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)


def run_job(req: RunRequest):
    """
    Runs each step in a fresh container.

    v1 design:
    - workspace + output are host temp dirs bind-mounted into each container.
    - network is per-step (none vs bridge).

    Note: For production, prefer named volumes or managed storage and tighter network egress.
    """

    job_id = str(uuid.uuid4())
    host_output_dir = tempfile.mkdtemp(prefix=f"job-{job_id}-out-")
    host_workspace_dir = tempfile.mkdtemp(prefix=f"job-{job_id}-ws-")

    # dev convenience so uid 1000 can write.
    subprocess.run(["chmod", "777", host_workspace_dir, host_output_dir], check=False)

    results: List[StepResult] = []

    for step in req.steps:
        network_flag = ["--network", "none"] if step.network == "none" else ["--network", "bridge"]
        container_name = f"mlab-{job_id[:8]}-{step.name[:10]}-{uuid.uuid4().hex[:4]}"

        docker_cmd = [
            "docker",
            "run",
            "--rm",
            "--name",
            container_name,
            "--user",
            "1000:1000",
            "--read-only",
            "--pids-limit",
            str(req.pids_limit),
            "--cpus",
            str(req.cpu_limit),
            "--memory",
            f"{req.mem_limit_mb}m",
            "--security-opt",
            "no-new-privileges",
            "--cap-drop",
            "ALL",
            "--workdir",
            "/workspace",
            "-v",
            f"{host_workspace_dir}:/workspace:rw",
            "-v",
            f"{host_output_dir}:/output:rw",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,size=256m",
        ] + network_flag + [
            req.sandbox_image,
            "bash",
            "-lc",
        ]

        env_exports = ""
        if step.env:
            env_exports = " ".join([
                f"{shlex.quote(k)}={shlex.quote(v)}" for k, v in step.env.items()
            ])

        step_script = f"""
set -euo pipefail
export HOME=/workspace
export OUTPUT_DIR=/output
{f"export {env_exports}" if env_exports else ""}

echo "== Matrix Lab step: {step.name} =="
{step.command}
"""

        try:
            out = _run_local(docker_cmd + [step_script], timeout=step.timeout_seconds)
            results.append(
                StepResult(
                    name=step.name,
                    exit_code=out.exit_code,
                    stdout=out.stdout,
                    stderr=out.stderr,
                )
            )
            if out.exit_code != 0:
                break

        except subprocess.TimeoutExpired as e:
            subprocess.run(["docker", "kill", container_name], capture_output=True)
            results.append(
                StepResult(
                    name=step.name,
                    exit_code=124,
                    stdout=getattr(e, "stdout", "") or "",
                    stderr=(getattr(e, "stderr", "") or "") + "\nTIMEOUT",
                )
            )
            break

        except Exception as e:
            results.append(
                StepResult(
                    name=step.name,
                    exit_code=999,
                    stdout="",
                    stderr=f"Runner error: {e}",
                )
            )
            break

    artifacts_b64: Optional[str] = _zip_dir_to_base64(host_output_dir)

    return {
        "job_id": job_id,
        "results": [r.model_dump() for r in results],
        "artifacts_zip_base64": artifacts_b64,
    }
