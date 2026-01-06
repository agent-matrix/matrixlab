#!/usr/bin/env python3
"""
tools/bootstrap.py

Bootstrap helper for MatrixLab:
- Checks Runner health endpoint
- If Runner is down and MATRIXLAB_AUTOSTART=1, starts docker compose services
- Waits for Runner to become healthy
- Execs matrixlab-mcp (stdio MCP server)

Works on Linux/macOS/WSL/Windows (as long as docker + docker compose are available).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from typing import List, Optional


def env_flag(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


def http_ok(url: str, timeout_s: float = 1.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, TimeoutError, ConnectionResetError):
        return False


def which_or_die(bin_name: str) -> str:
    p = shutil.which(bin_name)
    if not p:
        raise RuntimeError(f"Missing required executable in PATH: {bin_name}")
    return p


def run_cmd(cmd: List[str], *, check: bool = True) -> int:
    # Print command in a friendly way
    print(f"[bootstrap] $ {' '.join(cmd)}", file=sys.stderr)
    p = subprocess.run(cmd)
    if check and p.returncode != 0:
        raise RuntimeError(f"Command failed (exit={p.returncode}): {' '.join(cmd)}")
    return p.returncode


def docker_compose_cmd() -> List[str]:
    """
    Prefer `docker compose` (v2). Fallback to `docker-compose` (v1).
    """
    if shutil.which("docker"):
        # check if `docker compose` works
        try:
            subprocess.run(["docker", "compose", "version"], capture_output=True, text=True, check=False)
            return ["docker", "compose"]
        except Exception:
            pass
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    raise RuntimeError("Neither `docker compose` nor `docker-compose` found in PATH.")


def start_services(compose_services: List[str], build: bool = True) -> None:
    compose = docker_compose_cmd()
    cmd = compose + ["up", "-d"]
    if build:
        cmd.append("--build")
    cmd += compose_services
    run_cmd(cmd, check=True)


def wait_for_runner(runner_url: str, retries: int = 40, sleep_s: float = 1.0) -> None:
    health_url = runner_url.rstrip("/") + "/health"
    for i in range(1, retries + 1):
        if http_ok(health_url, timeout_s=1.5):
            print("[bootstrap] ✅ Runner is healthy", file=sys.stderr)
            return
        print(f"[bootstrap] ⏳ waiting for Runner... ({i}/{retries})", file=sys.stderr)
        time.sleep(sleep_s)
    raise RuntimeError(f"Runner did not become healthy at {health_url} after {retries} seconds")


def exec_mcp() -> None:
    """
    Exec matrixlab-mcp so signals (Ctrl+C) work and process tree is clean.
    """
    # matrixlab-mcp should be on PATH if installed into venv and venv activated.
    mcp_bin = shutil.which("matrixlab-mcp") or shutil.which("matrixlab-mcp.exe")
    if not mcp_bin:
        raise RuntimeError(
            "Could not find `matrixlab-mcp` on PATH. "
            "Activate your venv or install the package (pip install -e .)."
        )

    print(f"[bootstrap] ▶ exec {mcp_bin}", file=sys.stderr)
    os.execv(mcp_bin, [mcp_bin])


def main() -> int:
    runner_url = os.environ.get("RUNNER_URL", "http://localhost:8000").rstrip("/")
    autostart = env_flag("MATRIXLAB_AUTOSTART", "1")

    health_url = runner_url + "/health"

    # Basic tool checks
    if autostart:
        which_or_die("docker")

    if http_ok(health_url, timeout_s=1.0):
        print("[bootstrap] Runner already up", file=sys.stderr)
        exec_mcp()
        return 0

    # Runner is down
    if not autostart:
        print(
            "[bootstrap] ❌ Runner is not reachable, and MATRIXLAB_AUTOSTART=0.\n"
            f"[bootstrap]   Runner health URL: {health_url}\n"
            "[bootstrap]   Start it with:\n"
            "             docker compose up -d --build runner sandbox-utils sandbox-python sandbox-go sandbox-rust sandbox-node\n"
            "             OR re-run with MATRIXLAB_AUTOSTART=1",
            file=sys.stderr,
        )
        return 2

    print("[bootstrap] 🚀 Runner not reachable. Autostart enabled → starting services...", file=sys.stderr)

    # Start minimal set needed for workflow
    services = [
        "runner",
        "sandbox-utils",
        "sandbox-python",
        "sandbox-node",
        "sandbox-go",
        "sandbox-rust",
    ]
    start_services(services, build=True)
    wait_for_runner(runner_url, retries=90, sleep_s=1.0)

    exec_mcp()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as e:
        print(f"[bootstrap] ERROR: {e}", file=sys.stderr)
        raise SystemExit(1)
