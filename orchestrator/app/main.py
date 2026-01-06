from __future__ import annotations

import base64
import json
import os
import tempfile
import time
import zipfile
from typing import Optional

from .client import RunnerClient
from .detect import detection_steps
from .pipelines import pipeline_for


def _extract_artifacts_zip_b64(artifacts_zip_base64: Optional[str]) -> str:
    if not artifacts_zip_base64:
        return ""

    data = base64.b64decode(artifacts_zip_base64)
    tmpdir = tempfile.mkdtemp(prefix="matrixlab-artifacts-")
    zpath = os.path.join(tmpdir, "artifacts.zip")
    with open(zpath, "wb") as f:
        f.write(data)

    with zipfile.ZipFile(zpath, "r") as z:
        z.extractall(tmpdir)

    return tmpdir


def _read_text_if_exists(path: str) -> Optional[str]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return None


def main() -> None:
    runner_url = os.environ.get("RUNNER_URL", "http://localhost:8000").rstrip("/")
    repo_url = os.environ.get("REPO_URL", "https://github.com/pallets/flask.git")
    ref = os.environ.get("REPO_REF", "main")
    run_command = os.environ.get("RUN_COMMAND")  # optional override

    client = RunnerClient(runner_url)

    # Wait for runner
    print(f"[orchestrator] waiting for runner at {runner_url} ...")
    for _ in range(30):
        try:
            h = client.health()
            if h.get("status") == "ok":
                break
        except Exception:
            time.sleep(1)
    else:
        raise SystemExit("[orchestrator] runner not healthy")

    # 1) Detect language inside sandbox-utils (no host clone)
    detect_payload = {
        "repo_url": repo_url,
        "ref": ref,
        "cpu_limit": 0.5,
        "mem_limit_mb": 512,
        "pids_limit": 128,
        "sandbox_image": "matrix-lab-sandbox-utils:latest",
        "steps": detection_steps(repo_url, ref),
    }

    print("[orchestrator] detecting language (in sandbox-utils)...")
    detect_res = client.run(detect_payload)

    artifacts_dir = _extract_artifacts_zip_b64(detect_res.get("artifacts_zip_base64"))
    lang = _read_text_if_exists(os.path.join(artifacts_dir, "lang.txt")) if artifacts_dir else None
    language = (lang or "unknown").strip()

    print(f"[orchestrator] detected language: {language}")

    # 2) Build pipeline and run real job
    pipeline = pipeline_for(language, repo_url, ref, run_command)
    payload = {
        "repo_url": repo_url,
        "ref": ref,
        "cpu_limit": 1.0,
        "mem_limit_mb": 1024,
        "pids_limit": 256,
        "sandbox_image": pipeline["sandbox_image"],
        "steps": pipeline["steps"],
    }

    print("[orchestrator] sending job request...")
    res = client.run(payload)

    print("[orchestrator] job completed:")
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
