"""Always-on verification of the top featured MCP servers against the sandbox.

This fetches the top entries from the **real** Matrix Hub API (no hardcoded
ids) and runs the sandbox-testability verifier on each, so we continuously know
which featured servers can be trialed in the no-secrets sandbox and which are
tagged "not available" (and why).

Run:
    cd hf && python -m pytest tests/test_featured_sandbox.py -v -s

Network: hits https://api.matrixhub.io. If unreachable, network-dependent tests
skip (so the suite stays green offline). Set MATRIXLAB_SANDBOX_LIVE=1 and
MATRIXLAB_SANDBOX_URL=<worker> to additionally start real sandbox sessions for
the testable servers.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # hf/
from app.plan import verify, is_testable  # noqa: E402

try:
    import requests
except Exception:  # pragma: no cover
    requests = None

HUB = os.environ.get("MATRIX_HUB_BASE", "https://api.matrixhub.io").rstrip("/")
TOP_N = int(os.environ.get("FEATURED_TOP_N", "5"))


def _get(path: str):
    if requests is None:
        pytest.skip("requests not installed")
    try:
        r = requests.get(HUB + path, timeout=15, headers={"Accept": "application/json"})
        r.raise_for_status()
        return r.json()
    except Exception as e:  # network / hub down -> skip, keep suite green offline
        pytest.skip(f"Matrix Hub unreachable ({HUB}): {e}")


def _featured_top():
    """Top featured entries from the real catalog (mirrors the homepage feed)."""
    data = _get(f"/catalog?limit={TOP_N}&sort=quality")
    items = data.get("items") or data.get("entities") or []
    return items[:TOP_N]


# --- always-on: the real top-5 featured servers ----------------------------

def test_real_api_returns_featured():
    items = _featured_top()
    assert items, "real Matrix Hub returned no featured items"
    assert all(it.get("id") for it in items), "featured items missing ids"


def test_verifier_classifies_top5_featured():
    """The verifier must produce a clear testable/not verdict for every one of
    the live top-5 featured servers (this is the 'tag' the UI shows)."""
    items = _featured_top()
    print(f"\nSandbox testability of top {len(items)} featured (live from {HUB}):")
    for it in items:
        v = verify(it)
        tag = "● available" if v["testable"] else "○ not available"
        print(f"  {tag:16} {it.get('name') or it.get('id')}")
        print(f"      id={it.get('id')}")
        print(f"      reason: {v['reason']}")
        if v["testable"]:
            print(f"      run: {v['start_command']}")
        # contract: every entry yields a boolean verdict + a non-empty reason
        assert isinstance(v["testable"], bool)
        assert v["reason"]
        if v["testable"]:
            assert v["start_command"] and v["runtime"] in ("node", "python")


# --- deterministic verifier contract (no network) --------------------------

@pytest.mark.parametrize("entity,expected", [
    ({"id": "mcp.io-github-modelcontextprotocol-servers.filesystem",
      "name": "Filesystem", "source_url": "https://github.com/modelcontextprotocol/servers"}, True),
    ({"id": "x", "name": "Time", "source_url": "https://github.com/x/mcp-server-time"}, True),
    ({"id": "tool.io-github-mindstone-mcp-server-retell-ai.5425b3de29",
      "name": "Retell AI", "source_url": "https://github.com/mindstone/retell"}, False),
    ({"id": "tool.x", "name": "Microsoft Office", "source_url": "https://github.com/x/office"}, False),
    ({"id": "mcp.some-unknown-server", "name": "Unknown", "source_url": "https://github.com/x/y"}, False),
])
def test_verifier_contract(entity, expected):
    assert is_testable(entity) is expected


def test_saas_reason_mentions_credentials():
    v = verify({"id": "x", "name": "Retell AI", "source_url": ""})
    assert v["testable"] is False
    assert "credential" in v["reason"].lower()


# --- opt-in: actually run the testable servers in a live sandbox -----------

@pytest.mark.skipif(os.environ.get("MATRIXLAB_SANDBOX_LIVE") != "1",
                    reason="set MATRIXLAB_SANDBOX_LIVE=1 (+ MATRIXLAB_SANDBOX_URL) to run live")
def test_live_sandbox_runs_testable_featured():
    base = os.environ.get("MATRIXLAB_SANDBOX_URL", "http://127.0.0.1:7860").rstrip("/")
    # Use a known-good packaged server (proves the install->run->tools path).
    plan = verify({"id": "filesystem", "name": "Filesystem",
                   "source_url": "https://github.com/modelcontextprotocol/servers"})
    assert plan["testable"]
    r = requests.post(f"{base}/mcp/sessions", timeout=30, json={
        "entity_id": "test-filesystem", "runtime": plan["runtime"],
        "start_command": plan["start_command"], "transport": "stdio", "ttl_seconds": 120,
    })
    r.raise_for_status()
    sid = r.json()["session_id"]
    try:
        status = ""
        for _ in range(40):
            status = requests.get(f"{base}/mcp/sessions/{sid}", timeout=15).json()["status"]
            if status in ("running", "failed", "timeout", "install_failed", "start_failed"):
                break
            time.sleep(2)
        assert status == "running", f"sandbox status={status}"
        tools = requests.get(f"{base}/mcp/sessions/{sid}/tools", timeout=15).json().get("tools", [])
        assert len(tools) > 0, "no tools discovered"
    finally:
        requests.delete(f"{base}/mcp/sessions/{sid}", timeout=15)
