from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


def _default_python_image() -> str:
    """Resolve the default Python sandbox image at import time.

    Prepends ``MATRIXLAB_IMAGE_NAMESPACE`` so requests that omit
    ``sandbox_image`` still target the published Docker Hub /
    GHCR copy when the operator set the namespace env var.
    """
    ns = os.environ.get("MATRIXLAB_IMAGE_NAMESPACE", "").strip().rstrip("/")
    base = "matrix-lab-sandbox-python:latest"
    return f"{ns}/{base}" if ns else base

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

    sandbox_image: str = Field(default_factory=_default_python_image)


class StepResult(BaseModel):
    name: str
    exit_code: int
    stdout: str
    stderr: str


class RunResponse(BaseModel):
    job_id: str
    results: List[StepResult]
    artifacts_zip_base64: Optional[str] = None


class WorkspaceRef(BaseModel):
    type: Literal["zip"] = "zip"
    upload_id: Optional[str] = None
    zip_base64: Optional[str] = None


class NativeRunRequest(BaseModel):
    cmd: str = Field(..., min_length=1)
    cwd: str = "."
    workspace: Optional[WorkspaceRef] = None
    env: Dict[str, str] = Field(default_factory=dict)
    timeout: int = Field(120, ge=1, le=86400)
    image: str = "python"
    allow_network: bool = False
    stdin: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    cpu_limit: float = 1.0
    mem_limit_mb: int = 1024
    pids_limit: int = 256


class RepoRunRequest(BaseModel):
    repo_url: str
    ref: Optional[str] = None
    cmd: str = Field(..., min_length=1)
    profile: str = "python"
    timeout: int = Field(120, ge=1, le=86400)
    allow_network: bool = False
    token_ref: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    env: Dict[str, str] = Field(default_factory=dict)
    cpu_limit: float = 1.0
    mem_limit_mb: int = 1024
    pids_limit: int = 256


class ArtifactRecord(BaseModel):
    id: str
    name: str
    mime: str = "application/octet-stream"
    size: int


class NativeRunResponse(BaseModel):
    sandbox_id: str
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False
    truncated: bool = False
    artifacts: List[ArtifactRecord] = Field(default_factory=list)


class CodeRunRequest(BaseModel):
    language: Literal["python", "javascript", "node", "bash"] = "python"
    code: str = Field(..., min_length=1, max_length=1_000_000)
    stdin: Optional[str] = Field(default=None, max_length=1_000_000)
    packages: List[str] = Field(default_factory=list, max_length=50)
    timeout: int = Field(120, ge=1, le=86400)
    allow_network: bool = False
    env: Dict[str, str] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    image: Optional[str] = None
    cpu_limit: float = Field(1.0, ge=0.1, le=8.0)
    mem_limit_mb: int = Field(1024, ge=128, le=32768)
    pids_limit: int = Field(256, ge=16, le=4096)


class CodeRunResponse(BaseModel):
    sandbox_id: str
    language: str
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    timed_out: bool = False
    truncated: bool = False
    console: List[str] = Field(default_factory=list)
    artifacts: List[ArtifactRecord] = Field(default_factory=list)


class WorkspaceUploadRequest(BaseModel):
    zip_base64: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkspaceUploadResponse(BaseModel):
    upload_id: str
    size: int
    excluded: List[str] = Field(default_factory=list)


class EnvironmentCreateRequest(BaseModel):
    environment_id: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    repo_url: str
    default_branch: str = "main"
    sandbox_image: str = Field(default_factory=_default_python_image)
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
