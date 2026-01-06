import json
import os
import subprocess
import sys
import time
from typing import Any, Dict, Optional


def _send(proc: subprocess.Popen, msg: Dict[str, Any]) -> None:
    line = json.dumps(msg)
    assert proc.stdin is not None
    proc.stdin.write(line + "\n")
    proc.stdin.flush()


def _recv(proc: subprocess.Popen, timeout_s: float = 10.0) -> Dict[str, Any]:
    """
    Read one JSON-RPC message from MCP server stdout.
    Ignores blank lines and any non-JSON noise.
    """
    assert proc.stdout is not None
    start = time.time()

    while True:
        if time.time() - start > timeout_s:
            raise TimeoutError("Timed out waiting for MCP server response")

        line = proc.stdout.readline()
        if not line:
            time.sleep(0.05)
            continue

        line = line.strip()
        if not line:
            continue

        # Some environments can emit stray output; ignore anything that isn't JSON.
        try:
            return json.loads(line)
        except json.JSONDecodeError:
            continue


def _start_server(env: Dict[str, str]) -> subprocess.Popen:
    """
    Start MCP server using the installed console script if available,
    otherwise fall back to running the module file directly.
    """
    # Prefer installed console script (production)
    mcp_cli = os.path.join(os.path.dirname(sys.executable), "matrixlab-mcp")
    if os.path.exists(mcp_cli):
        cmd = [mcp_cli]
    else:
        # Fallback: run the local module file
        cmd = [sys.executable, "-m", "matrixlab.mcp_server"]

    return subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        bufsize=1,
    )


def main() -> int:
    runner_url = os.environ.get("RUNNER_URL", "http://localhost:8000").rstrip("/")

    env = os.environ.copy()
    env["RUNNER_URL"] = runner_url

    proc = _start_server(env)

    try:
        # 1) initialize
        init_id = 1
        _send(
            proc,
            {
                "jsonrpc": "2.0",
                "id": init_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "matrixlab-inspector", "version": "0.1.0"},
                },
            },
        )
        resp = _recv(proc, timeout_s=15.0)
        print("✅ initialize response:")
        print(json.dumps(resp, indent=2))

        # 2) initialized notification (CORRECT METHOD)
        # MCP expects: notifications/initialized
        _send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

        # 3) tools/list
        tools_id = 2
        _send(proc, {"jsonrpc": "2.0", "id": tools_id, "method": "tools/list", "params": {}})
        resp2 = _recv(proc, timeout_s=15.0)
        print("\n✅ tools/list response:")
        print(json.dumps(resp2, indent=2))

        # pass/fail
        if (
            isinstance(resp2, dict)
            and "result" in resp2
            and isinstance(resp2["result"], dict)
            and "tools" in resp2["result"]
        ):
            print("\n✅ MCP Inspector OK: tools discovered")
            return 0

        print("\n⚠️ MCP Inspector: unexpected tools/list shape")
        return 2

    except Exception as e:
        print(f"\n❌ MCP Inspector failed: {e}")

        # Print server stderr (very useful)
        try:
            if proc.stderr is not None:
                time.sleep(0.2)
                err_out = proc.stderr.read()
                if err_out:
                    print("\n--- MCP server stderr ---")
                    print(err_out)
        except Exception:
            pass

        return 1

    finally:
        try:
            proc.terminate()
        except Exception:
            pass


def cli() -> None:
    raise SystemExit(main())


if __name__ == "__main__":
    raise SystemExit(main())
