from __future__ import annotations

from typing import Any, Dict

import requests


class RunnerClient:
    def __init__(self, base_url: str, timeout_s: int = 900):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def health(self) -> Dict[str, Any]:
        r = requests.get(f"{self.base_url}/health", timeout=10)
        r.raise_for_status()
        return r.json()

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        r = requests.post(f"{self.base_url}/run", json=payload, timeout=self.timeout_s)
        r.raise_for_status()
        return r.json()
