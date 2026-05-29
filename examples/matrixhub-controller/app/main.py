from __future__ import annotations

import asyncio
import os
import time
import uuid
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.catalog import get_catalog_item, search_catalog
from app.hf_client import call_hf_tool, create_hf_session, delete_hf_session, get_hf_session, get_hf_tools, stream_hf_events

app = FastAPI(title="MatrixHub Sandbox Controller", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_TOKEN = os.environ.get("MATRIXHUB_API_TOKEN", "")
MAX_TTL = int(os.environ.get("MATRIXHUB_SANDBOX_MAX_TTL_SECONDS", "600"))

# Replace with a DB table in production.
sessions: dict[str, dict[str, Any]] = {}
audit_events: list[dict[str, Any]] = []


class CreateSandboxRequest(BaseModel):
    catalog_id: str = Field(..., min_length=1, max_length=160)
    version: str | None = None
    ttl_seconds: int = Field(default=600, ge=30, le=600)


class ToolCallRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    arguments: dict[str, Any] = Field(default_factory=dict)


def require_auth(authorization: str | None) -> str:
    if not API_TOKEN:
        return "dev-user"
    if authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="missing or invalid MatrixHub token")
    return "api-user"


def audit(actor: str, action: str, target: str, data: dict[str, Any] | None = None) -> None:
    audit_events.append({
        "id": "aud_" + uuid.uuid4().hex[:16],
        "actor": actor,
        "action": action,
        "target": target,
        "workspace": "sandbox",
        "ts": time.time(),
        "data": data or {},
    })
    if len(audit_events) > 1000:
        del audit_events[:500]


def validate_sandbox_manifest(item: dict[str, Any]) -> dict[str, Any]:
    if item.get("kind") != "mcp_server" and item.get("type") != "mcp_server":
        raise HTTPException(status_code=400, detail="only MCP servers can be sandboxed")
    if not item.get("sandbox_enabled"):
        raise HTTPException(status_code=400, detail="this MCP server is not sandbox-enabled")
    sandbox = item.get("sandbox") or {}
    if sandbox.get("requires_secrets"):
        raise HTTPException(status_code=400, detail="sandbox cannot run servers requiring secrets")
    if item.get("transport", sandbox.get("transport", "stdio")) != "stdio":
        raise HTTPException(status_code=400, detail="only stdio MCP servers are supported in this MVP")
    if not sandbox.get("start_command"):
        raise HTTPException(status_code=400, detail="catalog item has no sandbox.start_command")
    return sandbox


async def expire_later(session_id: str, ttl_seconds: int) -> None:
    await asyncio.sleep(ttl_seconds)
    session = sessions.get(session_id)
    if not session or session.get("status") in {"deleted", "expired"}:
        return
    try:
        await delete_hf_session(session["hf_session_id"])
    except Exception as e:
        session["cleanup_error"] = str(e)
    session["status"] = "expired"
    audit("system", "sandbox.expired", session_id)


@app.get("/v1/meta")
async def meta():
    return {
        "matrix_cli": "0.1.0",
        "sdk": "0.1.0",
        "python": "3.11+",
        "hub": "matrixhub.io",
        "status": "online",
        "sandbox": "huggingface-space",
    }


@app.get("/v1/catalog/search")
async def catalog_search(
    q: str = Query(default=""),
    kind: str | None = Query(default=None),
    sandbox_only: bool = Query(default=False),
):
    return {"items": search_catalog(q=q, kind=kind, sandbox_only=sandbox_only)}


@app.get("/v1/catalog/{catalog_id:path}")
async def catalog_get(catalog_id: str):
    item = get_catalog_item(catalog_id)
    if not item:
        raise HTTPException(status_code=404, detail="catalog item not found")
    return item


@app.post("/v1/sandbox/sessions")
async def create_sandbox_session(req: CreateSandboxRequest, authorization: str | None = Header(default=None)):
    actor = require_auth(authorization)
    item = get_catalog_item(req.catalog_id)
    if not item:
        raise HTTPException(status_code=404, detail="catalog item not found")
    sandbox = validate_sandbox_manifest(item)

    ttl = min(req.ttl_seconds, int(sandbox.get("ttl_seconds") or 600), MAX_TTL)
    hf_payload = {
        "entity_id": item["id"],
        "runtime": item.get("runtime", "generic"),
        "install_command": sandbox.get("install_command"),
        "start_command": sandbox["start_command"],
        "transport": "stdio",
        "ttl_seconds": ttl,
        "env": sandbox.get("env", {}),
    }
    hf = await create_hf_session(hf_payload)

    session_id = "sbx_" + uuid.uuid4().hex[:16]
    session = {
        "session_id": session_id,
        "hf_session_id": hf["session_id"],
        "catalog_id": item["id"],
        "version": req.version or item.get("version"),
        "status": "starting",
        "created_at": time.time(),
        "expires_at": time.time() + ttl,
        "stream_url": f"/v1/sandbox/sessions/{session_id}/events",
    }
    sessions[session_id] = session
    audit(actor, "sandbox.created", session_id, {"catalog_id": item["id"], "hf_session_id": hf["session_id"]})
    asyncio.create_task(expire_later(session_id, ttl))
    return session


@app.get("/v1/sandbox/sessions")
async def list_sandbox_sessions(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    return {"sessions": list(sessions.values())}


@app.get("/v1/sandbox/sessions/{session_id}")
async def get_sandbox_session(session_id: str, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="sandbox session not found")
    try:
        hf = await get_hf_session(session["hf_session_id"])
        session["status"] = hf.get("status", session["status"])
        session["tools"] = hf.get("tools", [])
        session["ttl_remaining_seconds"] = hf.get("ttl_remaining_seconds")
    except Exception as e:
        session["worker_error"] = str(e)
    return session


@app.get("/v1/sandbox/sessions/{session_id}/events")
async def sandbox_events(session_id: str, request: Request, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="sandbox session not found")

    async def gen():
        async for chunk in stream_hf_events(session["hf_session_id"]):
            if await request.is_disconnected():
                break
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/v1/sandbox/sessions/{session_id}/tools")
async def sandbox_tools(session_id: str, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="sandbox session not found")
    return await get_hf_tools(session["hf_session_id"])


@app.post("/v1/sandbox/sessions/{session_id}/tools/call")
async def sandbox_tool_call(session_id: str, req: ToolCallRequest, authorization: str | None = Header(default=None)):
    actor = require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="sandbox session not found")
    audit(actor, "sandbox.tool_call", session_id, {"tool": req.name})
    return await call_hf_tool(session["hf_session_id"], req.name, req.arguments)


@app.delete("/v1/sandbox/sessions/{session_id}")
async def delete_sandbox_session(session_id: str, authorization: str | None = Header(default=None)):
    actor = require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="sandbox session not found")
    await delete_hf_session(session["hf_session_id"])
    session["status"] = "deleted"
    audit(actor, "sandbox.deleted", session_id)
    return {"ok": True, "session_id": session_id, "status": "deleted"}


@app.get("/v1/audit")
async def get_audit(authorization: str | None = Header(default=None)):
    require_auth(authorization)
    return {"events": audit_events[-200:]}
