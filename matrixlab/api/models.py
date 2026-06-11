"""Pydantic request/response models for the sandbox validation API."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class Artifact(BaseModel):
    name: str
    url: str


class RepoRunRequest(BaseModel):
    client_id: str = Field(..., description="Calling client, e.g. gitpilot/selfrepair.")
    workspace_id: str = Field(..., description="Caller-side workspace identifier.")
    repo_url: str = Field(..., description="Git URL of the repo to validate.")
    branch: str = Field("main", description="Branch (or ref) to check out.")
    profile: str = Field(..., description="Sandbox profile name, e.g. python-repair.")
    commands: Optional[List[str]] = Field(
        None, description="Override commands; defaults to the profile commands."
    )
    timeout_seconds: Optional[int] = Field(
        None, description="Override the profile timeout."
    )
    artifacts: Optional[bool] = Field(
        None, description="Override whether artifacts are collected."
    )


class ValidatePatchRequest(RepoRunRequest):
    patch: Optional[str] = Field(
        None, description="Unified diff to apply before running the profile."
    )
    workspace_ref: Optional[str] = Field(
        None, description="Alternative to patch: a pre-staged workspace reference."
    )


class RunResponse(BaseModel):
    run_id: str
    status: str  # "passed" | "failed" | "error"
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    artifacts: List[Artifact] = Field(default_factory=list)
    # validate-patch echoes the files the patch touched.
    patched_files: Optional[List[str]] = None


class LogsResponse(BaseModel):
    stdout: str
    stderr: str
