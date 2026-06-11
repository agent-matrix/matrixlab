"""Sandbox profile loading and validation.

Profiles are simple YAML files under ``matrixlab/profiles/``.  Each profile
declares the commands to run, resource limits, and a fail-closed list of
``forbidden_commands`` patterns that must never appear in any command that
gets executed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Dict, List, Optional

import yaml

PROFILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "profiles")


class ForbiddenCommandError(Exception):
    """Raised when a requested command matches a forbidden pattern (fail-closed)."""

    def __init__(self, command: str, pattern: str) -> None:
        self.command = command
        self.pattern = pattern
        super().__init__(
            f"Refused command {command!r}: matches forbidden pattern {pattern!r}"
        )


@dataclass(frozen=True)
class Profile:
    name: str
    description: str = ""
    language: str = ""
    commands: List[str] = field(default_factory=list)
    timeout_seconds: int = 600
    network: str = "restricted"
    max_memory_mb: int = 4096
    artifacts: bool = True
    artifact_files: List[str] = field(default_factory=list)
    forbidden_commands: List[str] = field(default_factory=list)

    def check_commands(self, commands: List[str]) -> None:
        """Validate commands against ``forbidden_commands``; raise if any match."""
        for cmd in commands:
            self.check_command(cmd)

    def check_command(self, command: str) -> None:
        lowered = command.lower()
        for pattern in self.forbidden_commands:
            if pattern.lower() in lowered:
                raise ForbiddenCommandError(command, pattern)


def _profile_from_dict(data: Dict) -> Profile:
    return Profile(
        name=data["name"],
        description=data.get("description", ""),
        language=data.get("language", ""),
        commands=list(data.get("commands", [])),
        timeout_seconds=int(data.get("timeout_seconds", 600)),
        network=data.get("network", "restricted"),
        max_memory_mb=int(data.get("max_memory_mb", 4096)),
        artifacts=bool(data.get("artifacts", True)),
        artifact_files=list(data.get("artifact_files", [])),
        forbidden_commands=list(data.get("forbidden_commands", [])),
    )


@lru_cache(maxsize=1)
def load_profiles() -> Dict[str, Profile]:
    """Load every ``*.yml`` profile in ``PROFILES_DIR`` keyed by name."""
    profiles: Dict[str, Profile] = {}
    if not os.path.isdir(PROFILES_DIR):
        return profiles
    for fname in sorted(os.listdir(PROFILES_DIR)):
        if not fname.endswith((".yml", ".yaml")):
            continue
        path = os.path.join(PROFILES_DIR, fname)
        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        if not data.get("name"):
            continue
        profile = _profile_from_dict(data)
        profiles[profile.name] = profile
    return profiles


def get_profile(name: str) -> Optional[Profile]:
    return load_profiles().get(name)


def list_profile_names() -> List[str]:
    return sorted(load_profiles().keys())


def list_languages() -> List[str]:
    langs = {p.language for p in load_profiles().values() if p.language}
    return sorted(langs)
