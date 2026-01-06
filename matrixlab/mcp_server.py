"""
matrixlab/mcp_server.py

Production MCP server for MatrixLab
Explorer + Editor + Intelligence + Executor + Runner Diagnostics + Artifact Utilities

Key improvements:
- Many tools (repo + zip)
- Clear Runner diagnostics (health/capabilities + common failure hints)
- Better artifact zip parsing helpers (accept artifacts_zip_base64 as input)
- Uses async httpx
- Stderr-only logging (safe for stdio MCP)
- MCP SDK compatibility: initialization_options passed only if supported
"""

from __future__ import annotations

import asyncio
import base64
import inspect
import io
import json
import logging
import os
import re
import shlex
import sys
import zipfile
from typing import Any, Dict, List, Optional, Union

import httpx

import mcp.types as types
import mcp.server.stdio

try:
    from mcp.server.lowlevel import NotificationOptions, Server  # type: ignore
    from mcp.server.models import InitializationOptions  # type: ignore
except Exception:  # pragma: no cover
    from mcp.server import Server  # type: ignore
    NotificationOptions = None  # type: ignore
    InitializationOptions = None  # type: ignore


# =============================================================================
# Config
# =============================================================================
RUNNER_URL = os.environ.get("RUNNER_URL", "http://localhost:8000").rstrip("/")
SERVER_NAME = os.environ.get("MATRIXLAB_SERVER_NAME", "matrix-lab")
SERVER_VERSION = os.environ.get("MATRIXLAB_VERSION", "1.2.0")

HTTP_TIMEOUT_S = float(os.environ.get("MATRIXLAB_HTTP_TIMEOUT_S", "900"))

DEFAULT_LIMITS = {
    "cpu": float(os.environ.get("MATRIXLAB_CPU", "1.0")),
    "mem_mb": int(os.environ.get("MATRIXLAB_MEM_MB", "1024")),
    "pids": int(os.environ.get("MATRIXLAB_PIDS", "256")),
}

# Images (default to local compose tags)
IMG_UTILS = os.environ.get("MATRIXLAB_IMG_UTILS", "matrix-lab-sandbox-utils:latest")
IMG_PY = os.environ.get("MATRIXLAB_IMG_PY", "matrix-lab-sandbox-python:latest")
IMG_GO = os.environ.get("MATRIXLAB_IMG_GO", "matrix-lab-sandbox-go:latest")
IMG_RUST = os.environ.get("MATRIXLAB_IMG_RUST", "matrix-lab-sandbox-rust:latest")
IMG_NODE = os.environ.get("MATRIXLAB_IMG_NODE", "matrix-lab-sandbox-node:latest")

SUPPORTED_LANGS = {"python", "go", "rust", "node"}

# Logging (stderr only for MCP stdio)
LOG_LEVEL = os.environ.get("MATRIXLAB_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="[matrixlab] %(message)s",
    stream=sys.stderr,
    force=True,
)
log = logging.getLogger("matrixlab")

server = Server(SERVER_NAME)


# =============================================================================
# HTTP helpers (async)
# =============================================================================
async def _http_post_json(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{RUNNER_URL}{path}"
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        return r.json()


async def _http_get_json(path: str, timeout_s: float = 2.0) -> Optional[Dict[str, Any]]:
    url = f"{RUNNER_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


async def _runner_preflight() -> Dict[str, Any]:
    health = await _http_get_json("/health", timeout_s=2.0)
    caps = await _http_get_json("/capabilities", timeout_s=2.0)

    out: Dict[str, Any] = {"runner_url": RUNNER_URL, "health": health, "capabilities": caps}
    if health is None:
        log.info("Runner health: UNREACHABLE (%s)", RUNNER_URL)
    else:
        log.info("Runner health: %s", json.dumps(health, ensure_ascii=False))

    if caps is None:
        log.info("Runner capabilities: (endpoint not available)")
    else:
        log.info("Runner capabilities: %s", json.dumps(caps, ensure_ascii=False))
    return out


# =============================================================================
# Artifact helpers (zip base64)
# =============================================================================
def _zip_names_from_b64(artifacts_zip_base64: str) -> List[str]:
    raw = base64.b64decode(artifacts_zip_base64)
    with zipfile.ZipFile(io.BytesIO(raw), "r") as z:
        return z.namelist()


def _read_artifact_text(artifacts_zip_base64: Optional[str], target_filename: str) -> str:
    """
    Robustly read a file from artifact zip (base64).
    - exact name match
    - basename match anywhere in zip
    """
    if not artifacts_zip_base64:
        return ""
    try:
        raw = base64.b64decode(artifacts_zip_base64)
        with zipfile.ZipFile(io.BytesIO(raw), "r") as z:
            names = z.namelist()

            if target_filename in names:
                with z.open(target_filename, "r") as f:
                    return f.read().decode("utf-8", errors="replace")

            for name in names:
                if name.endswith("/" + target_filename) or name == target_filename:
                    with z.open(name, "r") as f:
                        return f.read().decode("utf-8", errors="replace")
        return ""
    except Exception as e:
        log.error("Failed to read artifact %s: %s", target_filename, e)
        return ""


def _truncate(s: str, max_len: int = 15000) -> str:
    if not s:
        return ""
    if len(s) <= max_len:
        return s
    head = s[: max_len // 2]
    tail = s[-max_len // 2 :]
    return head + "\n...\n[TRUNCATED]\n...\n" + tail


# =============================================================================
# Shell quoting + sanitization
# =============================================================================
def _q(s: str) -> str:
    return shlex.quote(s if s is not None else "")


def _sanitize_rel_path(p: str, *, allow_dot: bool = True) -> str:
    p = (p or "").replace("\x00", "").strip()
    p = p.lstrip("/")
    p = re.sub(r"/+", "/", p)

    if ".." in p:
        raise ValueError("path traversal is not allowed")
    if not p:
        raise ValueError("empty path is not allowed")
    if not allow_dot and p == ".":
        raise ValueError("path '.' is not allowed here")
    return p


def _parse_limits(arguments: Dict[str, Any]) -> Dict[str, Any]:
    limits = (arguments or {}).get("limits") or {}
    cpu = limits.get("cpu", DEFAULT_LIMITS["cpu"])
    mem_mb = limits.get("mem_mb", DEFAULT_LIMITS["mem_mb"])
    pids = limits.get("pids", DEFAULT_LIMITS["pids"])
    return {"cpu": float(cpu), "mem_mb": int(mem_mb), "pids": int(pids)}


def _image_for_lang(lang: str) -> str:
    return {
        "python": IMG_PY,
        "go": IMG_GO,
        "rust": IMG_RUST,
        "node": IMG_NODE,
    }.get(lang, IMG_PY)


# =============================================================================
# Runner failure diagnosis (important for your docker-missing case)
# =============================================================================
def _runner_failure_hints(res: Dict[str, Any]) -> List[str]:
    hints: List[str] = []
    results = res.get("results") or []
    for step in results:
        stderr = (step.get("stderr") or "") if isinstance(step, dict) else ""
        if "No such file or directory: 'docker'" in stderr or "No such file or directory: \"docker\"" in stderr:
            hints.append(
                "Runner cannot find the `docker` binary. Fix Runner container/host: "
                "install docker CLI inside runner image OR ensure `docker` is in PATH, "
                "and mount /var/run/docker.sock into the Runner container."
            )
        if "permission denied" in stderr.lower() and "docker" in stderr.lower():
            hints.append(
                "Runner cannot access Docker socket (permission denied). "
                "Ensure Runner container has /var/run/docker.sock mounted and permissions allow access."
            )
        if "Cannot connect to the Docker daemon" in stderr:
            hints.append(
                "Runner sees docker but cannot connect to the daemon. "
                "Mount /var/run/docker.sock or run Runner on a host with Docker daemon available."
            )
    return list(dict.fromkeys(hints))


# =============================================================================
# Scripts (clone/unzip/detect/patch)
# =============================================================================
def _clone_script(repo_url: str, ref: Optional[str]) -> str:
    checkout = f"git checkout {shlex.quote(ref)}" if ref else "true"
    # prevent hangs on auth prompts
    return f"""
set -euo pipefail
export GIT_TERMINAL_PROMPT=0
mkdir -p /output
rm -rf repo
git clone --depth=1 {_q(repo_url)} repo
cd repo
{checkout} || true
echo ok > /output/ok.txt
"""


def _zip_unpack_script(zip_base64: str, filename: str = "upload.zip") -> str:
    # Keep zip on disk for debugging
    return f"""
set -euo pipefail
mkdir -p /output
rm -rf repo
mkdir -p /workspace/repo
cd /workspace
printf '%s' {_q(zip_base64)} | base64 -d > {_q(filename)}
cd /workspace/repo
unzip -o /workspace/{_q(filename)} > /dev/null
echo ok > /output/ok.txt
"""


def _detect_script() -> str:
    return r"""
set -euo pipefail
mkdir -p /output
cd repo

detect_one() {
  local d="$1"
  [ -d "$d" ] || return 0
  if [ -f "$d/go.mod" ]; then echo "go"; return 0; fi
  if [ -f "$d/Cargo.toml" ]; then echo "rust"; return 0; fi
  if [ -f "$d/package.json" ]; then echo "node"; return 0; fi
  if [ -f "$d/pyproject.toml" ] || [ -f "$d/requirements.txt" ] || [ -f "$d/setup.py" ]; then echo "python"; return 0; fi
  echo ""
}

lang="$(detect_one .)"
if [ -z "$lang" ]; then
  for sub in ./*; do
    [ -d "$sub" ] || continue
    lang="$(detect_one "$sub")"
    if [ -n "$lang" ]; then break; fi
  done
fi

if [ -z "$lang" ]; then lang="unknown"; fi

echo "$lang" > /output/language.txt
(find . -maxdepth 3 -type f | head -n 400 > /output/tree_files.txt) || true
echo ok > /output/ok.txt
"""


def _patch_script(files_override: Dict[str, str]) -> str:
    if not files_override:
        return "echo 'No patches.'"
    lines = ["set -euo pipefail", "mkdir -p /output", "cd repo", "echo '== Applying patches =='"]
    for raw_path, content in files_override.items():
        rel_path = _sanitize_rel_path(raw_path)
        b64 = base64.b64encode(content.encode("utf-8")).decode("ascii")
        lines += [
            f"mkdir -p \"$(dirname {_q(rel_path)})\" || true",
            f"printf '%s' {_q(b64)} | base64 -d > {_q(rel_path)}",
            f"echo 'Patched: {rel_path}'",
        ]
    lines += ["echo '== Patches applied =='", "echo ok > /output/ok.txt"]
    return "\n".join(lines)


# =============================================================================
# Default commands + pipelines
# =============================================================================
def _default_command_for_lang(lang: str) -> str:
    if lang == "python":
        return "(pytest -q || python -m unittest discover || python -m compileall .)"
    if lang == "node":
        return "(npm test --silent || npm run test --silent || node -v)"
    if lang == "go":
        return "go test ./..."
    if lang == "rust":
        return "cargo test"
    return "ls -la"


def _install_and_run_steps(lang: str, command: str, install_dependencies: bool) -> List[Dict[str, Any]]:
    cmd = (command or "").strip() or _default_command_for_lang(lang)
    common_prefix = "mkdir -p /output && cd repo && "

    if lang == "python":
        venv_cmd = "python -m venv .venv && . .venv/bin/activate && python -V && pip -V"
        install_cmd = (
            ". .venv/bin/activate && "
            "if [ -f requirements.txt ]; then pip install -r requirements.txt; "
            "elif [ -f pyproject.toml ] || [ -f setup.py ]; then pip install -e .; "
            "else echo 'No python install config; skipping.'; fi"
        )
        run_cmd = f". .venv/bin/activate && {cmd}"
        steps = [{"name": "venv", "network": "none", "timeout_seconds": 240, "command": common_prefix + venv_cmd}]
        if install_dependencies:
            steps.append({"name": "install", "network": "egress", "timeout_seconds": 900, "command": common_prefix + install_cmd})
        steps.append(
            {
                "name": "run",
                "network": "none",
                "timeout_seconds": 900,
                "command": common_prefix + run_cmd + " > /output/result.txt 2>&1 && echo ok > /output/ok.txt",
            }
        )
        return steps

    if lang == "node":
        install_cmd = "node -v && npm -v && if [ -f package-lock.json ]; then npm ci; else npm install; fi"
        steps2: List[Dict[str, Any]] = []
        if install_dependencies:
            steps2.append({"name": "install", "network": "egress", "timeout_seconds": 900, "command": common_prefix + install_cmd})
        steps2.append(
            {
                "name": "run",
                "network": "none",
                "timeout_seconds": 900,
                "command": common_prefix + cmd + " > /output/result.txt 2>&1 && echo ok > /output/ok.txt",
            }
        )
        return steps2

    if lang == "go":
        run_net = "egress" if install_dependencies else "none"
        run_cmd = f"go version && {cmd}"
        return [{"name": "run", "network": run_net, "timeout_seconds": 900, "command": common_prefix + run_cmd + " > /output/result.txt 2>&1 && echo ok > /output/ok.txt"}]

    if lang == "rust":
        run_net = "egress" if install_dependencies else "none"
        run_cmd = f"rustc -V && cargo -V && {cmd}"
        return [{"name": "run", "network": run_net, "timeout_seconds": 1200, "command": common_prefix + run_cmd + " > /output/result.txt 2>&1 && echo ok > /output/ok.txt"}]

    return [{"name": "run", "network": "none", "timeout_seconds": 300, "command": common_prefix + cmd + " > /output/result.txt 2>&1 && echo ok > /output/ok.txt"}]


# =============================================================================
# One-shot helpers (utils sandbox) for explorer tools
# =============================================================================
async def _run_utils_one_shot_from_repo(repo_url: str, ref: Optional[str], shell_cmd: str, timeout: int = 120) -> Dict[str, Any]:
    full_cmd = f"""
set -euo pipefail
mkdir -p /output
cd repo
{{ {shell_cmd} ; }} > /output/result.txt 2>&1 || true
echo ok > /output/ok.txt
"""
    payload = {
        "repo_url": repo_url,
        "ref": ref,
        "cpu_limit": DEFAULT_LIMITS["cpu"],
        "mem_limit_mb": DEFAULT_LIMITS["mem_mb"],
        "pids_limit": DEFAULT_LIMITS["pids"],
        "sandbox_image": IMG_UTILS,
        "steps": [
            {"name": "clone", "network": "egress", "timeout_seconds": 240, "command": _clone_script(repo_url, ref)},
            {"name": "cmd", "network": "none", "timeout_seconds": timeout, "command": full_cmd},
        ],
    }
    return await _http_post_json("/run", payload)


async def _run_utils_one_shot_from_zip(zip_base64: str, shell_cmd: str, timeout: int = 120) -> Dict[str, Any]:
    full_cmd = f"""
set -euo pipefail
mkdir -p /output
cd /workspace/repo
{{ {shell_cmd} ; }} > /output/result.txt 2>&1 || true
echo ok > /output/ok.txt
"""
    payload = {
        "repo_url": "zip://upload",
        "cpu_limit": DEFAULT_LIMITS["cpu"],
        "mem_limit_mb": DEFAULT_LIMITS["mem_mb"],
        "pids_limit": DEFAULT_LIMITS["pids"],
        "sandbox_image": IMG_UTILS,
        "steps": [
            {"name": "unpack", "network": "none", "timeout_seconds": 240, "command": _zip_unpack_script(zip_base64)},
            {"name": "cmd", "network": "none", "timeout_seconds": timeout, "command": full_cmd},
        ],
    }
    return await _http_post_json("/run", payload)


# =============================================================================
# Intelligence
# =============================================================================
async def _detect_stack_from_repo(repo_url: str, ref: Optional[str], limits: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        "repo_url": repo_url,
        "ref": ref,
        "cpu_limit": limits["cpu"],
        "mem_limit_mb": limits["mem_mb"],
        "pids_limit": limits["pids"],
        "sandbox_image": IMG_UTILS,
        "steps": [
            {"name": "clone", "network": "egress", "timeout_seconds": 240, "command": _clone_script(repo_url, ref)},
            {"name": "detect", "network": "none", "timeout_seconds": 90, "command": _detect_script()},
        ],
    }
    res = await _http_post_json("/run", payload)
    b64 = res.get("artifacts_zip_base64")
    lang = (_read_artifact_text(b64, "language.txt") or "").strip() or "unknown"
    tree = _truncate(_read_artifact_text(b64, "tree_files.txt") or "", 8000)
    return {
        "language": lang,
        "image": _image_for_lang(lang if lang in SUPPORTED_LANGS else "python"),
        "tree_files_preview": tree,
        "raw": res,
        "hints": _runner_failure_hints(res),
    }


async def _detect_stack_from_zip(zip_base64: str, limits: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        "repo_url": "zip://upload",
        "cpu_limit": limits["cpu"],
        "mem_limit_mb": limits["mem_mb"],
        "pids_limit": limits["pids"],
        "sandbox_image": IMG_UTILS,
        "steps": [
            {"name": "unpack", "network": "none", "timeout_seconds": 240, "command": _zip_unpack_script(zip_base64)},
            {"name": "detect", "network": "none", "timeout_seconds": 90, "command": _detect_script()},
        ],
    }
    res = await _http_post_json("/run", payload)
    b64 = res.get("artifacts_zip_base64")
    lang = (_read_artifact_text(b64, "language.txt") or "").strip() or "unknown"
    tree = _truncate(_read_artifact_text(b64, "tree_files.txt") or "", 8000)
    return {
        "language": lang,
        "image": _image_for_lang(lang if lang in SUPPORTED_LANGS else "python"),
        "tree_files_preview": tree,
        "raw": res,
        "hints": _runner_failure_hints(res),
    }


# =============================================================================
# MCP Tools list (many tools, repo+zip + artifact utils + runner diagnostics)
# =============================================================================
@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        # ---- Runner diagnostics ----
        types.Tool(
            name="runner_status",
            description="Get Runner health + capabilities (best-effort).",
            inputSchema={"type": "object", "properties": {}},
        ),

        # ---- Artifact utilities (ChatGPT/Gemini agents love these) ----
        types.Tool(
            name="artifacts_list",
            description="List files inside artifacts_zip_base64 (base64-encoded zip).",
            inputSchema={
                "type": "object",
                "properties": {"artifacts_zip_base64": {"type": "string"}},
                "required": ["artifacts_zip_base64"],
            },
        ),
        types.Tool(
            name="artifacts_read_text",
            description="Read a text file from artifacts_zip_base64 by basename (e.g. result.txt).",
            inputSchema={
                "type": "object",
                "properties": {
                    "artifacts_zip_base64": {"type": "string"},
                    "filename": {"type": "string"},
                    "max_chars": {"type": "integer", "default": 20000},
                },
                "required": ["artifacts_zip_base64", "filename"],
            },
        ),

        # ---- Explorer (git) ----
        types.Tool(
            name="list_files",
            description="Recursively list files (find). Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {
                    "repo_url": {"type": "string"},
                    "ref": {"type": "string"},
                    "path": {"type": "string", "default": "."},
                    "depth": {"type": "integer", "default": 4},
                },
                "required": ["repo_url"],
            },
        ),
        types.Tool(
            name="read_file",
            description="Read a file from a git repo (max_bytes). Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {
                    "repo_url": {"type": "string"},
                    "ref": {"type": "string"},
                    "file_path": {"type": "string"},
                    "max_bytes": {"type": "integer", "default": 20000},
                },
                "required": ["repo_url", "file_path"],
            },
        ),
        types.Tool(
            name="search_files",
            description="Search a git repo with rg (or grep). Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {
                    "repo_url": {"type": "string"},
                    "ref": {"type": "string"},
                    "query": {"type": "string"},
                    "path": {"type": "string", "default": "."},
                    "max_lines": {"type": "integer", "default": 400},
                },
                "required": ["repo_url", "query"],
            },
        ),
        types.Tool(
            name="file_info",
            description="Return file metadata (stat). Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {"repo_url": {"type": "string"}, "ref": {"type": "string"}, "file_path": {"type": "string"}},
                "required": ["repo_url", "file_path"],
            },
        ),

        # ---- Explorer (zip) ----
        types.Tool(
            name="zip_list_files",
            description="List files inside uploaded zip (base64). Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {"zip_base64": {"type": "string"}, "path": {"type": "string", "default": "."}, "depth": {"type": "integer", "default": 4}},
                "required": ["zip_base64"],
            },
        ),
        types.Tool(
            name="zip_read_file",
            description="Read file from uploaded zip (base64). Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {"zip_base64": {"type": "string"}, "file_path": {"type": "string"}, "max_bytes": {"type": "integer", "default": 20000}},
                "required": ["zip_base64", "file_path"],
            },
        ),
        types.Tool(
            name="zip_search_files",
            description="Search inside uploaded zip (base64). Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {"zip_base64": {"type": "string"}, "query": {"type": "string"}, "path": {"type": "string", "default": "."}, "max_lines": {"type": "integer", "default": 400}},
                "required": ["zip_base64", "query"],
            },
        ),
        types.Tool(
            name="zip_file_info",
            description="File metadata (stat) inside uploaded zip. Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {"zip_base64": {"type": "string"}, "file_path": {"type": "string"}},
                "required": ["zip_base64", "file_path"],
            },
        ),

        # ---- Editor (git) ----
        types.Tool(
            name="write_file",
            description="Patch/overwrite a file (ephemeral) then verify with stat. Runs in sandbox-utils.",
            inputSchema={
                "type": "object",
                "properties": {"repo_url": {"type": "string"}, "ref": {"type": "string"}, "file_path": {"type": "string"}, "content": {"type": "string"}},
                "required": ["repo_url", "file_path", "content"],
            },
        ),

        # ---- Intelligence ----
        types.Tool(
            name="detect_stack",
            description="Detect language & recommended sandbox image from git repo. Runs in sandbox-utils.",
            inputSchema={"type": "object", "properties": {"repo_url": {"type": "string"}, "ref": {"type": "string"}, "limits": {"type": "object"}}, "required": ["repo_url"]},
        ),
        types.Tool(
            name="zip_detect_stack",
            description="Detect language & recommended sandbox image from uploaded zip. Runs in sandbox-utils.",
            inputSchema={"type": "object", "properties": {"zip_base64": {"type": "string"}, "limits": {"type": "object"}}, "required": ["zip_base64"]},
        ),

        # ---- Executor (git + zip) ----
        types.Tool(
            name="repo_run",
            description="Clone -> (optional) detect -> (optional) patch -> (optional) install -> run command in sandbox.",
            inputSchema={
                "type": "object",
                "properties": {
                    "repo_url": {"type": "string"},
                    "ref": {"type": "string"},
                    "command": {"type": "string"},
                    "entrypoint": {"type": "string", "enum": ["auto", "python", "node", "go", "rust"], "default": "auto"},
                    "install_dependencies": {"type": "boolean", "default": True},
                    "files_override": {"type": "object", "additionalProperties": {"type": "string"}, "default": {}},
                    "limits": {"type": "object"},
                },
                "required": ["repo_url"],
            },
        ),
        types.Tool(
            name="zip_run",
            description="Unpack zip (base64) -> (optional) detect -> (optional) patch -> (optional) install -> run command in sandbox.",
            inputSchema={
                "type": "object",
                "properties": {
                    "zip_base64": {"type": "string"},
                    "command": {"type": "string"},
                    "entrypoint": {"type": "string", "enum": ["auto", "python", "node", "go", "rust"], "default": "auto"},
                    "install_dependencies": {"type": "boolean", "default": True},
                    "files_override": {"type": "object", "additionalProperties": {"type": "string"}, "default": {}},
                    "limits": {"type": "object"},
                },
                "required": ["zip_base64"],
            },
        ),
    ]


# =============================================================================
# Tool dispatcher
# IMPORTANT: return List[Content] (NOT CallToolResult) for this Server API
# =============================================================================
@server.call_tool()
async def call_tool(
    name: str, arguments: Dict[str, Any]
) -> List[Union[types.TextContent, types.ImageContent, types.EmbeddedResource]]:
    arguments = arguments or {}

    def _text(obj: Any) -> List[types.TextContent]:
        if isinstance(obj, str):
            return [types.TextContent(type="text", text=obj)]
        return [types.TextContent(type="text", text=json.dumps(obj, ensure_ascii=False))]

    try:
        if name == "runner_status":
            return _text(await _runner_preflight())

        if name == "artifacts_list":
            b64 = arguments["artifacts_zip_base64"]
            try:
                names = _zip_names_from_b64(b64)
                return _text({"files": names})
            except Exception as e:
                return _text({"error": str(e), "hint": "artifacts_zip_base64 must be a base64-encoded zip (Runner artifacts_zip_base64)."})

        if name == "artifacts_read_text":
            b64 = arguments["artifacts_zip_base64"]
            filename = arguments["filename"]
            max_chars = int(arguments.get("max_chars", 20000))
            text = _read_artifact_text(b64, filename)
            return _text({"filename": filename, "text": _truncate(text, max_chars)})

        # ---------------- Explorer (git) ----------------
        if name == "list_files":
            repo_url = arguments["repo_url"]
            ref = arguments.get("ref")
            path = _sanitize_rel_path(arguments.get("path", "."))
            depth = int(arguments.get("depth", 4))
            cmd = f"find {_q(path)} -maxdepth {depth} \\( -type f -o -type d \\) | sed 's#^\\./##' | head -n 2000"
            res = await _run_utils_one_shot_from_repo(repo_url, ref, cmd, timeout=120)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 15000) or "[No output]", "hints": _runner_failure_hints(res)})

        if name == "read_file":
            repo_url = arguments["repo_url"]
            ref = arguments.get("ref")
            file_path = _sanitize_rel_path(arguments.get("file_path", ""), allow_dot=False)
            max_bytes = int(arguments.get("max_bytes", 20000))
            py = f"""
python3 - <<'PY'
import sys
p={file_path!r}
mx={max_bytes}
try:
    with open(p,'rb') as f:
        b=f.read(mx)
    sys.stdout.write(b.decode('utf-8','replace'))
except FileNotFoundError:
    print("ERROR: file not found:", p)
except IsADirectoryError:
    print("ERROR: path is a directory:", p)
except Exception as e:
    print("ERROR:", type(e).__name__, str(e))
PY
"""
            res = await _run_utils_one_shot_from_repo(repo_url, ref, py.strip(), timeout=120)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 20000) or "[No output]", "hints": _runner_failure_hints(res)})

        if name == "search_files":
            repo_url = arguments["repo_url"]
            ref = arguments.get("ref")
            query = arguments.get("query", "")
            path = _sanitize_rel_path(arguments.get("path", "."))
            max_lines = int(arguments.get("max_lines", 400))
            cmd = (
                f"(rg -n --hidden --no-ignore-vcs --glob '!.git/*' {_q(query)} {_q(path)} "
                f"|| grep -RIn --exclude-dir=.git {_q(query)} {_q(path)} || true) "
                f"| head -n {max_lines}"
            )
            res = await _run_utils_one_shot_from_repo(repo_url, ref, cmd, timeout=180)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 15000) or "[No matches]", "hints": _runner_failure_hints(res)})

        if name == "file_info":
            repo_url = arguments["repo_url"]
            ref = arguments.get("ref")
            file_path = _sanitize_rel_path(arguments.get("file_path", ""), allow_dot=False)
            cmd = f"(stat {_q(file_path)} || ls -la {_q(file_path)} || true)"
            res = await _run_utils_one_shot_from_repo(repo_url, ref, cmd, timeout=60)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 8000) or "[No output]", "hints": _runner_failure_hints(res)})

        # ---------------- Explorer (zip) ----------------
        if name == "zip_list_files":
            zip_b64 = arguments["zip_base64"]
            path = _sanitize_rel_path(arguments.get("path", "."))
            depth = int(arguments.get("depth", 4))
            cmd = f"find {_q(path)} -maxdepth {depth} \\( -type f -o -type d \\) | sed 's#^\\./##' | head -n 2000"
            res = await _run_utils_one_shot_from_zip(zip_b64, cmd, timeout=120)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 15000) or "[No output]", "hints": _runner_failure_hints(res)})

        if name == "zip_read_file":
            zip_b64 = arguments["zip_base64"]
            file_path = _sanitize_rel_path(arguments.get("file_path", ""), allow_dot=False)
            max_bytes = int(arguments.get("max_bytes", 20000))
            py = f"""
python3 - <<'PY'
import sys
p={file_path!r}
mx={max_bytes}
try:
    with open(p,'rb') as f:
        b=f.read(mx)
    sys.stdout.write(b.decode('utf-8','replace'))
except FileNotFoundError:
    print("ERROR: file not found:", p)
except IsADirectoryError:
    print("ERROR: path is a directory:", p)
except Exception as e:
    print("ERROR:", type(e).__name__, str(e))
PY
"""
            res = await _run_utils_one_shot_from_zip(zip_b64, py.strip(), timeout=120)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 20000) or "[No output]", "hints": _runner_failure_hints(res)})

        if name == "zip_search_files":
            zip_b64 = arguments["zip_base64"]
            query = arguments.get("query", "")
            path = _sanitize_rel_path(arguments.get("path", "."))
            max_lines = int(arguments.get("max_lines", 400))
            cmd = (
                f"(rg -n --hidden --no-ignore-vcs --glob '!.git/*' {_q(query)} {_q(path)} "
                f"|| grep -RIn --exclude-dir=.git {_q(query)} {_q(path)} || true) "
                f"| head -n {max_lines}"
            )
            res = await _run_utils_one_shot_from_zip(zip_b64, cmd, timeout=180)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 15000) or "[No matches]", "hints": _runner_failure_hints(res)})

        if name == "zip_file_info":
            zip_b64 = arguments["zip_base64"]
            file_path = _sanitize_rel_path(arguments.get("file_path", ""), allow_dot=False)
            cmd = f"(stat {_q(file_path)} || ls -la {_q(file_path)} || true)"
            res = await _run_utils_one_shot_from_zip(zip_b64, cmd, timeout=60)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"output": _truncate(out, 8000) or "[No output]", "hints": _runner_failure_hints(res)})

        # ---------------- Editor (git) ----------------
        if name == "write_file":
            repo_url = arguments["repo_url"]
            ref = arguments.get("ref")
            file_path = _sanitize_rel_path(arguments.get("file_path", ""), allow_dot=False)
            content = arguments.get("content", "")
            limits = _parse_limits(arguments)

            steps = [
                {"name": "clone", "network": "egress", "timeout_seconds": 240, "command": _clone_script(repo_url, ref)},
                {"name": "patch", "network": "none", "timeout_seconds": 120, "command": _patch_script({file_path: content})},
                {
                    "name": "verify",
                    "network": "none",
                    "timeout_seconds": 120,
                    "command": f"set -euo pipefail\nmkdir -p /output\ncd repo\nstat {_q(file_path)} > /output/result.txt 2>&1 || true\necho ok > /output/ok.txt",
                },
            ]
            payload = {
                "repo_url": repo_url,
                "ref": ref,
                "cpu_limit": limits["cpu"],
                "mem_limit_mb": limits["mem_mb"],
                "pids_limit": limits["pids"],
                "sandbox_image": IMG_UTILS,
                "steps": steps,
            }
            res = await _http_post_json("/run", payload)
            out = _read_artifact_text(res.get("artifacts_zip_base64"), "result.txt")
            return _text({"patched": file_path, "verify": _truncate(out, 8000), "hints": _runner_failure_hints(res), "raw": res})

        # ---------------- Intelligence ----------------
        if name == "detect_stack":
            repo_url = arguments["repo_url"]
            ref = arguments.get("ref")
            limits = _parse_limits(arguments)
            det = await _detect_stack_from_repo(repo_url, ref, limits)
            return _text(det)

        if name == "zip_detect_stack":
            zip_b64 = arguments["zip_base64"]
            limits = _parse_limits(arguments)
            det = await _detect_stack_from_zip(zip_b64, limits)
            return _text(det)

        # ---------------- Executor (git) ----------------
        if name == "repo_run":
            repo_url = arguments["repo_url"]
            ref = arguments.get("ref")
            limits = _parse_limits(arguments)
            command = (arguments.get("command") or "").strip()
            entrypoint = arguments.get("entrypoint", "auto")
            install_dependencies = bool(arguments.get("install_dependencies", True))
            files_override = arguments.get("files_override") or {}

            detected = entrypoint
            detection_debug: Optional[Dict[str, Any]] = None
            if entrypoint == "auto":
                det = await _detect_stack_from_repo(repo_url, ref, limits)
                detected = det.get("language", "unknown")
                detection_debug = {"tree_files_preview": det.get("tree_files_preview", "")}
                if detected not in SUPPORTED_LANGS:
                    detected = "python"
            elif detected not in SUPPORTED_LANGS:
                detected = "python"

            steps: List[Dict[str, Any]] = [
                {"name": "clone", "network": "egress", "timeout_seconds": 240, "command": _clone_script(repo_url, ref)}
            ]
            if files_override:
                steps.append({"name": "patch", "network": "none", "timeout_seconds": 240, "command": _patch_script(files_override)})
            steps.extend(_install_and_run_steps(detected, command, install_dependencies))

            payload = {
                "repo_url": repo_url,
                "ref": ref,
                "cpu_limit": limits["cpu"],
                "mem_limit_mb": limits["mem_mb"],
                "pids_limit": limits["pids"],
                "sandbox_image": _image_for_lang(detected),
                "steps": steps,
            }
            res = await _http_post_json("/run", payload)
            ok = (_read_artifact_text(res.get("artifacts_zip_base64"), "ok.txt") or "").strip()
            run_output = (_read_artifact_text(res.get("artifacts_zip_base64"), "result.txt") or "").strip()

            response = {
                "mode": "repo_run",
                "language": detected,
                "entrypoint": entrypoint,
                "command_effective": command or _default_command_for_lang(detected),
                "detection_debug": detection_debug,
                "ok": ok,
                "output": _truncate(run_output, 20000),
                "hints": _runner_failure_hints(res),
                "result": res,
            }
            return _text(response)

        # ---------------- Executor (zip) ----------------
        if name == "zip_run":
            zip_b64 = (arguments.get("zip_base64") or "").strip()
            if not zip_b64:
                raise ValueError("zip_base64 is required")

            limits = _parse_limits(arguments)
            command = (arguments.get("command") or "").strip()
            entrypoint = arguments.get("entrypoint", "auto")
            install_dependencies = bool(arguments.get("install_dependencies", True))
            files_override = arguments.get("files_override") or {}

            detected = entrypoint
            detection_debug: Optional[Dict[str, Any]] = None
            if entrypoint == "auto":
                det = await _detect_stack_from_zip(zip_b64, limits)
                detected = det.get("language", "unknown")
                detection_debug = {"tree_files_preview": det.get("tree_files_preview", "")}
                if detected not in SUPPORTED_LANGS:
                    detected = "python"
            elif detected not in SUPPORTED_LANGS:
                detected = "python"

            steps: List[Dict[str, Any]] = [{"name": "unpack", "network": "none", "timeout_seconds": 240, "command": _zip_unpack_script(zip_b64)}]
            if files_override:
                steps.append({"name": "patch", "network": "none", "timeout_seconds": 240, "command": _patch_script(files_override)})
            steps.extend(_install_and_run_steps(detected, command, install_dependencies))

            payload = {
                "repo_url": "zip://upload",
                "cpu_limit": limits["cpu"],
                "mem_limit_mb": limits["mem_mb"],
                "pids_limit": limits["pids"],
                "sandbox_image": _image_for_lang(detected),
                "steps": steps,
            }
            res = await _http_post_json("/run", payload)
            ok = (_read_artifact_text(res.get("artifacts_zip_base64"), "ok.txt") or "").strip()
            run_output = (_read_artifact_text(res.get("artifacts_zip_base64"), "result.txt") or "").strip()

            response = {
                "mode": "zip_run",
                "language": detected,
                "entrypoint": entrypoint,
                "command_effective": command or _default_command_for_lang(detected),
                "detection_debug": detection_debug,
                "ok": ok,
                "output": _truncate(run_output, 20000),
                "zip_kept_on_disk": True,
                "zip_path_in_sandbox": "/workspace/upload.zip",
                "hints": _runner_failure_hints(res),
                "result": res,
            }
            return _text(response)

        raise ValueError(f"Unknown tool: {name}")

    except ValueError as ve:
        return [types.TextContent(type="text", text=f"Error: {str(ve)}")]
    except httpx.HTTPStatusError as he:
        # Surface runner status code + response text if available
        msg = f"Runner HTTP error: {he.response.status_code} {he.response.text}"
        return [types.TextContent(type="text", text=msg)]
    except Exception as e:
        log.exception("Tool %s failed", name)
        return [types.TextContent(type="text", text=f"Error executing {name}: {str(e)}")]


# =============================================================================
# MCP server lifecycle
# =============================================================================
def _make_init_opts() -> Any:
    if InitializationOptions is None:
        return None

    kwargs: Dict[str, Any] = {"server_name": SERVER_NAME, "server_version": SERVER_VERSION}

    # Only attach capabilities if supported by this MCP SDK build
    if hasattr(server, "get_capabilities") and NotificationOptions is not None:
        try:
            kwargs["capabilities"] = server.get_capabilities(
                notification_options=NotificationOptions(),
                experimental_capabilities={},
            )
        except Exception:
            pass

    return InitializationOptions(**kwargs)


async def main() -> None:
    log.info("MCP stdio server starting: name=%s version=%s", SERVER_NAME, SERVER_VERSION)
    log.info("RUNNER_URL=%s", RUNNER_URL)
    await _runner_preflight()
    log.info("Ready. Waiting for MCP client on stdin... (logs on stderr)")

    init_opts = _make_init_opts()
    sig = inspect.signature(server.run)

    async with mcp.server.stdio.stdio_server() as (read, write):
        if "initialization_options" in sig.parameters and init_opts is not None:
            await server.run(read, write, initialization_options=init_opts)
        elif len(sig.parameters) >= 4 and init_opts is not None:
            await server.run(read, write, init_opts)
        else:
            await server.run(read, write)


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
