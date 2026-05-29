"""Hugging Face MCP sandbox worker for MatrixHub.

This module is the runtime that lives inside the Hugging Face Docker Space.
MatrixHub should call it through the MatrixHub backend only, never directly from
browser clients.

Scope of this MVP:
- Start one or a few short-lived stdio MCP server subprocesses.
- Initialize the MCP server and run tools/list.
- Allow controlled tool calls during a hard TTL, default 10 minutes.
- Stream lifecycle events over SSE.
- Kill the subprocess and delete /tmp state at expiry.

Security note: this is a compatibility/demo sandbox for curated MatrixHub
catalog entries. It is not equivalent to Firecracker, gVisor, Kata, or a
hardened multi-tenant arbitrary-code execution platform.
"""
from __future__ import annotations

import asyncio
import json
import os
import shlex
import shutil
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Literal

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/mcp", tags=["mcp-sandbox"])

MAX_TTL_SECONDS = int(os.environ.get("MATRIXLAB_MCP_MAX_TTL_SECONDS", "600"))
MAX_INSTALL_SECONDS = int(os.environ.get("MATRIXLAB_MCP_INSTALL_TIMEOUT_SECONDS", "120"))
MAX_STARTUP_SECONDS = int(os.environ.get("MATRIXLAB_MCP_STARTUP_TIMEOUT_SECONDS", "45"))
MAX_RPC_SECONDS = int(os.environ.get("MATRIXLAB_MCP_RPC_TIMEOUT_SECONDS", "20"))
MAX_LOG_CHARS = int(os.environ.get("MATRIXLAB_MCP_MAX_LOG_CHARS", "20000"))
MAX_EVENT_HISTORY = int(os.environ.get("MATRIXLAB_MCP_MAX_EVENT_HISTORY", "200"))
MAX_SESSIONS = int(os.environ.get("MATRIXLAB_MCP_MAX_SESSIONS", "1"))
BASE_WORKDIR = Path(os.environ.get("MATRIXLAB_MCP_WORKDIR", "/tmp/matrixlab-mcp-sessions"))
SANDBOX_TOKEN = os.environ.get("MATRIXLAB_SANDBOX_TOKEN", "").strip()

# Keep this narrow for the free HF MVP. Add more prefixes only after review.
ALLOWED_BINARIES = {"npx", "uvx", "pipx", "python", "python3", "node"}

BLOCKED_TOKENS = {
    "sudo", "docker", "podman", "kubectl", "systemctl", "mount", "umount",
    "mkfs", "apt", "apt-get", "yum", "dnf", "apk", "curl", "wget", "chmod",
    "chown", "ssh", "scp", "bash", "sh", "zsh", "fish", "powershell",
}

BLOCKED_SUBSTRINGS = ["|", ";", "&&", "||", "`", "$(", ">", "<", "\n", "\r", "rm -rf /"]
ACTIVE_STATUSES = {"created", "installing", "starting", "initializing", "running"}
TERMINAL_STATUSES = {"expired", "deleted", "failed", "timeout", "install_failed", "start_failed", "mcp_failed"}


class StartSessionRequest(BaseModel):
    entity_id: str = Field(..., min_length=1, max_length=160)
    runtime: Literal["node", "python", "generic"] = "generic"
    start_command: str = Field(..., min_length=2, max_length=1000)
    install_command: str | None = Field(default=None, max_length=1000)
    transport: Literal["stdio"] = "stdio"
    ttl_seconds: int = Field(default=600, ge=30, le=600)
    env: dict[str, str] = Field(default_factory=dict)


class ToolCallRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    arguments: dict[str, Any] = Field(default_factory=dict)


@dataclass
class Session:
    id: str
    entity_id: str
    workdir: Path
    start_command: str
    install_command: str | None
    status: str = "created"
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0
    process: asyncio.subprocess.Process | None = None
    logs: list[str] = field(default_factory=list)
    tools: list[dict[str, Any]] = field(default_factory=list)
    rpc_id: int = 0
    rpc_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    stderr_task: asyncio.Task | None = None
    cleanup_task: asyncio.Task | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    event_queue: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)

    def emit(self, step: str, status: str, message: str, data: dict[str, Any] | None = None) -> None:
        event = {
            "session_id": self.id,
            "entity_id": self.entity_id,
            "ts": time.time(),
            "step": step,
            "status": status,
            "message": message,
            "data": data or {},
        }
        self.events.append(event)
        if len(self.events) > MAX_EVENT_HISTORY:
            self.events = self.events[-MAX_EVENT_HISTORY:]
        try:
            self.event_queue.put_nowait(event)
        except asyncio.QueueFull:
            pass

    def add_log(self, text: str) -> None:
        if not text:
            return
        text = text[-MAX_LOG_CHARS:]
        self.logs.append(text)
        joined = "\n".join(self.logs)
        if len(joined) > MAX_LOG_CHARS:
            self.logs = [joined[-MAX_LOG_CHARS:]]
        self.emit("logs", "ok", "log output", {"text": text[-4000:]})


sessions: dict[str, Session] = {}


def _require_auth(authorization: str | None) -> None:
    if not SANDBOX_TOKEN:
        return
    if authorization != f"Bearer {SANDBOX_TOKEN}":
        raise HTTPException(status_code=401, detail="missing or invalid sandbox token")


def _validate_command(command: str) -> list[str]:
    lowered = command.lower()
    for bad in BLOCKED_SUBSTRINGS:
        if bad in lowered:
            raise HTTPException(status_code=400, detail=f"blocked shell pattern: {bad}")

    try:
        parts = shlex.split(command)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"invalid command: {e}") from e

    if not parts:
        raise HTTPException(status_code=400, detail="empty command")

    binary = Path(parts[0]).name
    if binary not in ALLOWED_BINARIES:
        raise HTTPException(status_code=400, detail=f"command not allowed: {binary}")

    for token in parts:
        normalized = Path(token).name.lower()
        if normalized in BLOCKED_TOKENS:
            raise HTTPException(status_code=400, detail=f"blocked token: {token}")

    return parts


def _public_session(s: Session) -> dict[str, Any]:
    return {
        "session_id": s.id,
        "entity_id": s.entity_id,
        "status": s.status,
        "created_at": s.created_at,
        "expires_at": s.expires_at,
        "ttl_remaining_seconds": max(0, int(s.expires_at - time.time())),
        "tools": s.tools,
        "logs": s.logs[-5:],
        "events": s.events[-20:],
    }


def _sse(event: dict[str, Any], event_name: str = "message") -> str:
    return f"event: {event_name}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _read_stderr(session: Session) -> None:
    proc = session.process
    if not proc or not proc.stderr:
        return
    while True:
        line = await proc.stderr.readline()
        if not line:
            return
        session.add_log("[stderr] " + line.decode(errors="replace").rstrip())


async def _send_json(proc: asyncio.subprocess.Process, msg: dict[str, Any]) -> None:
    if proc.stdin is None:
        raise RuntimeError("MCP process stdin is closed")
    proc.stdin.write((json.dumps(msg) + "\n").encode())
    await proc.stdin.drain()


async def _recv_json(proc: asyncio.subprocess.Process, timeout_s: int = MAX_RPC_SECONDS) -> dict[str, Any]:
    if proc.stdout is None:
        raise RuntimeError("MCP process stdout is closed")

    async def _read_loop() -> dict[str, Any]:
        while True:
            line = await proc.stdout.readline()
            if not line:
                raise RuntimeError("MCP process exited before response")
            raw = line.decode(errors="replace").strip()
            if not raw:
                continue
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                # Some MCP servers print startup logs to stdout; retain and ignore.
                continue

    return await asyncio.wait_for(_read_loop(), timeout=timeout_s)


async def _rpc(session: Session, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    proc = session.process
    if not proc or proc.returncode is not None:
        raise HTTPException(status_code=409, detail="MCP session is not running")

    async with session.rpc_lock:
        session.rpc_id += 1
        request_id = session.rpc_id
        await _send_json(proc, {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})
        while True:
            resp = await _recv_json(proc)
            # Ignore notifications and unrelated ids.
            if resp.get("id") != request_id:
                continue
            if "error" in resp:
                raise HTTPException(status_code=502, detail=resp["error"])
            return resp


async def _initialize_and_list_tools(session: Session) -> None:
    proc = session.process
    if not proc:
        raise RuntimeError("process not started")

    async with session.rpc_lock:
        session.rpc_id += 1
        init_id = session.rpc_id
        session.emit("mcp_initialize", "start", "Initializing MCP server")
        await _send_json(
            proc,
            {
                "jsonrpc": "2.0",
                "id": init_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "matrixhub-hf-sandbox", "version": "0.2.0"},
                },
            },
        )
        while True:
            init_resp = await _recv_json(proc, timeout_s=MAX_RPC_SECONDS)
            if init_resp.get("id") != init_id:
                continue
            break
        if "error" in init_resp:
            raise RuntimeError(f"MCP initialize failed: {init_resp['error']}")
        session.emit("mcp_initialize", "ok", "MCP initialize succeeded")

        await _send_json(proc, {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})

        session.rpc_id += 1
        tools_id = session.rpc_id
        session.emit("tools_list", "start", "Listing MCP tools")
        await _send_json(proc, {"jsonrpc": "2.0", "id": tools_id, "method": "tools/list", "params": {}})
        while True:
            tools_resp = await _recv_json(proc, timeout_s=MAX_RPC_SECONDS)
            if tools_resp.get("id") != tools_id:
                continue
            break
        if "error" in tools_resp:
            raise RuntimeError(f"MCP tools/list failed: {tools_resp['error']}")

        result = tools_resp.get("result") or {}
        tools = result.get("tools") or []
        session.tools = tools if isinstance(tools, list) else []
        session.emit("tools_list", "ok", f"Found {len(session.tools)} tools", {"tools_count": len(session.tools)})


async def _run_session(session_id: str, req: StartSessionRequest) -> None:
    session = sessions[session_id]
    session.status = "installing" if req.install_command else "starting"

    try:
        env = os.environ.copy()
        # Do not pass arbitrary secrets. Only explicit non-sensitive public env.
        for key, value in req.env.items():
            if not key.startswith("MATRIXHUB_PUBLIC_"):
                raise RuntimeError(f"env key not allowed: {key}")
            env[key] = value

        if req.install_command:
            session.emit("install", "start", "Installing MCP server")
            install_parts = _validate_command(req.install_command)
            install_proc = await asyncio.create_subprocess_exec(
                *install_parts,
                cwd=session.workdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )
            output, _ = await asyncio.wait_for(install_proc.communicate(), timeout=MAX_INSTALL_SECONDS)
            session.add_log(output.decode(errors="replace"))
            if install_proc.returncode != 0:
                session.status = "install_failed"
                session.emit("install", "error", "Install failed", {"returncode": install_proc.returncode})
                await cleanup_session(session_id, final_status="install_failed")
                return
            session.emit("install", "ok", "Install completed")

        session.status = "starting"
        session.emit("start", "start", "Starting MCP server")
        start_parts = _validate_command(req.start_command)
        proc = await asyncio.create_subprocess_exec(
            *start_parts,
            cwd=session.workdir,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        session.process = proc
        session.stderr_task = asyncio.create_task(_read_stderr(session))
        session.emit("start", "ok", "MCP process started", {"pid": getattr(proc, "pid", None)})

        session.status = "initializing"
        await asyncio.wait_for(_initialize_and_list_tools(session), timeout=MAX_STARTUP_SECONDS)
        session.status = "running"
        session.emit("ready", "ok", "Sandbox ready for testing", {"ttl_remaining_seconds": max(0, int(session.expires_at - time.time()))})

    except asyncio.TimeoutError:
        session.status = "timeout"
        session.add_log("session timed out during install/startup")
        session.emit("timeout", "error", "Session timed out during install/startup")
        await cleanup_session(session_id, final_status="timeout")
    except Exception as e:
        session.status = "failed"
        session.add_log(str(e))
        session.emit("failed", "error", str(e))
        await cleanup_session(session_id, final_status="failed")


async def cleanup_session(session_id: str, final_status: str = "expired") -> None:
    session = sessions.get(session_id)
    if not session:
        return

    if session.status in TERMINAL_STATUSES and final_status == "expired":
        return

    proc = session.process
    if proc and proc.returncode is None:
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=3)
        except Exception:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass

    if session.stderr_task:
        session.stderr_task.cancel()

    shutil.rmtree(session.workdir, ignore_errors=True)
    session.status = final_status
    session.emit("cleanup", "ok" if final_status in {"expired", "deleted"} else "error", f"Session {final_status}")


async def _expire_later(session_id: str, ttl_seconds: int) -> None:
    await asyncio.sleep(ttl_seconds)
    await cleanup_session(session_id, final_status="expired")


@router.get("/health")
async def mcp_health():
    return {
        "status": "ok",
        "active_sessions": len([s for s in sessions.values() if s.status in ACTIVE_STATUSES]),
        "max_sessions": MAX_SESSIONS,
        "max_ttl_seconds": MAX_TTL_SECONDS,
    }


@router.post("/sessions")
async def start_session(req: StartSessionRequest, authorization: str | None = Header(default=None)):
    _require_auth(authorization)

    active = [s for s in sessions.values() if s.status in ACTIVE_STATUSES]
    if len(active) >= MAX_SESSIONS:
        raise HTTPException(status_code=429, detail="no sandbox capacity available")

    if req.ttl_seconds > MAX_TTL_SECONDS:
        raise HTTPException(status_code=400, detail=f"max ttl is {MAX_TTL_SECONDS} seconds")

    if req.install_command:
        _validate_command(req.install_command)
    _validate_command(req.start_command)

    BASE_WORKDIR.mkdir(parents=True, exist_ok=True)
    session_id = "mcp_" + uuid.uuid4().hex[:16]
    workdir = BASE_WORKDIR / session_id
    workdir.mkdir(parents=True, exist_ok=False)

    session = Session(
        id=session_id,
        entity_id=req.entity_id,
        workdir=workdir,
        start_command=req.start_command,
        install_command=req.install_command,
        expires_at=time.time() + req.ttl_seconds,
    )
    sessions[session_id] = session
    session.emit("resolve", "ok", f"Accepted sandbox request for {req.entity_id}")

    asyncio.create_task(_run_session(session_id, req))
    session.cleanup_task = asyncio.create_task(_expire_later(session_id, req.ttl_seconds))

    return _public_session(session)


@router.get("/sessions")
async def list_sessions(authorization: str | None = Header(default=None)):
    _require_auth(authorization)
    return {"sessions": [_public_session(s) for s in sessions.values()]}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, authorization: str | None = Header(default=None)):
    _require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    return _public_session(session)


@router.get("/sessions/{session_id}/events")
async def stream_events(session_id: str, request: Request, authorization: str | None = Header(default=None)):
    _require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")

    async def event_generator() -> AsyncIterator[str]:
        for event in session.events:
            yield _sse(event)
        while True:
            if await request.is_disconnected():
                break
            if session.status in TERMINAL_STATUSES and session.event_queue.empty():
                yield _sse({"session_id": session.id, "step": "closed", "status": "ok", "message": session.status, "data": {}}, "done")
                break
            try:
                event = await asyncio.wait_for(session.event_queue.get(), timeout=15)
                yield _sse(event)
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/sessions/{session_id}/tools")
async def list_tools(session_id: str, authorization: str | None = Header(default=None)):
    _require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    if session.status != "running":
        raise HTTPException(status_code=409, detail=f"session is {session.status}")
    return {"tools": session.tools}


@router.post("/sessions/{session_id}/tools/call")
async def call_tool(session_id: str, req: ToolCallRequest, authorization: str | None = Header(default=None)):
    _require_auth(authorization)
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    if session.status != "running":
        raise HTTPException(status_code=409, detail=f"session is {session.status}")

    session.emit("tool_call", "start", f"Calling tool {req.name}", {"name": req.name})
    response = await _rpc(session, "tools/call", {"name": req.name, "arguments": req.arguments})
    session.emit("tool_call", "ok", f"Tool {req.name} completed", {"name": req.name})
    return response.get("result", response)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, authorization: str | None = Header(default=None)):
    _require_auth(authorization)
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="session not found")
    await cleanup_session(session_id, final_status="deleted")
    return {"ok": True, "session_id": session_id, "status": "deleted"}
