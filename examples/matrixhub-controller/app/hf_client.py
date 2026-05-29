from __future__ import annotations

import os
from typing import Any, AsyncIterator

import httpx

HF_SPACE_URL = os.environ.get("HF_SPACE_URL", "").rstrip("/")
SANDBOX_TOKEN = os.environ.get("MATRIXLAB_SANDBOX_TOKEN", "")


def _headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if SANDBOX_TOKEN:
        headers["Authorization"] = f"Bearer {SANDBOX_TOKEN}"
    return headers


def _space_url(path: str) -> str:
    if not HF_SPACE_URL:
        raise RuntimeError("HF_SPACE_URL is not configured")
    return f"{HF_SPACE_URL}{path}"


async def create_hf_session(payload: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(_space_url("/mcp/sessions"), headers=_headers(), json=payload)
        resp.raise_for_status()
        return resp.json()


async def get_hf_session(hf_session_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(_space_url(f"/mcp/sessions/{hf_session_id}"), headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def get_hf_tools(hf_session_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(_space_url(f"/mcp/sessions/{hf_session_id}/tools"), headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def call_hf_tool(hf_session_id: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            _space_url(f"/mcp/sessions/{hf_session_id}/tools/call"),
            headers=_headers(),
            json={"name": name, "arguments": arguments},
        )
        resp.raise_for_status()
        return resp.json()


async def delete_hf_session(hf_session_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(_space_url(f"/mcp/sessions/{hf_session_id}"), headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def stream_hf_events(hf_session_id: str) -> AsyncIterator[bytes]:
    headers = _headers()
    headers["Accept"] = "text/event-stream"
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("GET", _space_url(f"/mcp/sessions/{hf_session_id}/events"), headers=headers) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                yield chunk
