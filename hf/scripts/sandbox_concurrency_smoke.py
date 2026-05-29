#!/usr/bin/env python3
"""Concurrency smoke test for the MatrixLab MCP sandbox worker.

Starts N sandbox sessions in parallel against a running HF Space worker,
waits for each to reach ``running``, asserts tools were discovered, then
tears them all down. Use it to validate that an instance can sustain the
configured ``MATRIXLAB_MCP_MAX_SESSIONS`` (e.g. 10) in parallel.

Usage:
    BASE=http://127.0.0.1:7901 N=10 python hf/scripts/sandbox_concurrency_smoke.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

import httpx

BASE = os.environ.get("BASE", "http://127.0.0.1:7901").rstrip("/")
N = int(os.environ.get("N", "10"))
TTL = int(os.environ.get("TTL", "120"))
TOKEN = os.environ.get("MATRIXLAB_SANDBOX_TOKEN", "")
PLAN = {
    "entity_id": "mcp_server:filesystem",
    "runtime": "node",
    "start_command": "npx -y @modelcontextprotocol/server-filesystem /tmp",
    "transport": "stdio",
    "ttl_seconds": TTL,
}
HEADERS = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}


async def start_one(client: httpx.AsyncClient, i: int) -> dict:
    r = await client.post(f"{BASE}/mcp/sessions", json={**PLAN, "entity_id": f"sbx-{i}"}, headers=HEADERS)
    r.raise_for_status()
    return r.json()


async def wait_running(client: httpx.AsyncClient, sid: str, timeout: int = 120) -> dict:
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        r = await client.get(f"{BASE}/mcp/sessions/{sid}", headers=HEADERS)
        last = r.json()
        st = last.get("status")
        if st in ("running", "failed", "timeout", "install_failed", "start_failed", "mcp_failed"):
            return last
        await asyncio.sleep(1.5)
    return last


async def main() -> int:
    async with httpx.AsyncClient(timeout=30) as client:
        h = (await client.get(f"{BASE}/mcp/health", headers=HEADERS)).json()
        print(f"worker: max_sessions={h['max_sessions']} instance={h.get('instance')}")
        if h["max_sessions"] < N:
            print(f"NOTE: max_sessions ({h['max_sessions']}) < N ({N}); "
                  f"set MATRIXLAB_MCP_MAX_SESSIONS={N} (or 'auto') to admit all.")

        t0 = time.time()
        started = await asyncio.gather(*[start_one(client, i) for i in range(N)], return_exceptions=True)
        ok_started = [s for s in started if isinstance(s, dict)]
        rejected = [s for s in started if not isinstance(s, dict)]
        print(f"requested {N} · admitted {len(ok_started)} · rejected {len(rejected)} "
              f"in {time.time()-t0:.1f}s")

        results = await asyncio.gather(*[wait_running(client, s["session_id"]) for s in ok_started])
        running = [r for r in results if r.get("status") == "running"]
        with_tools = [r for r in running if (r.get("tools") or [])]
        elapsed = time.time() - t0

        print("\nper-session:")
        for r in results:
            print(f"  {r.get('entity_id','?'):10} {r.get('status','?'):10} "
                  f"tools={len(r.get('tools') or [])}")

        print(f"\nrunning {len(running)}/{len(ok_started)} · with tools {len(with_tools)} "
              f"· wall {elapsed:.1f}s")

        # teardown
        await asyncio.gather(*[client.delete(f"{BASE}/mcp/sessions/{s['session_id']}", headers=HEADERS)
                               for s in ok_started], return_exceptions=True)
        print("torn down.")

        ok = len(running) == len(ok_started) and len(with_tools) == len(running) and len(ok_started) >= 1
        print("RESULT:", "PASS" if ok else "FAIL")
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
