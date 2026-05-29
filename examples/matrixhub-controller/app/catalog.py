from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

CATALOG_PATH = Path(os.environ.get("MATRIXHUB_CATALOG_PATH", "./catalog.example.json"))


def load_catalog() -> list[dict[str, Any]]:
    path = CATALOG_PATH
    if not path.is_absolute():
        path = Path.cwd() / path
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise RuntimeError("catalog file must contain a JSON array")
    return data


def score_item(item: dict[str, Any], q: str) -> float:
    q = (q or "").lower().strip()
    haystack = " ".join(str(item.get(k, "")) for k in ["id", "name", "description", "kind", "type"]).lower()
    score = 0.0
    if not q:
        score += 1.0
    elif q in haystack:
        score += 10.0
    else:
        terms = q.split()
        score += sum(2.0 for t in terms if t in haystack)
    if item.get("verified"):
        score += 2.0
    if item.get("sandbox_enabled"):
        score += 2.0
    score += min(float(item.get("installs") or 0) / 10000.0, 3.0)
    score += min(float(item.get("rating") or 0) / 5.0, 1.0)
    return score


def search_catalog(q: str = "", kind: str | None = None, sandbox_only: bool = False) -> list[dict[str, Any]]:
    items = load_catalog()
    results = []
    for item in items:
        if kind and item.get("kind") != kind and item.get("type") != kind:
            continue
        if sandbox_only and not item.get("sandbox_enabled"):
            continue
        item = dict(item)
        item["_score"] = score_item(item, q)
        if q and item["_score"] <= 0:
            continue
        results.append(item)
    return sorted(results, key=lambda x: x.get("_score", 0), reverse=True)


def get_catalog_item(catalog_id: str) -> dict[str, Any] | None:
    for item in load_catalog():
        if item.get("id") == catalog_id or item.get("name") == catalog_id:
            return item
    return None
