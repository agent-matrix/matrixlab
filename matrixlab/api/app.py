"""FastAPI app: MatrixLab Generic Sandbox Validation Provider.

Default service port: 8765.

Endpoints
---------
GET  /health                         service liveness + profiles
GET  /capabilities                   profiles, languages, features, limits
POST /repo/run                       validate a repo/branch with a profile
POST /repo/validate-patch            apply a patch then validate
GET  /runs/{run_id}                  stored run result
GET  /runs/{run_id}/logs             {stdout, stderr}
GET  /runs/{run_id}/artifacts        list artifact metadata
GET  /runs/{run_id}/artifacts/{name} fetch one artifact
"""

from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from .. import __version__
from .executor import (
    ProfileNotFoundError,
    execute_run,
    get_artifact_path,
    get_artifacts,
    get_run,
)
from .models import (
    LogsResponse,
    RepoRunRequest,
    RunResponse,
    ValidatePatchRequest,
)
from .profiles import (
    ForbiddenCommandError,
    list_languages,
    list_profile_names,
    load_profiles,
)

SERVICE = "matrixlab"
DEFAULT_PORT = 8765


def create_app() -> FastAPI:
    app = FastAPI(
        title="MatrixLab Sandbox Validation Provider",
        version=__version__,
        description="Generic sandbox validation provider: run profile "
        "commands against a repo/branch/patch and return logs, exit code, "
        "and artifact metadata.",
    )

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": SERVICE,
            "version": __version__,
            "profiles": list_profile_names(),
        }

    @app.get("/capabilities")
    def capabilities():
        profiles = load_profiles()
        max_memory = max((p.max_memory_mb for p in profiles.values()), default=4096)
        max_timeout = max((p.timeout_seconds for p in profiles.values()), default=600)
        return {
            "service": SERVICE,
            "version": __version__,
            "profiles": list_profile_names(),
            "languages": list_languages(),
            "features": {
                "artifacts": True,
                "logs": True,
                "patch_validation": True,
                "network": "restricted",
                "dry_run": True,
            },
            "max_memory_mb": max_memory,
            "max_timeout_seconds": max_timeout,
        }

    def _run(req: RepoRunRequest, patch=None) -> RunResponse:
        try:
            return execute_run(
                profile_name=req.profile,
                repo_url=req.repo_url,
                branch=req.branch,
                commands_override=req.commands,
                timeout_override=req.timeout_seconds,
                artifacts_override=req.artifacts,
                patch=patch,
            )
        except ProfileNotFoundError:
            raise HTTPException(
                status_code=404, detail=f"Unknown profile: {req.profile}"
            )
        except ForbiddenCommandError as exc:
            # Fail-closed: refuse the request entirely.
            raise HTTPException(status_code=403, detail=str(exc))

    @app.post("/repo/run", response_model=RunResponse)
    def repo_run(req: RepoRunRequest):
        return _run(req)

    @app.post("/repo/validate-patch", response_model=RunResponse)
    def validate_patch(req: ValidatePatchRequest):
        return _run(req, patch=req.patch)

    @app.get("/runs/{run_id}", response_model=RunResponse)
    def get_run_result(run_id: str):
        run = get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Unknown run: {run_id}")
        return run

    @app.get("/runs/{run_id}/logs", response_model=LogsResponse)
    def get_run_logs(run_id: str):
        run = get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Unknown run: {run_id}")
        return LogsResponse(stdout=run.stdout, stderr=run.stderr)

    @app.get("/runs/{run_id}/artifacts")
    def list_run_artifacts(run_id: str):
        run = get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Unknown run: {run_id}")
        return {"run_id": run_id, "artifacts": [a.model_dump() for a in get_artifacts(run_id)]}

    @app.get("/runs/{run_id}/artifacts/{name}")
    def get_run_artifact(run_id: str, name: str):
        if get_run(run_id) is None:
            raise HTTPException(status_code=404, detail=f"Unknown run: {run_id}")
        path = get_artifact_path(run_id, name)
        if not path or not os.path.isfile(path):
            raise HTTPException(
                status_code=404, detail=f"Unknown artifact: {name}"
            )
        return FileResponse(path, media_type="text/plain", filename=name)

    return app


# Module-level app for ``uvicorn matrixlab.api.app:app``.
app = create_app()


def main() -> None:  # pragma: no cover - thin runtime wrapper
    import uvicorn

    port = int(os.environ.get("MATRIXLAB_API_PORT", DEFAULT_PORT))
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":  # pragma: no cover
    main()
