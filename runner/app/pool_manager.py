from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional

from .config import WARM_POOL
from .docker_executor import destroy_sandbox, provision_and_freeze, unfreeze_and_activate

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SandboxLease:
    container_id: str
    image: str
    warm_hit: bool


class SandboxPoolManager:
    """High/low-watermark manager for paused Docker warm sandboxes.

    Containers flow through:
      PROVISIONING -> READY_AND_SLEEPING(paused) -> ACTIVE(unpaused) -> TERMINATING

    A used ACTIVE container is never returned to the pool; callers must release
    it, which destroys it. The background replenisher creates fresh clean
    containers to bring each image back toward max_warm.
    """

    def __init__(self) -> None:
        self.config = WARM_POOL
        self._pools: Dict[str, Deque[str]] = defaultdict(deque)
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._errors: Dict[str, str] = {}
        self._provisioning: Dict[str, int] = defaultdict(int)

    @property
    def enabled(self) -> bool:
        return self.config.enabled

    def start(self, image_resolver) -> None:
        if not self.enabled or self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._replenish_forever, args=(image_resolver,), name="matrixlab-warm-pool", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None
        self.drain()

    def drain(self) -> None:
        with self._lock:
            container_ids = [cid for pool in self._pools.values() for cid in pool]
            self._pools.clear()
        for container_id in container_ids:
            destroy_sandbox(container_id)

    def status(self) -> dict:
        with self._lock:
            return {
                "enabled": self.enabled,
                "min_warm": self.config.min_warm,
                "max_warm": self.config.max_warm,
                "images": list(self.config.images),
                "pools": {image: len(pool) for image, pool in self._pools.items()},
                "provisioning": dict(self._provisioning),
                "errors": dict(self._errors),
            }

    def acquire(
        self,
        image: str,
        *,
        cpu_limit: float,
        mem_limit_mb: int,
        pids_limit: int,
    ) -> Optional[SandboxLease]:
        if not self.enabled:
            return None

        with self._lock:
            pool = self._pools[image]
            if pool:
                container_id = pool.popleft()
                warm_hit = True
            elif self.config.cold_start_when_empty:
                container_id = ""
                warm_hit = False
            else:
                return None

        if not container_id:
            container_id = provision_and_freeze(image, cpu_limit=cpu_limit, mem_limit_mb=mem_limit_mb, pids_limit=pids_limit)

        try:
            unfreeze_and_activate(container_id)
        except Exception:
            destroy_sandbox(container_id)
            raise
        return SandboxLease(container_id=container_id, image=image, warm_hit=warm_hit)

    def release(self, lease: SandboxLease) -> None:
        destroy_sandbox(lease.container_id)

    def _replenish_forever(self, image_resolver) -> None:
        while not self._stop.is_set():
            try:
                self.replenish_once(image_resolver)
            except Exception as exc:  # pragma: no cover - defensive background logging
                logger.exception("warm pool replenish failed: %s", exc)
            self._stop.wait(self.config.replenish_interval_seconds)

    def replenish_once(self, image_resolver) -> None:
        for configured_image in self.config.images:
            image = image_resolver(configured_image)
            with self._lock:
                current = len(self._pools[image]) + self._provisioning[image]
                target = self.config.max_warm if current <= self.config.min_warm else self.config.min_warm
                needed = max(0, target - current)
                if needed:
                    self._provisioning[image] += needed
            for _ in range(needed):
                try:
                    container_id = provision_and_freeze(image)
                    with self._lock:
                        self._pools[image].append(container_id)
                        self._errors.pop(image, None)
                except Exception as exc:
                    with self._lock:
                        self._errors[image] = str(exc)
                    logger.warning("failed to provision warm sandbox for %s: %s", image, exc)
                    # Avoid tight retry loops on broken Docker/image configuration.
                    time.sleep(1)
                finally:
                    with self._lock:
                        self._provisioning[image] = max(0, self._provisioning[image] - 1)


warm_pool_manager = SandboxPoolManager()
