# matrixlab/mcp_server.py
import asyncio
import inspect
import json
import logging
import os
import sys
from typing import Any, Dict, Optional

import requests

# MCP imports: support multiple SDK layouts/versions
import mcp.types as types
import mcp.server.stdio

try:
    # Newer/lowlevel API layouts
    from mcp.server.lowlevel import NotificationOptions, Server  # type: ignore
    from mcp.server.models import InitializationOptions  # type: ignore
except Exception:  # pragma: no cover
    # Fallback: older layout (still may work, but may not support init options)
    from mcp.server import Server  # type: ignore
    NotificationOptions = None  # type: ignore
    InitializationOptions = None  # type: ignore


# ----------------------------
# Config
# ----------------------------
RUNNER_URL = os.environ.get("RUNNER_URL", "http://localhost:8000").rstrip("/")
SERVER_NAME = "matrix-lab"
SERVER_VERSION = os.environ.get("MATRIXLAB_VERSION", "0.1.0")

DEFAULT_ENTRYPOINT = os.environ.get("MATRIXLAB_ENTRYPOINT", "auto")  # auto|python|go|rust|node
DEFAULT_LIMITS = {
    "cpu": float(os.environ.get("MATRIXLAB_CPU", "1.0")),
    "mem_mb": int(os.environ.get("MATRIXLAB_MEM_MB", "1024")),
    "pids": int(os.environ.get("MATRIXLAB_PIDS", "256")),
}

HTTP_TIMEOUT_S = float(os.environ.get("MATRIXLAB_HTTP_TIMEOUT_S", "900"))


# ----------------------------
# Logging (stderr only, forced flush)
# ----------------------------
LOG_LEVEL = os.environ.get("MATRIXLAB_LOG_LEVEL", "INFO").upper()

# Configure logging to write to stderr with automatic newlines and flushing
logging.basicConfig(
    level=LOG_LEVEL,
    format="[matrixlab] %(message)s",
    stream=sys.stderr,   # IMPORTANT: keep logs on stderr for stdio MCP
    force=True,          # IMPORTANT: override any previous logging config
)
log = logging.getLogger("matrixlab")


server = Server(SERVER_NAME)


# ----------------------------
# Runner client helpers
# ----------------------------
def _http_post_json(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{RUNNER_URL}{path}"
    r = requests.post(url, json=payload, timeout=HTTP_TIMEOUT_S)
    r.raise_for_status()
    return r.json()


def _http_get_json(path: str, timeout_s: float = 2.0) -> Optional[Dict[str, Any]]:
    url = f"{RUNNER_URL}{path}"
    try:
        r = requests.get(url, timeout=timeout_s)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.debug("GET %s failed: %s", url, e)
        return None


def _runner_preflight() -> None:
    # Health is recommended
    health = _http_get_json("/health", timeout_s=2.0)
    if health is None:
        log.info("Runner health: UNREACHABLE (%s)", RUNNER_URL)
        return
    log.info("Runner health: %s", json.dumps(health, ensure_ascii=False))

    # Capabilities is optional but very useful for “sandboxes ready” visibility
    caps = _http_get_json("/capabilities", timeout_s=2.0)
    if caps is None:
        log.info("Runner capabilities: (endpoint not available)")
    else:
        log.info("Runner capabilities: %s", json.dumps(caps, ensure_ascii=False))


def _parse_limits(arguments: Dict[str, Any]) -> Dict[str, Any]:
    limits = arguments.get("limits") or {}
    # Accept cpu/mem_mb/pids with sane defaults
    cpu = limits.get("cpu", DEFAULT_LIMITS["cpu"])
    mem_mb = limits.get("mem_mb", DEFAULT_LIMITS["mem_mb"])
    pids = limits.get("pids", DEFAULT_LIMITS["pids"])
    return {"cpu": float(cpu), "mem_mb": int(mem_mb), "pids": int(pids)}


# ----------------------------
# MCP tools
# ----------------------------
@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="repo_run",
            description=(
                "Matrix repo run: Runner clones repo, detects language (entrypoint=auto), "
                "installs deps, runs tests/command in an ephemeral sandbox, returns logs+artifacts."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "repo_url": {"type": "string", "description": "Git repository URL"},
                    "ref": {"type": "string", "description": "Optional git ref/branch/tag/sha"},
                    "command": {"type": "string", "description": "Optional command override"},
                    "entrypoint": {
                        "type": "string",
                        "description": "auto|python|go|rust|node (default: auto)",
                    },
                    "limits": {
                        "type": "object",
                        "description": "Resource limits",
                        "properties": {
                            "cpu": {"type": "number"},
                            "mem_mb": {"type": "integer"},
                            "pids": {"type": "integer"},
                        },
                    },
                },
                "required": ["repo_url"],
            },
        ),
        types.Tool(
            name="zip_run",
            description=(
                "Matrix zip run: Runner unpacks zip, detects language (entrypoint=auto), "
                "installs deps, runs tests/command in an ephemeral sandbox, returns logs+artifacts."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "zip_base64": {"type": "string", "description": "Base64-encoded zip contents"},
                    "filename": {"type": "string", "description": "Optional zip filename (for logs)"},
                    "command": {"type": "string", "description": "Optional command override"},
                    "entrypoint": {
                        "type": "string",
                        "description": "auto|python|go|rust|node (default: auto)",
                    },
                    "limits": {
                        "type": "object",
                        "description": "Resource limits",
                        "properties": {
                            "cpu": {"type": "number"},
                            "mem_mb": {"type": "integer"},
                            "pids": {"type": "integer"},
                        },
                    },
                },
                "required": ["zip_base64"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: Dict[str, Any]) -> types.CallToolResult:
    arguments = arguments or {}

    try:
        if name == "repo_run":
            repo_url = arguments.get("repo_url")
            if not repo_url:
                raise ValueError("repo_url is required")

            payload = {
                "repo_url": repo_url,
                "ref": arguments.get("ref"),
                "command": arguments.get("command", ""),
                "entrypoint": arguments.get("entrypoint", DEFAULT_ENTRYPOINT),
                "limits": _parse_limits(arguments),
            }

            log.info("repo_run: repo_url=%s ref=%s entrypoint=%s", repo_url, payload["ref"], payload["entrypoint"])
            result = _http_post_json("/run_repo", payload)

        elif name == "zip_run":
            zip_b64 = arguments.get("zip_base64")
            if not zip_b64:
                raise ValueError("zip_base64 is required")

            payload = {
                "zip_base64": zip_b64,
                "filename": arguments.get("filename", "upload.zip"),
                "command": arguments.get("command", ""),
                "entrypoint": arguments.get("entrypoint", DEFAULT_ENTRYPOINT),
                "limits": _parse_limits(arguments),
            }

            log.info("zip_run: filename=%s entrypoint=%s", payload["filename"], payload["entrypoint"])
            result = _http_post_json("/run_zip", payload)

        else:
            raise ValueError(f"Unknown tool: {name}")

        text = json.dumps(result, ensure_ascii=False)

    except Exception as e:
        log.exception("Tool call failed: %s", name)
        err = {"error": str(e), "runner_url": RUNNER_URL, "tool": name}
        text = json.dumps(err, ensure_ascii=False)

    return types.CallToolResult(content=[types.TextContent(type="text", text=text)])


# ----------------------------
# MCP server lifecycle
# ----------------------------
def _make_init_opts() -> Any:
    """
    Build InitializationOptions if the installed MCP SDK requires it.
    Returns an object suitable to pass as initialization_options, or None.
    """
    if InitializationOptions is None:
        return None

    capabilities = None
    if hasattr(server, "get_capabilities") and NotificationOptions is not None:
        capabilities = server.get_capabilities(
            notification_options=NotificationOptions(),
            experimental_capabilities={},
        )

    kwargs: Dict[str, Any] = {
        "server_name": SERVER_NAME,
        "server_version": SERVER_VERSION,
    }
    if capabilities is not None:
        kwargs["capabilities"] = capabilities

    return InitializationOptions(**kwargs)


async def main() -> None:
    log.info("MCP stdio server starting: name=%s version=%s", SERVER_NAME, SERVER_VERSION)
    log.info("RUNNER_URL=%s", RUNNER_URL)
    _runner_preflight()
    log.info("Ready. Waiting for MCP client on stdin... (logs on stderr)")

    init_opts = _make_init_opts()
    sig = inspect.signature(server.run)

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        # Some MCP SDK versions require initialization_options; others don't.
        if "initialization_options" in sig.parameters and init_opts is not None:
            await server.run(read_stream, write_stream, initialization_options=init_opts)
        elif len(sig.parameters) >= 4 and init_opts is not None:
            await server.run(read_stream, write_stream, init_opts)
        else:
            await server.run(read_stream, write_stream)


def cli() -> int:
    try:
        asyncio.run(main())
        return 0
    except KeyboardInterrupt:
        log.info("Shutdown requested (Ctrl-C).")
        return 0
    except Exception:
        log.exception("Fatal error in MCP server")
        return 1


if __name__ == "__main__":
    raise SystemExit(cli())