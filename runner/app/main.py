from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Literal

from .sandbox import run_job

app = FastAPI(title="Matrix Lab Runner", version="1.1")

NetworkMode = Literal["none", "egress"]


class Step(BaseModel):
    name: str
    command: str
    timeout_seconds: int = 120
    network: NetworkMode = "none"
    env: Dict[str, str] = Field(default_factory=dict)


class RunRequest(BaseModel):
    repo_url: str
    ref: Optional[str] = None
    steps: List[Step]

    cpu_limit: float = 1.0
    mem_limit_mb: int = 1024
    pids_limit: int = 256

    # Default to python sandbox; orchestrator/tools should override.
    sandbox_image: str = "matrix-lab-sandbox-python:latest"


class StepResult(BaseModel):
    name: str
    exit_code: int
    stdout: str
    stderr: str


class RunResponse(BaseModel):
    job_id: str
    results: List[StepResult]
    artifacts_zip_base64: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run", response_model=RunResponse)
def run(req: RunRequest):
    try:
        return run_job(req)
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
