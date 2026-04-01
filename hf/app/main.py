"""MatrixLab Sandbox — HF Spaces verification service."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.sandbox import run_verification

app = FastAPI(title="MatrixLab Sandbox", version="1.0.0")

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# In-memory run store
runs: dict[str, dict] = {}


# ── Health ────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "runs": len(runs)}


# ── Web UI ────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    recent = sorted(runs.values(), key=lambda r: r.get("created", ""), reverse=True)[:20]
    return templates.TemplateResponse(
        request=request, name="home.html",
        context={"request": request, "runs": recent},
    )


@app.post("/upload", response_class=HTMLResponse)
async def upload(request: Request, file: UploadFile = File(...)):
    """Upload a ZIP and run verification."""
    if not file.filename or not file.filename.endswith(".zip"):
        return templates.TemplateResponse(
            request=request, name="home.html",
            context={"request": request, "runs": list(runs.values())[:20],
                      "error": "Please upload a .zip file."},
        )

    zip_bytes = await file.read()
    if len(zip_bytes) > 50 * 1024 * 1024:  # 50MB limit
        return templates.TemplateResponse(
            request=request, name="home.html",
            context={"request": request, "runs": list(runs.values())[:20],
                      "error": "File too large. Maximum 50MB."},
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

    return templates.TemplateResponse(
        request=request, name="result.html",
        context={"request": request, "run": run_data},
    )


# ── API ───────────────────────────────────────────────────────────

@app.post("/runs")
async def api_create_run(file: UploadFile = File(...)):
    """API: Upload ZIP and run verification. Returns run result."""
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
    """API: List recent verification runs."""
    recent = sorted(runs.values(), key=lambda r: r.get("created", ""), reverse=True)[:50]
    return {"runs": recent, "total": len(runs)}


@app.get("/runs/{run_id}")
async def api_get_run(run_id: str):
    """API: Get a specific run result."""
    if run_id not in runs:
        raise HTTPException(status_code=404, detail="Run not found")
    return runs[run_id]
