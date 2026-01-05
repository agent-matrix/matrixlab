import json
import os
import shutil
import subprocess
import tempfile
import time

from .client import RunnerClient
from .detect import detect_language
from .pipelines import pipeline_for


def shallow_clone_for_detection(repo_url: str, ref: str) -> str:
    """Clone repo locally ONLY to inspect files (no code execution)."""
    tmpdir = tempfile.mkdtemp(prefix="matrixlab-detect-")
    repo_path = os.path.join(tmpdir, "repo")

    subprocess.run(["git", "clone", "--depth=1", repo_url, repo_path], check=True)

    if ref:
        # checkout best-effort; if it fails, keep default branch
        subprocess.run(["git", "-C", repo_path, "checkout", ref], check=False)

    return repo_path


def main():
    runner_url = os.environ.get("RUNNER_URL", "http://localhost:8000")
    repo_url = os.environ.get("REPO_URL", "https://github.com/pallets/flask.git")
    ref = os.environ.get("REPO_REF", "main")
    run_command = os.environ.get("RUN_COMMAND")  # optional override

    print(f"[orchestrator] waiting for runner at {runner_url} ...")
    time.sleep(2)

    detect_repo_path = None
    language = "unknown"

    try:
        detect_repo_path = shallow_clone_for_detection(repo_url, ref)
        language = detect_language(detect_repo_path)
    except Exception as e:
        print(f"[orchestrator] detection failed: {e}")
    finally:
        if detect_repo_path:
            shutil.rmtree(os.path.dirname(detect_repo_path), ignore_errors=True)

    print(f"[orchestrator] detected language: {language}")

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

    client = RunnerClient(runner_url)

    print("[orchestrator] sending job request...")
    res = client.run(payload)
    print("[orchestrator] job completed:")
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
