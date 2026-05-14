from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import ValidationError

from .chat_snippets import chatbot_snippets
from .environments import manager as env_manager
from .models import (
    EnvironmentBootstrapRequest,
    EnvironmentBootstrapResponse,
    CodeRunRequest,
    CodeRunResponse,
    EnvironmentCreateRequest,
    EnvironmentRecord,
    EnvironmentTaskRequest,
    EnvironmentTaskResponse,
    NativeRunRequest,
    NativeRunResponse,
    RepoRunRequest,
    RunRequest,
    RunResponse,
    WorkspaceUploadRequest,
    WorkspaceUploadResponse,
)
from .native import (
    SERVICE,
    VERSION,
    ensure_state_dirs,
    get_artifact_path,
    get_run_artifacts,
    runner_capabilities,
    run_code_snippet,
    run_repo_command,
    run_workspace_command,
    stream_run_events,
    upload_workspace,
    resolve_image,
)
from .pool_manager import warm_pool_manager
from .sandbox import docker_info, run_job, runner_preflight, sandbox_selftest

app = FastAPI(title="MatrixLab Runner", version=VERSION)

_cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "MATRIXLAB_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_bearer_auth(authorization: str | None = Header(default=None)) -> None:
    """Optional bearer auth: enabled when MATRIXLAB_BEARER_TOKEN is set."""
    import os

    expected = os.environ.get("MATRIXLAB_BEARER_TOKEN")
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="missing or invalid bearer token")


@app.on_event("startup")
def _startup() -> None:
    ensure_state_dirs()
    # Fail fast with a clear error in logs if Docker isn't usable.
    runner_preflight()
    warm_pool_manager.start(image_resolver=resolve_image)


@app.on_event("shutdown")
def _shutdown() -> None:
    warm_pool_manager.stop()


@app.get("/health")
def health():
    info = docker_info()
    return {
        "ok": bool(info.get("ok")),
        "service": SERVICE,
        "version": VERSION,
        "docker": info,
    }


@app.get("/capabilities")
def capabilities():
    caps = runner_capabilities()
    caps["status"] = "ok"
    caps["docker"] = docker_info()
    caps["endpoints"] = [
        "/health",
        "/capabilities",
        "/run",
        "/code/run",
        "/chat/run",
        "/snippets/chatbot",
        "/repo/run",
        "/workspaces/upload",
        "/runs/{sandbox_id}/events",
        "/runs/{sandbox_id}/artifacts",
        "/runs/{sandbox_id}/artifacts/{artifact_id}",
        "/sandboxes/health",
        "/pool/status",
        "/environments",
        "/environments/{environment_id}",
        "/environments/{environment_id}/bootstrap",
        "/environments/{environment_id}/run-task",
        "/env/bootstrap",
        "/env/{env_id}/run",
        "/env/{env_id}",
    ]
    caps["notes"] = [
        "Runner uses Docker to spawn isolated sandbox containers.",
        "Set MATRIXLAB_BEARER_TOKEN to require bearer auth for mutating/native endpoints.",
        "In dev, mount /var/run/docker.sock. In production, use a dedicated executor runtime.",
    ]
    return caps


@app.get("/sandboxes/health")
def sandboxes_health():
    """Optional health check for sandbox images (runs a tiny command in each)."""
    return sandbox_selftest()


@app.get("/pool/status")
def pool_status(_: None = Depends(_require_bearer_auth)):
    """Return Docker cgroup-freezer warm-pool state for local/worker diagnostics."""
    return warm_pool_manager.status()


@app.post("/workspaces/upload", response_model=WorkspaceUploadResponse, dependencies=[Depends(_require_bearer_auth)])
def workspaces_upload(req: WorkspaceUploadRequest):
    try:
        return upload_workspace(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/run", dependencies=[Depends(_require_bearer_auth)])
async def run(req: Request):
    """Run either the legacy MatrixLab step contract or GitPilot native v1 contract."""
    payload: Dict[str, Any] = await req.json()
    try:
        if "steps" in payload:
            legacy_req = RunRequest.model_validate(payload)
            return RunResponse.model_validate(run_job(legacy_req))
        native_req = NativeRunRequest.model_validate(payload)
        return run_workspace_command(native_req)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/code/run", response_model=CodeRunResponse, dependencies=[Depends(_require_bearer_auth)])
def code_run(req: CodeRunRequest):
    """Run a single chatbot-style code cell in an isolated MatrixLab sandbox."""
    try:
        return run_code_snippet(req)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.errors())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/run", response_model=CodeRunResponse, dependencies=[Depends(_require_bearer_auth)])
def chat_run(req: CodeRunRequest):
    """Alias for chat UIs that want a memorable endpoint name."""
    return code_run(req)


@app.get("/snippets/chatbot")
def snippets_chatbot():
    """Return copy/paste snippets for embedding MatrixLab code-run blocks."""
    return chatbot_snippets()


@app.post("/repo/run", response_model=NativeRunResponse, dependencies=[Depends(_require_bearer_auth)])
def repo_run(req: RepoRunRequest):
    try:
        # token_ref is intentionally only an opaque reference; raw tokens must not be logged or exposed.
        return run_repo_command(req)
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/runs/{sandbox_id}/events")
def run_events(sandbox_id: str, _: None = Depends(_require_bearer_auth)):
    try:
        return StreamingResponse(stream_run_events(sandbox_id), media_type="text/event-stream")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/runs/{sandbox_id}/artifacts")
def run_artifacts(sandbox_id: str, _: None = Depends(_require_bearer_auth)):
    try:
        return {"artifacts": get_run_artifacts(sandbox_id)}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/runs/{sandbox_id}/artifacts/{artifact_id:path}")
def run_artifact_download(sandbox_id: str, artifact_id: str, _: None = Depends(_require_bearer_auth)):
    try:
        return FileResponse(get_artifact_path(sandbox_id, artifact_id))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/environments", response_model=list[EnvironmentRecord])
def list_environments(_: None = Depends(_require_bearer_auth)):
    return list(env_manager.list_all().values())


@app.post("/environments", response_model=EnvironmentRecord, dependencies=[Depends(_require_bearer_auth)])
def create_or_update_environment(req: EnvironmentCreateRequest):
    try:
        return env_manager.create_or_update(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/environments/{environment_id}", response_model=EnvironmentRecord)
def get_environment(environment_id: str, _: None = Depends(_require_bearer_auth)):
    env = env_manager.get(environment_id)
    if env is None:
        raise HTTPException(status_code=404, detail=f"environment not found: {environment_id}")
    return env


@app.post("/environments/{environment_id}/bootstrap", response_model=EnvironmentBootstrapResponse, dependencies=[Depends(_require_bearer_auth)])
def bootstrap_environment(environment_id: str, req: EnvironmentBootstrapRequest):
    try:
        return env_manager.bootstrap(environment_id, force_rebuild=req.force_rebuild)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/environments/{environment_id}/run-task", response_model=EnvironmentTaskResponse, dependencies=[Depends(_require_bearer_auth)])
def run_environment_task(environment_id: str, req: EnvironmentTaskRequest):
    try:
        return env_manager.run_task(environment_id, req)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/env/bootstrap", response_model=EnvironmentBootstrapResponse, dependencies=[Depends(_require_bearer_auth)])
def env_bootstrap(req: EnvironmentCreateRequest):
    """GitPilot-compatible bootstrap alias: create/update then bootstrap an environment."""
    try:
        env_manager.create_or_update(req)
        return env_manager.bootstrap(req.environment_id, force_rebuild=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/env/{env_id}/run", response_model=EnvironmentTaskResponse, dependencies=[Depends(_require_bearer_auth)])
def env_run(env_id: str, req: EnvironmentTaskRequest):
    """GitPilot-compatible cached environment task execution alias."""
    try:
        return env_manager.run_task(env_id, req)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/env/{env_id}", dependencies=[Depends(_require_bearer_auth)])
def env_delete(env_id: str):
    """Delete an environment record and cache metadata for GitPilot TTL cleanup flows."""
    try:
        deleted = env_manager.delete(env_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"environment not found: {env_id}")
        return {"ok": True, "environment_id": env_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
