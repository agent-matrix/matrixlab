from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Tuple


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _env_csv(name: str, default: str) -> Tuple[str, ...]:
    raw = os.environ.get(name, default)
    return tuple(item.strip() for item in raw.split(",") if item.strip())


@dataclass(frozen=True)
class WarmPoolConfig:
    """Configuration for Docker cgroup-freezer warm sandbox pools.

    The warm pool is disabled by default because it provisions idle containers.
    Enable it explicitly with MATRIXLAB_WARM_POOL_ENABLED=1 on Docker-capable
    worker nodes.
    """

    enabled: bool = _env_bool("MATRIXLAB_WARM_POOL_ENABLED", False)
    min_warm: int = _env_int("MATRIXLAB_WARM_POOL_MIN", 3)
    max_warm: int = _env_int("MATRIXLAB_WARM_POOL_MAX", 5)
    images: Tuple[str, ...] = _env_csv("MATRIXLAB_WARM_POOL_IMAGES", "python,node")
    replenish_interval_seconds: float = _env_float("MATRIXLAB_WARM_POOL_REPLENISH_INTERVAL_S", 2.0)
    container_ready_timeout_seconds: int = _env_int("MATRIXLAB_WARM_POOL_READY_TIMEOUT_S", 20)
    cold_start_when_empty: bool = _env_bool("MATRIXLAB_WARM_POOL_COLD_START_WHEN_EMPTY", True)


WARM_POOL = WarmPoolConfig()
