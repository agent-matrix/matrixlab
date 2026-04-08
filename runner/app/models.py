from __future__ import annotations

from datetime import datetime
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


class EnvironmentCreateRequest(BaseModel):
    environment_id: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    repo_url: str
    default_branch: str = "main"
    sandbox_image: str = "matrix-lab-sandbox-python:latest"
    setup_script: str = "echo 'No setup script configured.'"
    maintenance_script: str = "echo 'No maintenance script configured.'"
    task_command: str = "pytest -q || python -m unittest discover || python -m compileall ."
    setup_network: NetworkMode = "egress"
    task_network: NetworkMode = "none"
    cpu_limit: float = 1.0
    mem_limit_mb: int = 1024
    pids_limit: int = 256
    setup_timeout_seconds: int = 1200
    maintenance_timeout_seconds: int = 600
    task_timeout_seconds: int = 1200


class EnvironmentRecord(BaseModel):
    environment_id: str
    repo_url: str
    default_branch: str
    sandbox_image: str
    setup_script: str
    maintenance_script: str
    task_command: str
    setup_network: NetworkMode
    task_network: NetworkMode
    cpu_limit: float
    mem_limit_mb: int
    pids_limit: int
    setup_timeout_seconds: int
    maintenance_timeout_seconds: int
    task_timeout_seconds: int
    cache_key: Optional[str] = None
    cache_workspace_dir: Optional[str] = None
    cache_built_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class EnvironmentBootstrapRequest(BaseModel):
    force_rebuild: bool = False


class EnvironmentBootstrapResponse(BaseModel):
    environment_id: str
    cache_key: str
    cache_workspace_dir: str
    rebuilt: bool
    run: RunResponse


class EnvironmentTaskRequest(BaseModel):
    branch: Optional[str] = None
    command: Optional[str] = None
    task_network: Optional[NetworkMode] = None


class EnvironmentTaskResponse(BaseModel):
    environment_id: str
    cache_key: str
    branch: str
    command_effective: str
    run: RunResponse
