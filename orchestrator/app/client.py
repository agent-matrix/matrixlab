import requests
from typing import Any, Dict


class RunnerClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def run(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Increased timeout for long builds (e.g. Rust)
        r = requests.post(f"{self.base_url}/run", json=payload, timeout=900)
        r.raise_for_status()
        return r.json()
