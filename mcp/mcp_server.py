import os
import requests
from typing import Optional, Dict, Any

from mcp.server import Server
from mcp.server.stdio import stdio_server

RUNNER_URL = os.environ.get("RUNNER_URL", "http://localhost:8000").rstrip("/")
server = Server("matrix-lab")


def runner_run(payload: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.post(f"{RUNNER_URL}/run", json=payload, timeout=900)
    r.raise_for_status()
    return r.json()


@server.tool()
def repo_run(repo_url: str, ref: Optional[str] = None, command: str = "") -> Dict[str, Any]:
    """Clone/install/test in sandbox.

    Notes:
    - This MCP tool is intentionally conservative: it defaults to the Python sandbox.
    - For full multi-language pipelines, call the Orchestrator (or add language-detection here).
    """

    checkout = f"git checkout {ref}" if ref else "true"
    run_cmd = command.strip() or "pytest -q || python -m unittest discover || python -m compileall ."

    payload = {
        "repo_url": repo_url,
        "ref": ref,
        "sandbox_image": "matrix-lab-sandbox-python:latest",
        "cpu_limit": 1.0,
        "mem_limit_mb": 1024,
        "pids_limit": 256,
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
                "command": "cd repo && . .venv/bin/activate && (pip install -r requirements.txt || pip install -e . || true)",
            },
            {
                "name": "test",
                "network": "none",
                "timeout_seconds": 420,
                "command": f"cd repo && . .venv/bin/activate && {run_cmd} && echo ok > /output/ok.txt",
            },
        ],
    }

    try:
        return runner_run(payload)
    except Exception as e:
        return {"error": str(e), "runner_url": RUNNER_URL}


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
