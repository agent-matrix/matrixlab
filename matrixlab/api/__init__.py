"""Generic Sandbox Validation Provider API for MatrixLab.

Exposes MatrixLab as a generic sandbox validation provider that any client
(GitPilot, SelfRepair, Agent-Matrix, ...) can call to validate a
repo/branch/patch by running profile commands in a sandbox.
"""

from .app import create_app

__all__ = ["create_app"]
