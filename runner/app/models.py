from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

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
