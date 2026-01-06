import os
import shutil
import subprocess
import sys
from pathlib import Path

# -----------------------------------------
# Config
# -----------------------------------------
# Prefer the installed console script. If not found, fallback to `python -m matrixlab.mcp_server`
MCP_SERVER_CMD = ["matrixlab-mcp"]

# Optional: pin inspector version for enterprise reproducibility
# You can change to "@modelcontextprotocol/inspector@<version>" if desired.
INSPECTOR_PKG = "@modelcontextprotocol/inspector"

# Environment passed to MCP server
RUNNER_URL = os.environ.get("RUNNER_URL", "http://localhost:8000").rstrip("/")
LOG_LEVEL = os.environ.get("MATRIXLAB_LOG_LEVEL", "INFO")

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _is_windows() -> bool:
    return sys.platform.startswith("win")


def _need(cmd: str) -> str:
    path = shutil.which(cmd)
    if not path:
        print(f"❌ Missing dependency: '{cmd}' not found in PATH.")
        sys.exit(1)
    return path


def _ensure_python_deps() -> None:
    req = PROJECT_ROOT / "tools" / "requirements.txt"
    if req.exists():
        print("📦 Ensuring Python dependencies are installed...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(req)])


def _resolve_server_cmd() -> list[str]:
    # Prefer the installed entrypoint if available
    # On venv, it lives next to python executable.
    exe_dir = Path(sys.executable).resolve().parent
    venv_cli = exe_dir / ("matrixlab-mcp.exe" if _is_windows() else "matrixlab-mcp")

    if venv_cli.exists():
        return [str(venv_cli)]

    # If `matrixlab-mcp` is on PATH, use it
    if shutil.which("matrixlab-mcp"):
        return ["matrixlab-mcp"]

    # Fallback: run as module
    return [sys.executable, "-m", "matrixlab.mcp_server"]


def main() -> int:
    print("🧪 MatrixLab — MCP Inspector UI Launcher")
    print("----------------------------------------")

    # 1) Optional deps
    _ensure_python_deps()

    # 2) Check Node tooling
    _need("npx")

    # 3) Resolve server command
    server_cmd = _resolve_server_cmd()
    print(f"✅ MCP Server command: {' '.join(server_cmd)}")

    # 4) Set env for the MCP server
    env = os.environ.copy()
    env["RUNNER_URL"] = RUNNER_URL
    env["MATRIXLAB_LOG_LEVEL"] = LOG_LEVEL

    print(f"✅ RUNNER_URL={RUNNER_URL}")
    print(f"✅ MATRIXLAB_LOG_LEVEL={LOG_LEVEL}")
    print("")
    print("🚀 Launching MCP Inspector UI...")
    print("   - A browser window should open.")
    print("   - If it doesn't, check the terminal output for the local URL.")
    print("   - Press Ctrl+C to stop.")
    print("")

    # 5) Run Inspector
    # Inspector usage: npx @modelcontextprotocol/inspector <server command...>
    cmd = ["npx", "-y", INSPECTOR_PKG] + server_cmd

    try:
        # On Windows, shell=True helps resolve npx properly.
        subprocess.run(cmd, env=env, check=False, shell=_is_windows())
        return 0
    except KeyboardInterrupt:
        print("\n🛑 Stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
