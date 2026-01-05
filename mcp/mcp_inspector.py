import json
import os
import subprocess
import sys
import time
from typing import Any, Dict


def _send(proc: subprocess.Popen, msg: Dict[str, Any]) -> None:
    line = json.dumps(msg)
    assert proc.stdin is not None
    proc.stdin.write(line + "\n")
    proc.stdin.flush()


def _recv(proc: subprocess.Popen, timeout_s: float = 5.0) -> Dict[str, Any]:
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
        return json.loads(line)


def main() -> int:
    runner_url = os.environ.get("RUNNER_URL", "http://localhost:8000")

    # Start MCP server as a subprocess (stdio transport)
    env = os.environ.copy()
    env["RUNNER_URL"] = runner_url

    proc = subprocess.Popen(
        [sys.executable, os.path.join(os.path.dirname(__file__), "mcp_server.py")],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        bufsize=1,
    )

    try:
        # MCP uses JSON-RPC style messages. This inspector uses a minimal sequence.
        # If the MCP SDK changes the framing, you'll see stderr printed for debugging.
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
                    "clientInfo": {"name": "matrix-lab-inspector", "version": "0.1.0"},
                },
            },
        )
        resp = _recv(proc, timeout_s=8.0)
        print("✅ initialize response:")
        print(json.dumps(resp, indent=2))

        # Some implementations require an "initialized" notification.
        _send(proc, {"jsonrpc": "2.0", "method": "initialized", "params": {}})

        # Request tools list
        tools_id = 2
        _send(proc, {"jsonrpc": "2.0", "id": tools_id, "method": "tools/list", "params": {}})
        resp2 = _recv(proc, timeout_s=8.0)
        print("\n✅ tools/list response:")
        print(json.dumps(resp2, indent=2))

        # Basic pass/fail
        if "result" in resp2 and isinstance(resp2["result"], dict) and "tools" in resp2["result"]:
            print("\n✅ MCP Inspector OK: tools discovered")
            return 0

        print("\n⚠️ MCP Inspector: unexpected tools/list shape")
        return 2

    except Exception as e:
        print(f"\n❌ MCP Inspector failed: {e}")
        try:
            err = proc.stderr.read()
            if err:
                print("\n--- MCP server stderr ---")
                print(err)
        except Exception:
            pass
        return 1

    finally:
        try:
            proc.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
