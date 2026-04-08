from __future__ import annotations

import os
from typing import Any, Dict

import httpx


class RunnerClient:
    def __init__(self) -> None:
        self.base_url = os.environ.get("MATRIXLAB_RUNNER_URL", "http://localhost:8000").rstrip("/")
        timeout_s = float(os.environ.get("MATRIXLAB_RUNNER_TIMEOUT_S", "120"))
        self.client = httpx.Client(base_url=self.base_url, timeout=httpx.Timeout(timeout_s))

    def health(self) -> Dict[str, Any]:
        res = self.client.get("/health")
        res.raise_for_status()
        return res.json()

    def create_or_update_environment(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        res = self.client.post("/environments", json=payload)
        res.raise_for_status()
        return res.json()

    def bootstrap_environment(self, environment_id: str, force_rebuild: bool = False) -> Dict[str, Any]:
        res = self.client.post(
            f"/environments/{environment_id}/bootstrap",
            json={"force_rebuild": force_rebuild},
        )
        res.raise_for_status()
        return res.json()

    def run_environment_task(self, environment_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        res = self.client.post(f"/environments/{environment_id}/run-task", json=payload)
        res.raise_for_status()
        return res.json()
