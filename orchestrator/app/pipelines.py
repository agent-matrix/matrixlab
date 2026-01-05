from typing import Dict, Any, Optional


def pipeline_for(language: str, repo_url: str, ref: Optional[str], run_command: Optional[str]) -> Dict[str, Any]:
    checkout = f"git checkout {ref}" if ref else "true"

    if language == "python":
        sandbox_image = "matrix-lab-sandbox-python:latest"
        test_cmd = run_command or "(pytest -q || python -m unittest discover || python -m compileall .)"
        return {
            "sandbox_image": sandbox_image,
            "steps": [
                {
                    "name": "clone",
                    "network": "egress",
                    "timeout_seconds": 180,
                    "command": f"rm -rf repo && git clone --depth=1 {repo_url} repo && cd repo && {checkout}",
                },
                {
                    "name": "venv",
                    "network": "none",
                    "timeout_seconds": 120,
                    "command": "cd repo && python -m venv .venv && . .venv/bin/activate && python -V",
                },
                {
                    "name": "install",
                    "network": "egress",
                    "timeout_seconds": 420,
                    "command": (
                        "cd repo && . .venv/bin/activate && "
                        "if [ -f requirements.txt ]; then pip install -r requirements.txt; "
                        "elif [ -f pyproject.toml ] || [ -f setup.py ]; then pip install -e .; "
                        "else echo 'No python install config; skipping.'; fi"
                    ),
                },
                {
                    "name": "test",
                    "network": "none",
                    "timeout_seconds": 420,
                    "command": f"cd repo && . .venv/bin/activate && {test_cmd} && echo ok > /output/ok.txt",
                },
            ],
        }

    if language == "go":
        sandbox_image = "matrix-lab-sandbox-go:latest"
        test_cmd = run_command or "go test ./..."
        return {
            "sandbox_image": sandbox_image,
            "steps": [
                {
                    "name": "clone",
                    "network": "egress",
                    "timeout_seconds": 180,
                    "command": f"rm -rf repo && git clone --depth=1 {repo_url} repo && cd repo && {checkout}",
                },
                {
                    "name": "test",
                    "network": "egress",
                    "timeout_seconds": 420,
                    "command": f"cd repo && {test_cmd} && echo ok > /output/ok.txt",
                },
                {
                    "name": "build",
                    "network": "none",
                    "timeout_seconds": 420,
                    "command": "cd repo && go build ./... && echo build_ok > /output/build.txt",
                },
            ],
        }

    if language == "rust":
        sandbox_image = "matrix-lab-sandbox-rust:latest"
        test_cmd = run_command or "cargo test"
        return {
            "sandbox_image": sandbox_image,
            "steps": [
                {
                    "name": "clone",
                    "network": "egress",
                    "timeout_seconds": 180,
                    "command": f"rm -rf repo && git clone --depth=1 {repo_url} repo && cd repo && {checkout}",
                },
                {
                    "name": "test",
                    "network": "egress",
                    "timeout_seconds": 600,
                    "command": f"cd repo && {test_cmd} && echo ok > /output/ok.txt",
                },
                {
                    "name": "build",
                    "network": "none",
                    "timeout_seconds": 600,
                    "command": "cd repo && cargo build --release && echo build_ok > /output/build.txt",
                },
            ],
        }

    if language == "node":
        sandbox_image = "matrix-lab-sandbox-node:latest"
        test_cmd = run_command or "npm test --silent"
        return {
            "sandbox_image": sandbox_image,
            "steps": [
                {
                    "name": "clone",
                    "network": "egress",
                    "timeout_seconds": 180,
                    "command": f"rm -rf repo && git clone --depth=1 {repo_url} repo && cd repo && {checkout}",
                },
                {
                    "name": "install",
                    "network": "egress",
                    "timeout_seconds": 420,
                    "command": (
                        "cd repo && "
                        "if [ -f package-lock.json ]; then npm ci; "
                        "else npm install; fi"
                    ),
                },
                {
                    "name": "test",
                    "network": "none",
                    "timeout_seconds": 420,
                    "command": f"cd repo && {test_cmd} && echo ok > /output/ok.txt",
                },
            ],
        }

    # Unknown: clone + list
    return {
        "sandbox_image": "matrix-lab-sandbox-python:latest",
        "steps": [
            {
                "name": "clone",
                "network": "egress",
                "timeout_seconds": 180,
                "command": f"rm -rf repo && git clone --depth=1 {repo_url} repo && cd repo && {checkout}",
            },
            {
                "name": "inspect",
                "network": "none",
                "timeout_seconds": 60,
                "command": "cd repo && ls -la && echo unknown_language > /output/language.txt",
            },
        ],
    }
