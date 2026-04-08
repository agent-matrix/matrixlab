from __future__ import annotations

import hashlib
import json
import os
import shlex
import shutil
import tempfile
from datetime import datetime, timezone
from threading import RLock
from typing import Dict, Optional

from .models import (
    EnvironmentBootstrapResponse,
    EnvironmentCreateRequest,
    EnvironmentRecord,
    EnvironmentTaskRequest,
    EnvironmentTaskResponse,
    RunRequest,
)
from .sandbox import run_job_with_details


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EnvironmentManager:
    """
    Lightweight local environment registry + cache manager.
    Uses atomic JSON writes and an in-process lock for stability.
    """

    def __init__(self) -> None:
        self.root = os.environ.get("MATRIXLAB_ENV_ROOT", os.path.join(os.getcwd(), "runner_envs"))
        self.meta_path = os.path.join(self.root, "environments.json")
        self.cache_root = os.path.join(self.root, "cache")
        self._lock = RLock()
        os.makedirs(self.cache_root, exist_ok=True)
        if not os.path.exists(self.meta_path):
            self._write_meta({})

    def _read_meta(self) -> Dict[str, dict]:
        if not os.path.exists(self.meta_path):
            return {}
        with open(self.meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                return {}
            return data

    def _write_meta(self, data: Dict[str, dict]) -> None:
        os.makedirs(self.root, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(prefix="env-meta-", suffix=".json", dir=self.root)
        os.close(fd)
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, sort_keys=True)
            os.replace(tmp_path, self.meta_path)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def _cache_key(self, env: EnvironmentRecord) -> str:
        payload = {
            "repo_url": env.repo_url,
            "default_branch": env.default_branch,
            "sandbox_image": env.sandbox_image,
            "setup_script": env.setup_script,
            "maintenance_script": env.maintenance_script,
            "task_command": env.task_command,
            "setup_network": env.setup_network,
            "task_network": env.task_network,
            "cpu_limit": env.cpu_limit,
            "mem_limit_mb": env.mem_limit_mb,
            "pids_limit": env.pids_limit,
            "setup_timeout_seconds": env.setup_timeout_seconds,
            "maintenance_timeout_seconds": env.maintenance_timeout_seconds,
            "task_timeout_seconds": env.task_timeout_seconds,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def create_or_update(self, req: EnvironmentCreateRequest) -> EnvironmentRecord:
        with self._lock:
            data = self._read_meta()
            now = _utcnow()
            existing = data.get(req.environment_id)

            if existing:
                prev = EnvironmentRecord.model_validate(existing)
                created_at = prev.created_at
                cache_key = prev.cache_key
                cache_workspace_dir = prev.cache_workspace_dir
                cache_built_at = prev.cache_built_at
            else:
                created_at = now
                cache_key = None
                cache_workspace_dir = None
                cache_built_at = None

            record = EnvironmentRecord(
                environment_id=req.environment_id,
                repo_url=req.repo_url,
                default_branch=req.default_branch,
                sandbox_image=req.sandbox_image,
                setup_script=req.setup_script,
                maintenance_script=req.maintenance_script,
                task_command=req.task_command,
                setup_network=req.setup_network,
                task_network=req.task_network,
                cpu_limit=req.cpu_limit,
                mem_limit_mb=req.mem_limit_mb,
                pids_limit=req.pids_limit,
                setup_timeout_seconds=req.setup_timeout_seconds,
                maintenance_timeout_seconds=req.maintenance_timeout_seconds,
                task_timeout_seconds=req.task_timeout_seconds,
                cache_key=cache_key,
                cache_workspace_dir=cache_workspace_dir,
                cache_built_at=cache_built_at,
                created_at=created_at,
                updated_at=now,
            )

            # Invalidate cache when config hash changes
            new_key = self._cache_key(record)
            if record.cache_key and record.cache_key != new_key:
                record.cache_key = None
                record.cache_workspace_dir = None
                record.cache_built_at = None

            data[record.environment_id] = record.model_dump(mode="json")
            self._write_meta(data)
            return record

    def get(self, environment_id: str) -> Optional[EnvironmentRecord]:
        data = self._read_meta()
        if environment_id not in data:
            return None
        return EnvironmentRecord.model_validate(data[environment_id])

    def list_all(self) -> Dict[str, EnvironmentRecord]:
        data = self._read_meta()
        return {k: EnvironmentRecord.model_validate(v) for k, v in data.items()}

    def bootstrap(self, environment_id: str, force_rebuild: bool = False) -> EnvironmentBootstrapResponse:
        with self._lock:
            env = self.get(environment_id)
            if env is None:
                raise KeyError(f"environment not found: {environment_id}")

            target_cache_key = self._cache_key(env)
            target_workspace = os.path.join(self.cache_root, environment_id, target_cache_key, "workspace")

            cache_exists = os.path.isdir(target_workspace) and os.path.isdir(os.path.join(target_workspace, "repo"))
            if cache_exists and not force_rebuild:
                if env.cache_key != target_cache_key or env.cache_workspace_dir != target_workspace:
                    self._update_cache_metadata(environment_id, target_cache_key, target_workspace)
                    env = self.get(environment_id) or env

                return EnvironmentBootstrapResponse(
                    environment_id=environment_id,
                    cache_key=target_cache_key,
                    cache_workspace_dir=target_workspace,
                    rebuilt=False,
                    run={"job_id": "cache-hit", "results": [], "artifacts_zip_base64": None},
                )

            steps = [
                {
                    "name": "clone",
                    "network": "egress",
                    "timeout_seconds": max(120, min(1200, env.setup_timeout_seconds)),
                    "command": (
                        "set -euo pipefail\n"
                        "export GIT_TERMINAL_PROMPT=0\n"
                        "rm -rf repo\n"
                        f"git clone --depth=1 {shlex.quote(env.repo_url)} repo\n"
                        "cd repo\n"
                        f"git checkout {shlex.quote(env.default_branch)} || true\n"
                    ),
                },
                {
                    "name": "setup",
                    "network": env.setup_network,
                    "timeout_seconds": env.setup_timeout_seconds,
                    "command": f"set -euo pipefail\nmkdir -p /output\ncd repo\n{env.setup_script}\necho ok > /output/ok.txt",
                },
            ]

            run_req = RunRequest(
                repo_url=env.repo_url,
                ref=env.default_branch,
                steps=steps,
                cpu_limit=env.cpu_limit,
                mem_limit_mb=env.mem_limit_mb,
                pids_limit=env.pids_limit,
                sandbox_image=env.sandbox_image,
            )

            run_res, local_ws_dir, _ = run_job_with_details(run_req)

            repo_source = os.path.join(local_ws_dir, "repo")
            if not os.path.isdir(repo_source):
                raise RuntimeError("bootstrap finished without /workspace/repo; cannot build cache")

            os.makedirs(os.path.dirname(target_workspace), exist_ok=True)
            if os.path.isdir(target_workspace):
                shutil.rmtree(target_workspace, ignore_errors=True)

            os.makedirs(target_workspace, exist_ok=True)
            shutil.copytree(repo_source, os.path.join(target_workspace, "repo"), dirs_exist_ok=True)

            self._update_cache_metadata(environment_id, target_cache_key, target_workspace)

            return EnvironmentBootstrapResponse(
                environment_id=environment_id,
                cache_key=target_cache_key,
                cache_workspace_dir=target_workspace,
                rebuilt=True,
                run=run_res,
            )

    def _update_cache_metadata(self, environment_id: str, cache_key: str, cache_workspace_dir: str) -> None:
        data = self._read_meta()
        if environment_id not in data:
            raise KeyError(f"environment not found: {environment_id}")

        env = EnvironmentRecord.model_validate(data[environment_id])
        env.cache_key = cache_key
        env.cache_workspace_dir = cache_workspace_dir
        env.cache_built_at = _utcnow()
        env.updated_at = _utcnow()
        data[environment_id] = env.model_dump(mode="json")
        self._write_meta(data)

    def run_task(self, environment_id: str, req: EnvironmentTaskRequest) -> EnvironmentTaskResponse:
        with self._lock:
            env = self.get(environment_id)
            if env is None:
                raise KeyError(f"environment not found: {environment_id}")

            bootstrap = self.bootstrap(environment_id, force_rebuild=False)
            env = self.get(environment_id) or env

            branch = (req.branch or env.default_branch).strip() or env.default_branch
            branch_q = shlex.quote(branch)
            remote_branch_q = shlex.quote(f"origin/{branch}")
            command_effective = (req.command or env.task_command).strip() or env.task_command
            task_network = req.task_network or env.task_network

            maintenance_step = {
                "name": "maintenance",
                "network": "egress",
                "timeout_seconds": env.maintenance_timeout_seconds,
                "command": (
                    "set -euo pipefail\n"
                    "mkdir -p /output\n"
                    "cd repo\n"
                    "git fetch --all --prune || true\n"
                    f"git checkout {branch_q} || git checkout -B {branch_q} {remote_branch_q} || true\n"
                    f"{env.maintenance_script}\n"
                    "echo ok > /output/ok.txt"
                ),
            }

            run_step = {
                "name": "task",
                "network": task_network,
                "timeout_seconds": env.task_timeout_seconds,
                "command": (
                    "set -euo pipefail\n"
                    "mkdir -p /output\n"
                    "cd repo\n"
                    f"{command_effective} > /output/result.txt 2>&1\n"
                    "echo ok > /output/ok.txt"
                ),
            }

            run_req = RunRequest(
                repo_url=env.repo_url,
                ref=branch,
                steps=[maintenance_step, run_step],
                cpu_limit=env.cpu_limit,
                mem_limit_mb=env.mem_limit_mb,
                pids_limit=env.pids_limit,
                sandbox_image=env.sandbox_image,
            )

            run_res = run_job_with_details(run_req, workspace_seed_path=bootstrap.cache_workspace_dir)[0]

            return EnvironmentTaskResponse(
                environment_id=environment_id,
                cache_key=bootstrap.cache_key,
                branch=branch,
                command_effective=command_effective,
                run=run_res,
            )


manager = EnvironmentManager()
