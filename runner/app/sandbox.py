from __future__ import annotations

import base64
import os
import shlex
import subprocess
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from typing import List, Optional

from .models import RunRequest, StepResult


@dataclass
class CmdOut:
    exit_code: int
    stdout: str
    stderr: str


def _run_local(cmd: List[str], timeout: int) -> CmdOut:
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return CmdOut(p.returncode, p.stdout, p.stderr)


def runner_preflight() -> None:
    """
    Fail fast if the Runner container cannot run Docker sibling containers.
    """
    # 1) docker binary present?
    try:
        subprocess.run(["docker", "version"], capture_output=True, text=True, check=False)
    except FileNotFoundError as e:
        raise RuntimeError(
            "Runner cannot find the 'docker' binary. "
            "Install docker CLI in runner image (docker-ce-cli) and rebuild."
        ) from e

    # 2) docker socket reachable?
    sock = "/var/run/docker.sock"
    if not os.path.exists(sock):
        raise RuntimeError(
            "Runner cannot see /var/run/docker.sock. "
            "Mount it into the runner container via docker-compose:\n"
            "  - /var/run/docker.sock:/var/run/docker.sock"
        )

    # 3) can talk to daemon?
    probe = subprocess.run(["docker", "info"], capture_output=True, text=True)
    if probe.returncode != 0:
        raise RuntimeError(
            "Runner can execute docker CLI but cannot talk to Docker daemon. "
            "Check permissions on /var/run/docker.sock or run runner as root.\n"
            f"docker info stderr:\n{probe.stderr}"
        )


def _zip_dir_to_base64(dir_path: str) -> str:
    # Create zip in the same base dir to ensure atomic moves/access
    base_dir = os.path.dirname(dir_path)
    fd, zip_path = tempfile.mkstemp(suffix=".zip", dir=base_dir)
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
    runner_preflight()

    job_id = str(uuid.uuid4())
    
    # ✅ FIX: Handle Docker-in-Docker path mapping logic.
    # MATRIXLAB_LOCAL_JOBS_DIR: Where THIS container writes files (default: /app/runner_tmp)
    # MATRIXLAB_HOST_JOBS_DIR:  Where the HOST Docker Daemon sees those files (default: same)
    
    local_jobs_root = os.environ.get("MATRIXLAB_LOCAL_JOBS_DIR", os.path.join(os.getcwd(), "runner_tmp"))
    # If not provided, assume we are not in DinD mode or paths match
    host_jobs_root = os.environ.get("MATRIXLAB_HOST_JOBS_DIR", local_jobs_root)

    # Ensure local directory exists so we can write to it
    os.makedirs(local_jobs_root, exist_ok=True)

    # 1. Create the unique job directory LOCALLY
    local_job_dir = tempfile.mkdtemp(prefix=f"job-{job_id}-", dir=local_jobs_root)

    # 2. Calculate the corresponding HOST path
    # e.g. Local: /app/runner_tmp/job-123
    #      Host:  /mnt/c/workspace/runner_tmp/job-123
    rel_path = os.path.relpath(local_job_dir, local_jobs_root)
    host_job_dir = os.path.join(host_jobs_root, rel_path)

    # 3. Create subdirectories locally
    local_out_dir = os.path.join(local_job_dir, "out")
    local_ws_dir = os.path.join(local_job_dir, "ws")
    os.makedirs(local_out_dir, exist_ok=True)
    os.makedirs(local_ws_dir, exist_ok=True)

    # 4. Define Host paths for Docker Volume mounting
    host_out_dir = os.path.join(host_job_dir, "out")
    host_ws_dir = os.path.join(host_job_dir, "ws")

    # ✅ FIX: Open permissions (777) so the Sandbox container (which might run as non-root)
    # can write to these folders created by the Runner (which runs as root).
    subprocess.run(["chmod", "-R", "777", local_job_dir], check=False)

    # ensure /output has a marker
    try:
        with open(os.path.join(local_out_dir, "_runner.txt"), "w", encoding="utf-8") as f:
            f.write("runner_ok=1\n")
    except Exception:
        pass

    results: List[StepResult] = []

    pull_policy = os.environ.get("MATRIXLAB_DOCKER_PULL", "missing").strip()
    pull_args: List[str] = []
    if pull_policy in ("always", "missing", "never"):
        pull_args = ["--pull", pull_policy]

    for step in req.steps:
        network_flag = ["--network", "none"] if step.network == "none" else ["--network", "bridge"]
        container_name = f"mlab-{job_id[:8]}-{step.name[:10]}-{uuid.uuid4().hex[:4]}"

        docker_cmd = [
            "docker",
            "run",
            "--rm",
            "--name",
            container_name,
            "--init",
            # Run as root inside sandbox to avoid permission issues? 
            # Ideally not, but if 777 is set, user doesn't matter.
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
            "--ipc",
            "none",
            "--workdir",
            "/workspace",
            # ✅ FIX: Mount using HOST paths
            "-v",
            f"{host_ws_dir}:/workspace:rw",
            "-v",
            f"{host_out_dir}:/output:rw",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,size=256m",
        ] + network_flag + pull_args + [
            req.sandbox_image,
            "bash",
            "-lc",
        ]

        env_exports = ""
        if step.env:
            env_exports = " ".join([f"{shlex.quote(k)}={shlex.quote(v)}" for k, v in step.env.items()])

        step_script = f"""
set -euo pipefail
mkdir -p /output
export HOME=/workspace
export OUTPUT_DIR=/output
{f"export {env_exports}" if env_exports else ""}

echo "== Matrix Lab step: {step.name} =="
{step.command}
"""

        try:
            # We append the script as the argument to bash -lc
            out = _run_local(docker_cmd + [step_script], timeout=step.timeout_seconds)
            results.append(
                StepResult(
                    name=step.name,
                    exit_code=out.exit_code,
                    stdout=out.stdout,
                    stderr=out.stderr,
                )
            )

            # Debug marker
            try:
                with open(os.path.join(local_out_dir, "_last_step.txt"), "w", encoding="utf-8") as f:
                    f.write(f"name={step.name}\nexit_code={out.exit_code}\n")
            except Exception:
                pass

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

        except FileNotFoundError as e:
            results.append(
                StepResult(
                    name=step.name,
                    exit_code=999,
                    stdout="",
                    stderr=f"Runner error: docker CLI not found.\n{e}",
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

    # Read artifacts from LOCAL path (where python can see them)
    artifacts_b64: Optional[str] = _zip_dir_to_base64(local_out_dir)
    
    # Cleanup (optional, but good for local dev)
    # import shutil
    # shutil.rmtree(local_job_dir, ignore_errors=True)

    return {
        "job_id": job_id,
        "results": [r.model_dump() for r in results],
        "artifacts_zip_base64": artifacts_b64,
    }


# =============================================================================
# Health Check Helpers
# =============================================================================

def docker_info() -> dict:
    try:
        out = _run_local(["docker", "version"], timeout=5)
        ok = out.exit_code == 0
        return {
            "ok": ok,
            "exit_code": out.exit_code,
            "stdout": out.stdout[-2000:],
            "stderr": out.stderr[-2000:],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _image_exists(image: str) -> bool:
    out = _run_local(["docker", "image", "inspect", image], timeout=5)
    return out.exit_code == 0


def sandbox_selftest() -> dict:
    images = {
        "utils": ("matrix-lab-sandbox-utils:latest", "sh -lc 'command -v find && command -v rg && command -v unzip && echo OK'"),
        "python": ("matrix-lab-sandbox-python:latest", "sh -lc 'python -V && pip -V && echo OK'"),
        "node": ("matrix-lab-sandbox-node:latest", "sh -lc 'node -v && npm -v && echo OK'"),
        "go": ("matrix-lab-sandbox-go:latest", "sh -lc 'go version && echo OK'"),
        "rust": ("matrix-lab-sandbox-rust:latest", "sh -lc 'rustc -V && cargo -V && echo OK'"),
    }

    results = {"status": "ok", "sandboxes": {}}
    docker_ok = docker_info().get("ok")
    if not docker_ok:
        results["status"] = "error"
        results["error"] = "docker not available to runner"
        return results

    for name, (img, cmd) in images.items():
        if not _image_exists(img):
            results["sandboxes"][name] = {"ok": False, "error": f"image not found locally: {img}"}
            results["status"] = "degraded"
            continue

        p = _run_local(["docker", "run", "--rm", img, "bash", "-lc", cmd], timeout=30)
        results["sandboxes"][name] = {
            "ok": p.exit_code == 0,
            "exit_code": p.exit_code,
            "stdout": p.stdout[-2000:],
            "stderr": p.stderr[-2000:],
            "image": img,
        }
        if p.exit_code != 0:
            results["status"] = "degraded"

    return results