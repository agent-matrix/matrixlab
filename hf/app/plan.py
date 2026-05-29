"""Sandbox testability verifier for MatrixHub catalog entries.

The public Matrix Hub API exposes *metadata only* (id, name, type, source_url,
…) — it does NOT return a runnable build (no ``packages`` / ``mcp_registration``
/ exec command). The no-secrets sandbox therefore can only trial servers for
which we have a known, packaged, credential-free run command.

This module is the single source of truth for "can this entry be tested in our
sandbox?". It is mirrored in the matrixhub UI by ``lib/sandboxEligibility.ts``
(keep the two registries in sync). See
``matrixhub/docs/SANDBOX_TESTABILITY.md`` for the full design + reproduction.

Verdict:
    {
      "testable": bool,
      "reason": str,            # human-readable, shown as the UI tag tooltip
      "runtime": "node|python", # only when testable
      "transport": "stdio",     # only when testable
      "start_command": "...",   # only when testable
    }
"""
from __future__ import annotations

import re
from typing import Any


# --- Curated registry of sandbox-runnable MCP servers ----------------------
# These are packaged, credential-free MCP servers verified to start in the
# no-secrets sandbox (npx for Node, uvx for Python). Matched against a
# haystack of id + name + source_url. A match requires EITHER a strict
# ``pattern`` (explicit ``server-<key>`` / ``mcp-server-<key>`` token) OR the
# official ``modelcontextprotocol`` repo plus the ``word``. This keeps the
# "testable" tag conservative — we never mislabel an unrelated server.
# Order matters (first match wins).
SANDBOX_REGISTRY: list[dict[str, Any]] = [
    {"key": "filesystem", "pattern": r"(?:mcp[-_])?server[-_]filesystem", "word": r"\bfilesystem\b",
     "runtime": "node", "start_command": "npx -y @modelcontextprotocol/server-filesystem /tmp"},
    {"key": "everything", "pattern": r"(?:mcp[-_])?server[-_]everything", "word": r"\beverything\b",
     "runtime": "node", "start_command": "npx -y @modelcontextprotocol/server-everything"},
    {"key": "memory", "pattern": r"(?:mcp[-_])?server[-_]memory", "word": r"\bmemory\b",
     "runtime": "node", "start_command": "npx -y @modelcontextprotocol/server-memory"},
    {"key": "sequentialthinking", "pattern": r"sequential[-_]?thinking", "word": r"sequential[-_]?thinking",
     "runtime": "node", "start_command": "npx -y @modelcontextprotocol/server-sequential-thinking"},
    {"key": "time", "pattern": r"(?:mcp[-_])?server[-_]time", "word": r"\btime\b",
     "runtime": "python", "start_command": "uvx mcp-server-time"},
    {"key": "fetch", "pattern": r"(?:mcp[-_])?server[-_]fetch", "word": r"\bfetch\b",
     "runtime": "python", "start_command": "uvx mcp-server-fetch"},
    {"key": "git", "pattern": r"(?:mcp[-_])?server[-_]git\b", "word": r"\bgit\b",
     "runtime": "python", "start_command": "uvx mcp-server-git"},
]

OFFICIAL_RE = r"modelcontextprotocol"

# Signals that a server CANNOT run in a no-secrets sandbox even if packaged:
# SaaS connectors / anything that needs real API credentials to do anything.
BLOCKERS: list[dict[str, str]] = [
    {"pattern": r"retell|talentlms|microsoft|\boffice\b|openai|anthropic|slack|"
                r"salesforce|notion|gmail|google|stripe|twilio|hubspot|jira|"
                r"confluence|aws|azure|\bgcp\b|databricks|snowflake|watsonx|"
                r"sendgrid|sentry|datadog|pagerduty|zendesk|shopify",
     "reason": "SaaS connector — requires API credentials"},
]

NOT_PACKAGED_REASON = (
    "No packaged sandbox build available "
    "(the public catalog exposes no credential-free run command)"
)


def _haystack(entity: dict[str, Any]) -> str:
    return " ".join(str(entity.get(k) or "") for k in ("id", "name", "source_url", "homepage")).lower()


def verify(entity: dict[str, Any]) -> dict[str, Any]:
    """Return a sandbox-testability verdict for a catalog entity dict."""
    hay = _haystack(entity)

    for b in BLOCKERS:
        if re.search(b["pattern"], hay):
            return {"testable": False, "reason": b["reason"]}

    official = bool(re.search(OFFICIAL_RE, hay))
    for entry in SANDBOX_REGISTRY:
        if re.search(entry["pattern"], hay) or (official and re.search(entry["word"], hay)):
            return {
                "testable": True,
                "reason": f"packaged reference server ({entry['key']})",
                "runtime": entry["runtime"],
                "transport": "stdio",
                "start_command": entry["start_command"],
            }

    return {"testable": False, "reason": NOT_PACKAGED_REASON}


def is_testable(entity: dict[str, Any]) -> bool:
    return verify(entity)["testable"]
