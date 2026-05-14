from __future__ import annotations

import argparse
import base64
import fnmatch
import io
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

DEFAULT_EXCLUDES = [
    ".git/**",
    ".git",
    "node_modules/**",
    "node_modules",
    ".venv/**",
    ".venv",
    "venv/**",
    "venv",
    "__pycache__/**",
    "__pycache__",
    ".pytest_cache/**",
    ".mypy_cache/**",
    ".ruff_cache/**",
    ".tox/**",
    ".nox/**",
    "dist/**",
    "build/**",
    ".DS_Store",
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "id_rsa",
    "id_dsa",
    "id_ed25519",
]

DEFAULT_HELLO = """print("Hello from MatrixLab sandbox!")
"""


def _runner_url(value: Optional[str]) -> str:
    return (value or os.environ.get("MATRIXLAB_RUNNER_URL") or os.environ.get("RUNNER_URL") or "http://localhost:8000").rstrip("/")


def _headers() -> Dict[str, str]:
    token = os.environ.get("MATRIXLAB_BEARER_TOKEN")
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def _print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def _load_gitpilotignore(root: Path) -> List[str]:
    ignore_file = root / ".gitpilotignore"
    if not ignore_file.is_file():
        return []
    patterns: List[str] = []
    for line in ignore_file.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        patterns.append(line)
    return patterns


def _matches_pattern(rel: str, pattern: str) -> bool:
    normalized = rel.replace(os.sep, "/")
    pattern = pattern.strip().replace(os.sep, "/")
    if pattern.endswith("/"):
        pattern = f"{pattern}**"
    if pattern.startswith("/"):
        pattern = pattern[1:]
    return fnmatch.fnmatch(normalized, pattern) or fnmatch.fnmatch(Path(normalized).name, pattern)


def _should_exclude(rel: str, patterns: Iterable[str]) -> Optional[str]:
    for pattern in patterns:
        if _matches_pattern(rel, pattern):
            return pattern
    return None


def pack_workspace(root: Path, max_bytes: int, extra_excludes: Optional[List[str]] = None) -> Tuple[str, Dict[str, Any]]:
    root = root.resolve()
    patterns = [*DEFAULT_EXCLUDES, *_load_gitpilotignore(root), *(extra_excludes or [])]
    excluded: List[Dict[str, str]] = []
    included = 0
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(root.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(root).as_posix()
            matched = _should_exclude(rel, patterns)
            if matched:
                excluded.append({"path": rel, "pattern": matched})
                continue
            size = path.stat().st_size
            if included + size > max_bytes:
                raise ValueError(f"workspace exceeds max size of {max_bytes} bytes before upload")
            included += size
            zf.write(path, rel)
    encoded = base64.b64encode(raw.getvalue()).decode("ascii")
    return encoded, {
        "root": str(root),
        "included_bytes": included,
        "zip_bytes": len(raw.getvalue()),
        "excluded_count": len(excluded),
        "excluded_sample": excluded[:50],
    }


def _post_json(runner_url: str, path: str, payload: Dict[str, Any], timeout: int) -> Dict[str, Any]:
    response = requests.post(f"{runner_url}{path}", json=payload, headers=_headers(), timeout=timeout)
    response.raise_for_status()
    return response.json()


def _get_json(runner_url: str, path: str, timeout: int = 10) -> Dict[str, Any]:
    response = requests.get(f"{runner_url}{path}", headers=_headers(), timeout=timeout)
    response.raise_for_status()
    return response.json()


def doctor(args: argparse.Namespace) -> int:
    runner_url = _runner_url(args.runner_url)
    try:
        health = _get_json(runner_url, "/health")
        capabilities = _get_json(runner_url, "/capabilities")
    except requests.RequestException as exc:
        print(f"MatrixLab runner is unreachable at {runner_url}: {exc}", file=sys.stderr)
        print("Start it with `make run` or point --runner-url/RUNNER_URL at a reachable Runner.", file=sys.stderr)
        return 2

    data = {"runner_url": runner_url, "health": health, "capabilities": capabilities}
    if args.json:
        _print_json(data)
    else:
        print(f"Runner: {runner_url}")
        print(f"Health: {'ok' if health.get('ok') else 'not ok'}")
        print(f"Protocol: {capabilities.get('protocol', 'unknown')}")
        print(f"Images: {', '.join(capabilities.get('images', []))}")
    return 0 if health.get("ok") else 1


def run_command(args: argparse.Namespace) -> int:
    runner_url = _runner_url(args.runner_url)
    workspace = Path(args.workspace or ".")
    zip_base64, pack_meta = pack_workspace(workspace, args.max_workspace_mb * 1024 * 1024, args.exclude)
    payload = {
        "cmd": args.cmd,
        "cwd": args.cwd,
        "workspace": {"type": "zip", "zip_base64": zip_base64},
        "env": dict(item.split("=", 1) for item in args.env),
        "timeout": args.timeout,
        "image": args.image,
        "allow_network": args.network,
        "metadata": {"client": "matrixlab-sandbox", "workspace": str(workspace.resolve())},
    }
    if args.dry_run:
        _print_json({"request": {**payload, "workspace": {"type": "zip", "zip_base64": f"<base64:{len(zip_base64)} chars>"}}, "packaging": pack_meta})
        return 0

    result = _post_json(runner_url, "/run", payload, timeout=args.timeout + 30)
    if args.json:
        _print_json({"packaging": pack_meta, "result": result})
    else:
        _render_result(result, pack_meta)
    return int(result.get("exit_code", 1))


def hello_python(args: argparse.Namespace) -> int:
    with tempfile.TemporaryDirectory(prefix="matrixlab-hello-") as tmp:
        root = Path(tmp)
        script = root / "hello.py"
        script.write_text(args.code or DEFAULT_HELLO, encoding="utf-8")
        args.workspace = str(root)
        args.cwd = "."
        args.cmd = "python hello.py"
        args.image = "python"
        return run_command(args)


def interactive(args: argparse.Namespace) -> int:
    runner_url = _runner_url(args.runner_url)
    workspace = Path(args.workspace or ".").resolve()
    print("MatrixLab interactive sandbox")
    print(f"Runner: {runner_url}")
    print(f"Workspace: {workspace}")
    print("Commands: doctor, hello, run <command>, cwd <path>, image <name>, network on|off, exit")
    cwd = args.cwd
    image = args.image
    network = args.network
    while True:
        try:
            line = input("matrixlab> ").strip()
        except EOFError:
            print()
            return 0
        if not line:
            continue
        if line in {"exit", "quit", ":q"}:
            return 0
        if line == "doctor":
            sub = argparse.Namespace(runner_url=runner_url, json=False)
            doctor(sub)
            continue
        if line == "hello":
            sub = argparse.Namespace(**vars(args))
            sub.runner_url = runner_url
            sub.json = False
            sub.dry_run = False
            sub.network = False
            sub.exclude = []
            sub.env = []
            sub.max_workspace_mb = args.max_workspace_mb
            sub.code = None
            hello_python(sub)
            continue
        if line.startswith("cwd "):
            cwd = line[4:].strip() or "."
            print(f"cwd={cwd}")
            continue
        if line.startswith("image "):
            image = line[6:].strip() or "python"
            print(f"image={image}")
            continue
        if line.startswith("network "):
            network = line.split(None, 1)[1].strip().lower() in {"1", "true", "on", "yes", "egress"}
            print(f"network={'on' if network else 'off'}")
            continue
        if line.startswith("run "):
            cmd = line[4:].strip()
        else:
            cmd = line
        sub = argparse.Namespace(**vars(args))
        sub.runner_url = runner_url
        sub.workspace = str(workspace)
        sub.cwd = cwd
        sub.cmd = cmd
        sub.image = image
        sub.network = network
        sub.json = False
        sub.dry_run = False
        sub.exclude = args.exclude
        sub.env = args.env
        run_command(sub)


def _render_result(result: Dict[str, Any], pack_meta: Dict[str, Any]) -> None:
    print(f"sandbox_id: {result.get('sandbox_id')}")
    print(f"exit_code: {result.get('exit_code')}  duration_ms: {result.get('duration_ms')}  timed_out: {result.get('timed_out')}")
    print(f"workspace_zip_bytes: {pack_meta.get('zip_bytes')}  excluded: {pack_meta.get('excluded_count')}")
    stdout = result.get("stdout") or ""
    stderr = result.get("stderr") or ""
    if stdout:
        print("\n--- stdout ---")
        print(stdout.rstrip())
    if stderr:
        print("\n--- stderr ---", file=sys.stderr)
        print(stderr.rstrip(), file=sys.stderr)
    artifacts = result.get("artifacts") or []
    if artifacts:
        print("\n--- artifacts ---")
        for artifact in artifacts:
            print(f"{artifact.get('id')}  {artifact.get('size')} bytes  {artifact.get('mime')}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="matrixlab-sandbox",
        description="Interactive/local CLI for running commands in the MatrixLab sandbox runner.",
    )
    parser.add_argument("--runner-url", help="MatrixLab Runner URL. Defaults to MATRIXLAB_RUNNER_URL, RUNNER_URL, or http://localhost:8000.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON output.")
    sub = parser.add_subparsers(dest="command", required=True)

    doctor_p = sub.add_parser("doctor", help="Check Runner health and capabilities.")
    doctor_p.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help="Print machine-readable JSON output.")
    doctor_p.set_defaults(func=doctor)

    run_p = sub.add_parser("run", help="Package a local workspace and run a command in MatrixLab.")
    _add_run_args(run_p)
    run_p.add_argument("--cmd", required=True, help="Command to run inside the sandbox.")
    run_p.set_defaults(func=run_command)

    hello_p = sub.add_parser("hello-python", help="Run a generated hello.py inside the Python sandbox.")
    _add_run_args(hello_p)
    hello_p.add_argument("--code", help="Override the generated hello.py source code.")
    hello_p.set_defaults(func=hello_python)

    repl_p = sub.add_parser("repl", help="Open a small interactive command loop backed by MatrixLab.")
    _add_run_args(repl_p)
    repl_p.set_defaults(func=interactive)
    return parser


def _add_run_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--json", action="store_true", default=argparse.SUPPRESS, help="Print machine-readable JSON output.")
    parser.add_argument("--workspace", default=".", help="Local workspace directory to package. Defaults to current directory.")
    parser.add_argument("--cwd", default=".", help="Working directory inside the workspace zip.")
    parser.add_argument("--image", default="python", help="Image alias or full sandbox image name.")
    parser.add_argument("--timeout", type=int, default=120, help="Command timeout in seconds.")
    parser.add_argument("--network", action="store_true", help="Allow egress network for the command step.")
    parser.add_argument("--env", action="append", default=[], metavar="KEY=VALUE", help="Environment variable to pass into the sandbox. Repeatable.")
    parser.add_argument("--exclude", action="append", default=[], help="Additional glob exclusion pattern for workspace packaging. Repeatable.")
    parser.add_argument("--max-workspace-mb", type=int, default=100, help="Fail before upload if included workspace bytes exceed this limit.")
    parser.add_argument("--dry-run", action="store_true", help="Show packaged request metadata without executing it.")


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    for item in getattr(args, "env", []):
        if "=" not in item:
            parser.error(f"--env must be KEY=VALUE, got: {item}")
    try:
        return args.func(args)
    except requests.HTTPError as exc:
        detail = exc.response.text if exc.response is not None else str(exc)
        print(f"Runner request failed: {detail}", file=sys.stderr)
        return 2
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"matrixlab-sandbox error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
