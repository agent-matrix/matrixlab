from __future__ import annotations

from typing import Any, Dict, Optional


def pipeline_for(language: str, repo_url: str, ref: Optional[str], run_command: Optional[str]) -> Dict[str, Any]:
    checkout = f"git checkout {ref}" if ref else "true"

    # Common clone step (executed in the selected language sandbox)
    clone_step = {
        "name": "clone",
        "network": "egress",
        "timeout_seconds": 180,
        "command": f"rm -rf repo && git clone --depth=1 {repo_url} repo && cd repo && {checkout}",
    }

    if language == "python":
        test_cmd = run_command or "(pytest -q || python -m unittest discover || python -m compileall .)"
        return {
            "sandbox_image": "matrix-lab-sandbox-python:latest",
            "steps": [
                clone_step,
                {
                    "name": "venv",
                    "network": "none",
                    "timeout_seconds": 180,
                    "command": r"""
set -euo pipefail
cd repo
python -m venv .venv
. .venv/bin/activate
python -V
pip -V
""",
                },
                {
                    "name": "install",
                    "network": "egress",
                    "timeout_seconds": 600,
                    "env": {
                        "PIP_CACHE_DIR": "/workspace/.cache/pip",
                        "PIP_DISABLE_PIP_VERSION_CHECK": "1",
                    },
                    "command": r"""
set -euo pipefail
cd repo
. .venv/bin/activate

if [ -f requirements.txt ]; then
  pip install -r requirements.txt
elif [ -f pyproject.toml ] || [ -f setup.py ]; then
  pip install -e .
else
  echo "No python install config; skipping install."
fi
""",
                },
                {
                    "name": "test",
                    "network": "none",
                    "timeout_seconds": 600,
                    "command": rf"""
set -euo pipefail
cd repo
. .venv/bin/activate
{test_cmd}
echo ok > /output/ok.txt
echo python > /output/lang.txt
""",
                },
            ],
        }

    if language == "node":
        test_cmd = run_command or "npm test --silent"
        return {
            "sandbox_image": "matrix-lab-sandbox-node:latest",
            "steps": [
                clone_step,
                {
                    "name": "install",
                    "network": "egress",
                    "timeout_seconds": 600,
                    "env": {"NPM_CONFIG_CACHE": "/workspace/.cache/npm"},
                    "command": r"""
set -euo pipefail
cd repo

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
""",
                },
                {
                    "name": "test",
                    "network": "none",
                    "timeout_seconds": 600,
                    "command": rf"""
set -euo pipefail
cd repo
{test_cmd}
echo ok > /output/ok.txt
echo node > /output/lang.txt
""",
                },
            ],
        }

    if language == "go":
        test_cmd = run_command or "go test ./..."
        return {
            "sandbox_image": "matrix-lab-sandbox-go:latest",
            "steps": [
                clone_step,
                {
                    "name": "test",
                    "network": "egress",
                    "timeout_seconds": 600,
                    "env": {
                        "GOMODCACHE": "/workspace/.cache/gomod",
                        "GOCACHE": "/workspace/.cache/gocache",
                    },
                    "command": rf"""
set -euo pipefail
cd repo
{test_cmd}
echo ok > /output/ok.txt
echo go > /output/lang.txt
""",
                },
                {
                    "name": "build",
                    "network": "none",
                    "timeout_seconds": 600,
                    "env": {
                        "GOMODCACHE": "/workspace/.cache/gomod",
                        "GOCACHE": "/workspace/.cache/gocache",
                    },
                    "command": r"""
set -euo pipefail
cd repo
go build ./...
echo build_ok > /output/build.txt
""",
                },
            ],
        }

    if language == "rust":
        test_cmd = run_command or "cargo test"
        return {
            "sandbox_image": "matrix-lab-sandbox-rust:latest",
            "steps": [
                clone_step,
                {
                    "name": "test",
                    "network": "egress",
                    "timeout_seconds": 900,
                    "env": {
                        "CARGO_HOME": "/workspace/.cargo",
                        "RUSTUP_HOME": "/workspace/.rustup",
                        "CARGO_TERM_COLOR": "never",
                    },
                    "command": rf"""
set -euo pipefail
cd repo
{test_cmd}
echo ok > /output/ok.txt
echo rust > /output/lang.txt
""",
                },
                {
                    "name": "build",
                    "network": "none",
                    "timeout_seconds": 900,
                    "env": {
                        "CARGO_HOME": "/workspace/.cargo",
                        "RUSTUP_HOME": "/workspace/.rustup",
                        "CARGO_TERM_COLOR": "never",
                    },
                    "command": r"""
set -euo pipefail
cd repo
cargo build --release
echo build_ok > /output/build.txt
""",
                },
            ],
        }

    # Unknown language: just clone + list
    return {
        "sandbox_image": "matrix-lab-sandbox-utils:latest",
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
                "command": r"""
set -euo pipefail
cd repo
ls -la
echo unknown > /output/lang.txt
""",
            },
        ],
    }
