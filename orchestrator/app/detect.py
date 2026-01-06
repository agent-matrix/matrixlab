from __future__ import annotations

from typing import Any, Dict, Optional


def detection_steps(repo_url: str, ref: Optional[str]) -> list[Dict[str, Any]]:
    """
    Steps that run inside sandbox-utils to detect language deterministically.
    Produces /output/lang.txt.
    """
    checkout = f"git checkout {ref}" if ref else "true"

    detect_script = r"""
set -euo pipefail
cd /workspace
rm -rf repo
git clone --depth=1 "$REPO_URL" repo
cd repo
""" + checkout + r"""
# Deterministic language detection
lang="unknown"
if [ -f go.mod ]; then lang="go"; fi
if [ -f Cargo.toml ]; then lang="rust"; fi
if [ -f package.json ]; then lang="node"; fi
if [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f setup.py ]; then lang="python"; fi

echo "$lang" | tee /output/lang.txt
"""

    return [
        {
            "name": "clone_detect",
            "network": "egress",
            "timeout_seconds": 180,
            "env": {"REPO_URL": repo_url},
            "command": detect_script,
        }
    ]
