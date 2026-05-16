"""Console-script entry for ``matrixlab-runner``.

Hosts the FastAPI Runner natively (no Docker for the runner itself)
when the operator installs the optional ``[runner]`` extras::

    pip install matrix-lab[runner]
    matrixlab-runner serve --host 0.0.0.0 --port 8765

Failing to install the extras prints a friendly error rather than a
``ModuleNotFoundError`` traceback — which is what a user touching
the bare SDK install sees if they accidentally invoke the binary.

The runner still spawns per-language sandbox *containers* via the
host Docker daemon, so the host needs ``docker`` on PATH for code
execution.  This script only changes where the *runner itself*
lives (host process vs. container).
"""
from __future__ import annotations

import os
import sys
from typing import List, Optional


# ----------------------------------------------------------------------
# Friendly extras guard
# ----------------------------------------------------------------------

_EXTRA_HINT = (
    "matrixlab-runner needs the optional [runner] extras (FastAPI + "
    "uvicorn) which are NOT installed.\n\n"
    "Install them with:\n\n"
    "    pip install 'matrix-lab[runner]'\n"
)


def _require_runner_extras() -> None:
    """Fail fast with operator-friendly copy when ``[runner]`` is missing.

    Two imports cover the heavyweight deps: ``fastapi`` (the app
    framework) and ``uvicorn`` (the ASGI server).  Failing either
    means the extras aren't installed.
    """
    missing: list[str] = []
    try:
        import fastapi  # noqa: F401
    except ImportError:
        missing.append("fastapi")
    try:
        import uvicorn  # noqa: F401
    except ImportError:
        missing.append("uvicorn")
    if missing:
        sys.stderr.write(_EXTRA_HINT)
        sys.stderr.write(f"\nMissing modules: {', '.join(missing)}\n")
        sys.exit(2)


# ----------------------------------------------------------------------
# Sub-commands
# ----------------------------------------------------------------------

def _print_usage() -> None:
    sys.stderr.write(
        "matrixlab-runner — host the MatrixLab FastAPI runner natively\n"
        "\n"
        "USAGE\n"
        "  matrixlab-runner serve [--host HOST] [--port PORT] [--workers N] [--reload]\n"
        "  matrixlab-runner version\n"
        "  matrixlab-runner --help\n"
        "\n"
        "EXAMPLES\n"
        "  matrixlab-runner serve --port 8765\n"
        "  matrixlab-runner serve --host 0.0.0.0 --port 8765 --workers 2\n"
        "\n"
        "ENVIRONMENT\n"
        "  MATRIXLAB_HOST                Override default host (127.0.0.1)\n"
        "  MATRIXLAB_PORT                Override default port (8000)\n"
        "  MATRIXLAB_BEARER_TOKEN        Require Authorization: Bearer <token>\n"
        "  MATRIXLAB_LOCAL_JOBS_DIR      Where the runner writes job workspaces\n"
        "  MATRIXLAB_HOST_JOBS_DIR       Path the host docker daemon sees (DinD)\n"
        "  MATRIXLAB_IMAGE_NAMESPACE     Sandbox image namespace prefix\n"
        "\n"
        "See https://github.com/agent-matrix/matrixlab for full documentation.\n"
    )


def _cmd_version() -> int:
    try:
        from importlib.metadata import version, PackageNotFoundError
        print(version("matrix-lab"))
        return 0
    except Exception:
        # Fallback for editable installs / pre-publish source trees.
        print("matrix-lab (development build)")
        return 0


def _cmd_serve(argv: List[str]) -> int:
    """Parse ``serve`` args and hand off to uvicorn.

    Intentionally a thin wrapper.  Operators that want the full
    uvicorn knob set should invoke uvicorn directly; this script is
    optimised for the 90% case (``serve --port 8765``).
    """
    _require_runner_extras()
    import argparse
    import uvicorn  # noqa: WPS433 — checked above

    parser = argparse.ArgumentParser(
        prog="matrixlab-runner serve",
        description="Host the MatrixLab FastAPI runner.",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("MATRIXLAB_HOST", "127.0.0.1"),
        help="Bind address (default: 127.0.0.1, or $MATRIXLAB_HOST).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("MATRIXLAB_PORT", "8000")),
        help="TCP port (default: 8000, or $MATRIXLAB_PORT).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of worker processes (default: 1).",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload on file change (development only).",
    )
    parser.add_argument(
        "--log-level",
        default="info",
        choices=["critical", "error", "warning", "info", "debug", "trace"],
    )
    args = parser.parse_args(argv)

    # ``runner.app.main:app`` lives outside the wheel today — the
    # runner source isn't packaged because we ship it via the Docker
    # image.  For an SDK-side native run we expect the operator to
    # have cloned the repo OR set MATRIXLAB_APP to a custom ASGI app.
    app_path = os.environ.get("MATRIXLAB_APP", "runner.app.main:app")

    sys.stderr.write(
        f"🚀 matrixlab-runner serving {app_path} on http://{args.host}:{args.port}\n"
    )
    uvicorn.run(
        app_path,
        host=args.host,
        port=args.port,
        workers=args.workers if not args.reload else 1,
        reload=args.reload,
        log_level=args.log_level,
    )
    return 0


# ----------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] in {"-h", "--help", "help"}:
        _print_usage()
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == "serve":
        return _cmd_serve(rest)
    if cmd == "version":
        return _cmd_version()
    sys.stderr.write(f"matrixlab-runner: unknown command {cmd!r}\n\n")
    _print_usage()
    return 2


if __name__ == "__main__":
    sys.exit(main())
