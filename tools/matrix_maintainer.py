#!/usr/bin/env python3
"""Batch maintenance orchestrator for Agent-Matrix repos via HF backend `/repo/run`."""
from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx


REPO_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


@dataclass
class RepoPlan:
    environment_id: str
    repo_url: str
    default_branch: str
    branch: str
    command: str


def load_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if "organization" not in data or "repos" not in data:
        raise ValueError("config must contain organization and repos")
    return data


def build_plans(config: dict[str, Any], branch: str | None = None, command: str | None = None) -> list[RepoPlan]:
    org = config["organization"]
    default_branch = config.get("default_branch", "main")
    default_command = config.get("default_command", "pytest -q || python -m unittest discover || python -m compileall .")

    plans: list[RepoPlan] = []
    for item in config["repos"]:
        name = str(item["name"]).strip()
        if not REPO_NAME_PATTERN.match(name):
            raise ValueError(f"invalid repo name: {name}")

        target_branch = branch or item.get("branch") or default_branch
        target_command = command or item.get("command") or default_command

        plans.append(
            RepoPlan(
                environment_id=f"agent-matrix-{name}".replace(".", "-"),
                repo_url=f"https://github.com/{org}/{name}",
                default_branch=default_branch,
                branch=target_branch,
                command=target_command,
            )
        )
    return plans


def run_plan(hf_url: str, plan: RepoPlan, timeout_s: float = 180.0) -> dict[str, Any]:
    payload = {
        "environment_id": plan.environment_id,
        "repo_url": plan.repo_url,
        "default_branch": plan.default_branch,
        "branch": plan.branch,
        "command": plan.command,
        "profile": "custom",
    }
    with httpx.Client(timeout=httpx.Timeout(timeout_s)) as client:
        r = client.post(f"{hf_url.rstrip('/')}/repo/run", json=payload)
        r.raise_for_status()
        return r.json()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run matrix maintainer checks through HF backend")
    parser.add_argument("--config", default="configs/agent_matrix_repos.json", help="Path to org repo config JSON")
    parser.add_argument("--hf-url", default=os.environ.get("MATRIXLAB_HF_URL", "http://localhost:7860"), help="HF backend base URL")
    parser.add_argument("--branch", default=None, help="Override branch for all repos")
    parser.add_argument("--command", default=None, help="Override command for all repos")
    parser.add_argument("--max-repos", type=int, default=0, help="Limit number of repos (0 = all)")
    parser.add_argument("--execute", action="store_true", help="Execute /repo/run calls (default is dry-run)")
    args = parser.parse_args()

    config = load_config(Path(args.config))
    plans = build_plans(config, branch=args.branch, command=args.command)

    if args.max_repos > 0:
        plans = plans[: args.max_repos]

    print(f"Loaded {len(plans)} repos for organization: {config['organization']}")

    if not args.execute:
        for p in plans:
            print(json.dumps(p.__dict__, ensure_ascii=False))
        print("Dry-run complete. Use --execute to trigger HF /repo/run calls.")
        return 0

    failures = 0
    for p in plans:
        try:
            result = run_plan(args.hf_url, p)
            task = result.get("task", {})
            run = task.get("run", {})
            status = "ok"
            steps = run.get("results", [])
            if any((s.get("exit_code", 0) != 0) for s in steps):
                status = "failed"
            print(json.dumps({"repo": p.repo_url, "status": status, "job_id": run.get("job_id")}, ensure_ascii=False))
        except Exception as e:
            failures += 1
            print(json.dumps({"repo": p.repo_url, "status": "error", "error": str(e)}, ensure_ascii=False))

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
