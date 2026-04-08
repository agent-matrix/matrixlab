from fastapi import FastAPI, HTTPException

from .environments import manager as env_manager
from .models import (
    EnvironmentBootstrapRequest,
    EnvironmentBootstrapResponse,
    EnvironmentCreateRequest,
    EnvironmentRecord,
    EnvironmentTaskRequest,
    EnvironmentTaskResponse,
    RunRequest,
    RunResponse,
)
from .sandbox import run_job, runner_preflight, docker_info, sandbox_selftest

app = FastAPI(title="Matrix Lab Runner", version="1.2")


@app.on_event("startup")
def _startup() -> None:
    # Fail fast with a clear error in logs if Docker isn't usable
    runner_preflight()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/capabilities")
def capabilities():
    """
    Expose Runner capabilities so the MCP server knows:
    1. If Docker is connected
    2. Which sandbox images are available
    3. Which endpoints exist
    """
    info = docker_info()
    return {
        "status": "ok",
        "docker": info,
        "endpoints": [
            "/health",
            "/run",
            "/capabilities",
            "/sandboxes/health",
            "/environments",
            "/environments/{environment_id}",
            "/environments/{environment_id}/bootstrap",
            "/environments/{environment_id}/run-task",
        ],
        "notes": [
            "Runner uses Docker to spawn sandbox containers.",
            "In dev, mount /var/run/docker.sock. In production, use a dedicated executor runtime."
        ],
    }


@app.get("/sandboxes/health")
def sandboxes_health():
    """
    Optional 'health check' for sandboxes (runs a tiny command in each).
    """
    return sandbox_selftest()


@app.post("/run", response_model=RunResponse)
def run(req: RunRequest):
    try:
        return run_job(req)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/environments", response_model=list[EnvironmentRecord])
def list_environments():
    return list(env_manager.list_all().values())


@app.post("/environments", response_model=EnvironmentRecord)
def create_or_update_environment(req: EnvironmentCreateRequest):
    try:
        return env_manager.create_or_update(req)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/environments/{environment_id}", response_model=EnvironmentRecord)
def get_environment(environment_id: str):
    env = env_manager.get(environment_id)
    if env is None:
        raise HTTPException(status_code=404, detail=f"environment not found: {environment_id}")
    return env


@app.post("/environments/{environment_id}/bootstrap", response_model=EnvironmentBootstrapResponse)
def bootstrap_environment(environment_id: str, req: EnvironmentBootstrapRequest):
    try:
        return env_manager.bootstrap(environment_id, force_rebuild=req.force_rebuild)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/environments/{environment_id}/run-task", response_model=EnvironmentTaskResponse)
def run_environment_task(environment_id: str, req: EnvironmentTaskRequest):
    try:
        return env_manager.run_task(environment_id, req)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
