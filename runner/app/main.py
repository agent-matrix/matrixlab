from fastapi import FastAPI, HTTPException

from .models import RunRequest, RunResponse
from .sandbox import run_job

app = FastAPI(title="Matrix Lab Runner", version="1.1")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run", response_model=RunResponse)
def run(req: RunRequest):
    try:
        return run_job(req)
    except Exception as e:
        # Keep logs visible in docker logs
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
