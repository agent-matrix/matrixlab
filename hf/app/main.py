"""MatrixLab HF Space microservice for remote repo testing/debugging."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Literal

import httpx
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from app.runner_client import RunnerClient
from app.sandbox import run_verification

app = FastAPI(title="MatrixLab HF Backend", version="1.1.0")

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# In-memory run store (zip verification)
runs: dict[str, dict] = {}
runner = RunnerClient()

PROFILE_PRESETS: Dict[str, Dict[str, Any]] = {
    "gitpilot": {
        "repo_url": "https://github.com/ruslanmv/gitpilot",
        "task_command": "pytest -q || python -m unittest discover || python -m compileall .",
        "setup_script": "if [ -f requirements.txt ]; then python -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt; fi",
    },
    "agent-generator": {
        "repo_url": "https://github.com/ruslanmv/agent-generator",
        "task_command": "pytest -q || python -m unittest discover || python -m compileall .",
        "setup_script": "if [ -f requirements.txt ]; then python -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt; fi",
    },
    "repoguardian": {
        "repo_url": "https://github.com/ruslanmv/RepoGuardian",
        "task_command": "pytest -q || python -m unittest discover || python -m compileall .",
        "setup_script": "if [ -f requirements.txt ]; then python -m venv .venv && . .venv/bin/activate && pip install -U pip && pip install -r requirements.txt; fi",
    },
}

ALLOWED_REPO_PATTERN = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$")


class RepoTaskRequest(BaseModel):
    environment_id: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    repo_url: str
    default_branch: str = "main"
    branch: str = "main"
    command: str | None = None
    setup_script: str | None = None
    maintenance_script: str = "echo 'maintenance complete'"
    sandbox_image: str = "matrix-lab-sandbox-python:latest"
    profile: Literal["custom", "gitpilot", "agent-generator", "repoguardian"] = "custom"
    force_rebuild: bool = False


@app.get("/health")
async def health():
    runner_status = {"status": "unknown"}
    try:
        runner_status = runner.health()
    except Exception as e:  # best-effort surface
        runner_status = {"status": "unreachable", "error": str(e)}

    return {
        "status": "ok",
        "version": "1.1.0",
        "runs": len(runs),
        "runner_url": runner.base_url,
        "runner": runner_status,
    }


@app.get("/profiles")
async def list_profiles():
    return {"profiles": PROFILE_PRESETS}


@app.post("/repo/run")
async def repo_run(req: RepoTaskRequest):
    if req.profile in PROFILE_PRESETS:
        preset = PROFILE_PRESETS[req.profile]
        repo_url = preset["repo_url"]
        setup_script = req.setup_script or preset["setup_script"]
        command = req.command or preset["task_command"]
    else:
        repo_url = req.repo_url
        setup_script = req.setup_script or "echo 'No setup script configured.'"
        command = req.command or "pytest -q || python -m unittest discover || python -m compileall ."

    if not ALLOWED_REPO_PATTERN.match(repo_url):
        raise HTTPException(status_code=400, detail="repo_url must be a valid GitHub HTTPS repository URL")

    env_payload = {
        "environment_id": req.environment_id,
        "repo_url": repo_url,
        "default_branch": req.default_branch,
        "sandbox_image": req.sandbox_image,
        "setup_script": setup_script,
        "maintenance_script": req.maintenance_script,
        "task_command": command,
        "setup_network": "egress",
        "task_network": "none",
    }

    try:
        env = runner.create_or_update_environment(env_payload)
        bootstrap = runner.bootstrap_environment(req.environment_id, force_rebuild=req.force_rebuild)
        task = runner.run_environment_task(
            req.environment_id,
            {
                "branch": req.branch,
                "command": command,
                "task_network": "none",
            },
        )
    except httpx.HTTPStatusError as e:
        detail = e.response.text if e.response is not None else str(e)
        raise HTTPException(status_code=502, detail=f"runner error: {detail}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "environment": env,
        "bootstrap": bootstrap,
        "task": task,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# Existing ZIP verification UI/API --------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    recent = sorted(runs.values(), key=lambda r: r.get("created", ""), reverse=True)[:20]
    return templates.TemplateResponse(
        request=request,
        name="home.html",
        context={"request": request, "runs": recent, "runner_url": runner.base_url},
    )


@app.post("/upload", response_class=HTMLResponse)
async def upload(request: Request, file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".zip"):
        return templates.TemplateResponse(
            request=request,
            name="home.html",
            context={"request": request, "runs": list(runs.values())[:20], "error": "Please upload a .zip file.", "runner_url": runner.base_url},
        )

    zip_bytes = await file.read()
    if len(zip_bytes) > 50 * 1024 * 1024:
        return templates.TemplateResponse(
            request=request,
            name="home.html",
            context={"request": request, "runs": list(runs.values())[:20], "error": "File too large. Maximum 50MB.", "runner_url": runner.base_url},
        )

    run_id = str(uuid.uuid4())[:8]
    result = run_verification(zip_bytes)

    run_data = {
        "id": run_id,
        "filename": file.filename,
        "status": result.status,
        "language": result.detected_language,
        "framework": result.detected_framework,
        "files_count": result.files_count,
        "steps": [{"name": s.name, "status": s.status, "message": s.message, "logs": s.logs} for s in result.steps],
        "summary": result.summary,
        "created": datetime.now(timezone.utc).isoformat(),
    }
    runs[run_id] = run_data

    return templates.TemplateResponse(request=request, name="result.html", context={"request": request, "run": run_data})


@app.post("/runs")
async def api_create_run(file: UploadFile = File(...)):
    zip_bytes = await file.read()
    if len(zip_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB.")

    run_id = str(uuid.uuid4())[:8]
    result = run_verification(zip_bytes)

    run_data = {
        "id": run_id,
        "filename": file.filename or "project.zip",
        "status": result.status,
        "language": result.detected_language,
        "framework": result.detected_framework,
        "files_count": result.files_count,
        "steps": [{"name": s.name, "status": s.status, "message": s.message, "logs": s.logs} for s in result.steps],
        "summary": result.summary,
        "created": datetime.now(timezone.utc).isoformat(),
    }
    runs[run_id] = run_data
    return run_data


@app.get("/runs")
async def api_list_runs():
    recent = sorted(runs.values(), key=lambda r: r.get("created", ""), reverse=True)[:50]
    return {"runs": recent, "total": len(runs)}


@app.get("/runs/{run_id}")
async def api_get_run(run_id: str):
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    return runs[run_id]
