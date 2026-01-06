from fastapi import FastAPI, HTTPException

from .models import RunRequest, RunResponse
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
        "endpoints": ["/health", "/run", "/capabilities", "/sandboxes/health"],
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