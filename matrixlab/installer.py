from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


APP_NAME = "matrixlab"
CONFIG_DIR = Path.home() / ".matrixlab"
COMPOSE_FILE = CONFIG_DIR / "docker-compose.yml"
ENV_FILE = CONFIG_DIR / "matrixlab.env"

DEFAULT_RUNNER_PORT = 8000
DEFAULT_REGISTRY = os.environ.get("MATRIXLAB_REGISTRY", "ghcr.io/agent-matrix")
DEFAULT_TAG = os.environ.get("MATRIXLAB_TAG", "latest")

# Minimum “Matrix” set:
PRESET_MINIMAL = ["utils", "python", "node"]
PRESET_FULL = ["utils", "python", "node", "go", "rust", "java", "dotnet", "build"]

# Maps sandbox key -> docker compose profile name
SANDBOXES: Dict[str, str] = {
    "utils": "utils",
    "python": "python",
    "node": "node",
    "go": "go",
    "rust": "rust",
    "java": "java",
    "dotnet": "dotnet",
    "build": "build",
}

# Image names in registry
IMAGES: Dict[str, str] = {
    "runner": "matrixlab-runner",
    "utils": "matrix-lab-sandbox-utils",
    "python": "matrix-lab-sandbox-python",
    "node": "matrix-lab-sandbox-node",
    "go": "matrix-lab-sandbox-go",
    "rust": "matrix-lab-sandbox-rust",
    "java": "matrix-lab-sandbox-java",
    "dotnet": "matrix-lab-sandbox-dotnet",
    "build": "matrix-lab-sandbox-build",
}


# -----------------------
# Pretty console helpers
# -----------------------
def _supports_color() -> bool:
    return sys.stdout.isatty() and os.environ.get("NO_COLOR") is None


def _c(code: str, s: str) -> str:
    if not _supports_color():
        return s
    return f"\033[{code}m{s}\033[0m"


def h1(s: str) -> None:
    print(_c("1;36", f"\n{s}\n" + ("=" * len(s))))


def info(s: str) -> None:
    print(_c("0;37", f"• {s}"))


def ok(s: str) -> None:
    print(_c("1;32", f"✓ {s}"))


def warn(s: str) -> None:
    print(_c("1;33", f"! {s}"))


def err(s: str) -> None:
    print(_c("1;31", f"✗ {s}"))


def prompt(s: str, default: Optional[str] = None) -> str:
    if default is not None:
        q = f"{s} [{default}]: "
    else:
        q = f"{s}: "
    val = input(_c("1;37", q)).strip()
    return val if val else (default or "")


def confirm(s: str, default: bool = True) -> bool:
    d = "Y/n" if default else "y/N"
    v = input(_c("1;37", f"{s} ({d}): ")).strip().lower()
    if not v:
        return default
    return v in ("y", "yes")


def run_cmd(cmd: List[str], *, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=check, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def which(cmd: str) -> Optional[str]:
    return shutil.which(cmd)


# -----------------------
# Environment detection
# -----------------------
def detect_os() -> Tuple[str, str]:
    sysname = platform.system().lower()
    release = platform.release().lower()
    return sysname, release


def docker_present() -> bool:
    return which("docker") is not None


def docker_compose_present() -> bool:
    # Prefer plugin: `docker compose`
    if not docker_present():
        return False
    try:
        run_cmd(["docker", "compose", "version"], check=True)
        return True
    except Exception:
        return False


def docker_usable() -> bool:
    if not docker_present():
        return False
    try:
        run_cmd(["docker", "ps"], check=True)
        return True
    except Exception:
        return False


def print_docker_install_instructions() -> None:
    sysname, release = detect_os()

    h1("Docker installation guidance")
    warn("For safety and portability, matrixlab-install does not auto-install Docker.")
    info("Follow the steps below, then re-run: matrixlab-install")

    if sysname == "linux":
        info("Recommended: install Docker Engine + Compose plugin via your distro docs.")
        print(textwrap.dedent("""
        Common options:
          • Ubuntu/Debian: https://docs.docker.com/engine/install/ubuntu/
          • Fedora:        https://docs.docker.com/engine/install/fedora/
          • Arch:          https://docs.docker.com/engine/install/archlinux/
        
        After installing, ensure your user can run docker without sudo:
          sudo usermod -aG docker $USER
          # then log out and log back in
        """).strip())
    elif sysname == "darwin":
        info("Install Docker Desktop for Mac:")
        print("  https://docs.docker.com/desktop/install/mac-install/")
    elif sysname == "windows":
        info("Install Docker Desktop for Windows (WSL2 backend recommended):")
        print("  https://docs.docker.com/desktop/install/windows-install/")
        info("You appear to be running on Windows (or WSL). Ensure Docker Desktop is running.")
        if "microsoft" in release or "wsl" in release:
            info("WSL detected: Docker Desktop must expose the Docker daemon to WSL.")
    else:
        info("Please install Docker from: https://docs.docker.com/get-docker/")


# -----------------------
# Compose generation
# -----------------------
def compose_template(registry: str, tag: str) -> str:
    # Uses profiles to selectively enable sandboxes.
    # Runner always comes up.
    # NOTE: docker.sock mount is for single-host/dev; production should use a dedicated executor or remote runtime.
    return f"""\
services:
  runner:
    image: {registry}/{IMAGES["runner"]}:{tag}
    ports:
      - "{DEFAULT_RUNNER_PORT}:{DEFAULT_RUNNER_PORT}"
    volumes:
      # SECURITY NOTE:
      # Mounting docker.sock into a container is NOT recommended on shared hosts.
      # Use a dedicated executor host or a remote runtime for production.
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - DOCKER_HOST=unix:///var/run/docker.sock
      - MATRIXLAB_SANDBOX_UTILS_IMAGE={registry}/{IMAGES["utils"]}:{tag}
      - MATRIXLAB_SANDBOX_PYTHON_IMAGE={registry}/{IMAGES["python"]}:{tag}
      - MATRIXLAB_SANDBOX_NODE_IMAGE={registry}/{IMAGES["node"]}:{tag}
      - MATRIXLAB_SANDBOX_GO_IMAGE={registry}/{IMAGES["go"]}:{tag}
      - MATRIXLAB_SANDBOX_RUST_IMAGE={registry}/{IMAGES["rust"]}:{tag}
      - MATRIXLAB_SANDBOX_JAVA_IMAGE={registry}/{IMAGES["java"]}:{tag}
      - MATRIXLAB_SANDBOX_DOTNET_IMAGE={registry}/{IMAGES["dotnet"]}:{tag}
      - MATRIXLAB_SANDBOX_BUILD_IMAGE={registry}/{IMAGES["build"]}:{tag}
    restart: unless-stopped

  sandbox-utils:
    profiles: ["utils"]
    image: {registry}/{IMAGES["utils"]}:{tag}

  sandbox-python:
    profiles: ["python"]
    image: {registry}/{IMAGES["python"]}:{tag}

  sandbox-node:
    profiles: ["node"]
    image: {registry}/{IMAGES["node"]}:{tag}

  sandbox-go:
    profiles: ["go"]
    image: {registry}/{IMAGES["go"]}:{tag}

  sandbox-rust:
    profiles: ["rust"]
    image: {registry}/{IMAGES["rust"]}:{tag}

  sandbox-java:
    profiles: ["java"]
    image: {registry}/{IMAGES["java"]}:{tag}

  sandbox-dotnet:
    profiles: ["dotnet"]
    image: {registry}/{IMAGES["dotnet"]}:{tag}

  sandbox-build:
    profiles: ["build"]
    image: {registry}/{IMAGES["build"]}:{tag}
"""


def env_template(runner_port: int) -> str:
    return f"""\
# matrixlab runtime configuration
RUNNER_PORT={runner_port}
"""


def write_runtime_files(registry: str, tag: str, runner_port: int) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    COMPOSE_FILE.write_text(compose_template(registry, tag), encoding="utf-8")
    ENV_FILE.write_text(env_template(runner_port), encoding="utf-8")


# -----------------------
# Compose operations
# -----------------------
def compose_cmd_base() -> List[str]:
    return ["docker", "compose", "-f", str(COMPOSE_FILE)]


def pull_images(registry: str, tag: str, sandboxes: List[str]) -> None:
    h1("Pulling images")
    # Runner always required
    images = [f"{registry}/{IMAGES['runner']}:{tag}"]
    for key in sandboxes:
        if key in IMAGES:
            images.append(f"{registry}/{IMAGES[key]}:{tag}")

    for img in images:
        info(f"Pull: {img}")
        p = run_cmd(["docker", "pull", img], check=False)
        if p.returncode == 0:
            ok(f"Pulled {img}")
        else:
            warn(f"Could not pull {img}")
            sys.stderr.write(p.stderr + "\n")
            sys.stderr.flush()
            warn("If you haven't published these images yet, you can switch to a local-build workflow.")


def compose_up(profiles: List[str], runner_port: int) -> None:
    h1("Starting MatrixLab runtime (Runner + selected sandboxes)")
    env = os.environ.copy()
    env["COMPOSE_PROFILES"] = ",".join(sorted(set(profiles)))
    # Override port mapping if user chose different port:
    # We keep compose file fixed at 8000->8000 for simplicity; for different port, use port publish via env+template
    # (If you want variable ports, tell me and I’ll make it parameterized.)
    cmd = compose_cmd_base() + ["up", "-d"]
    info(f"COMPOSE_PROFILES={env['COMPOSE_PROFILES']}")
    p = subprocess.run(cmd, env=env)
    if p.returncode != 0:
        raise SystemExit(1)
    ok("Runtime started")


def compose_ps() -> None:
    cmd = compose_cmd_base() + ["ps"]
    subprocess.run(cmd, check=False)


def runner_healthcheck(runner_url: str) -> bool:
    h1("Runner health check")
    try:
        r = requests.get(f"{runner_url}/health", timeout=2.5)
        if r.ok:
            ok(f"Runner is healthy at {runner_url}")
            info(f"Response: {r.text.strip()}")
            return True
        warn(f"Runner responded with status {r.status_code} at {runner_url}")
        info(f"Response: {r.text.strip()}")
        return False
    except Exception as e:
        err(f"Runner not reachable at {runner_url}: {e}")
        return False


@dataclass
class InstallPlan:
    registry: str
    tag: str
    runner_port: int
    sandboxes: List[str]
    start_now: bool
    pull: bool
    print_mcp_snippet: bool
    run_smoke_test: bool


def choose_sandboxes_interactive() -> List[str]:
    h1("Select sandboxes")
    info("Choose the runtimes you want ready for on-the-fly install/test/debug.")
    info("Recommended for Matrix behavior: utils + python + node (minimal).")

    preset = prompt("Preset (minimal/full/custom)", "minimal").lower()
    if preset == "full":
        chosen = PRESET_FULL
    elif preset == "custom":
        chosen = []
        for key in SANDBOXES.keys():
            if confirm(f"Enable sandbox '{key}'?", default=(key in PRESET_MINIMAL)):
                chosen.append(key)
        if not chosen:
            chosen = PRESET_MINIMAL[:]
    else:
        chosen = PRESET_MINIMAL[:]

    # Always ensure utils is included for zip/unpack/inspect flows
    if "utils" not in chosen:
        warn("Enabling 'utils' automatically (required for zip/unpack/inspect).")
        chosen.insert(0, "utils")

    ok(f"Selected sandboxes: {', '.join(chosen)}")
    return chosen


def print_mcp_config_snippet(runner_url: str) -> None:
    h1("MCP host configuration snippet")
    info("Use this in your MCP host/agent configuration to run MatrixLab MCP server.")
    print(textwrap.dedent(f"""
    Command:
      matrixlab-mcp

    Environment:
      RUNNER_URL={runner_url}
      MATRIXLAB_LOG_LEVEL=INFO

    Example JSON:
    {{
      "command": "matrixlab-mcp",
      "env": {{
        "RUNNER_URL": "{runner_url}",
        "MATRIXLAB_LOG_LEVEL": "INFO"
      }}
    }}
    """).strip())


def interactive_plan() -> InstallPlan:
    h1("MatrixLab Production Installer")
    info("This wizard sets up the MatrixLab runtime (Runner + sandboxes) and prints MCP configuration.")
    warn("Security note: for production use, run Runner on a dedicated executor host.")

    registry = prompt("Container registry (for images)", DEFAULT_REGISTRY).rstrip("/")
    tag = prompt("Image tag (pin versions for production)", DEFAULT_TAG)

    runner_port_str = prompt("Runner port", str(DEFAULT_RUNNER_PORT))
    runner_port = int(runner_port_str) if runner_port_str else DEFAULT_RUNNER_PORT

    sandboxes = choose_sandboxes_interactive()

    pull = confirm("Pull images from registry now?", default=True)
    start_now = confirm("Start Runner + sandboxes now?", default=True)
    print_snippet = confirm("Print MCP host configuration snippet?", default=True)
    smoke = confirm("Run a quick smoke test (matrixlab-inspect)?", default=False)

    return InstallPlan(
        registry=registry,
        tag=tag,
        runner_port=runner_port,
        sandboxes=sandboxes,
        start_now=start_now,
        pull=pull,
        print_mcp_snippet=print_snippet,
        run_smoke_test=smoke,
    )


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="matrixlab-install",
        description="Interactive installer for MatrixLab runtime (Runner + sandboxes) and MCP integration.",
    )
    p.add_argument("--non-interactive", action="store_true", help="Run without prompts (use flags).")
    p.add_argument("--registry", default=DEFAULT_REGISTRY, help="Container registry base (e.g., ghcr.io/org).")
    p.add_argument("--tag", default=DEFAULT_TAG, help="Image tag to use (pin for production).")
    p.add_argument("--port", type=int, default=DEFAULT_RUNNER_PORT, help="Runner port (default 8000).")
    p.add_argument("--preset", choices=["minimal", "full"], default="minimal", help="Sandbox preset.")
    p.add_argument("--sandboxes", default="", help="Comma-separated sandboxes (overrides preset).")
    p.add_argument("--pull", action="store_true", help="Pull images from registry.")
    p.add_argument("--start", action="store_true", help="Start runtime after writing config.")
    p.add_argument("--print-mcp", action="store_true", help="Print MCP host snippet.")
    p.add_argument("--smoke", action="store_true", help="Run matrixlab-inspect after starting.")
    return p.parse_args(argv)


def run_smoke_test(runner_url: str) -> None:
    h1("Smoke test")
    info("Running: matrixlab-inspect")
    env = os.environ.copy()
    env["RUNNER_URL"] = runner_url
    p = subprocess.run(["matrixlab-inspect"], env=env)
    if p.returncode == 0:
        ok("Smoke test passed")
    else:
        warn("Smoke test failed (see output above)")


def cli(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    # Step 1: Docker checks
    h1("Prerequisites")
    if not docker_present():
        err("Docker is not installed or not in PATH.")
        print_docker_install_instructions()
        return 2

    ok("Docker found")

    if not docker_compose_present():
        err("Docker Compose plugin not available (need: `docker compose`).")
        print_docker_install_instructions()
        return 2

    ok("Docker Compose plugin found")

    if not docker_usable():
        err("Docker is installed, but not usable (permission or daemon not running).")
        warn("Try: start Docker Desktop (Mac/Windows) or start docker service (Linux).")
        warn("On Linux, you may need: sudo usermod -aG docker $USER (then re-login).")
        return 2

    ok("Docker is usable")

    # Step 2: Build plan
    if not args.non_interactive:
        plan = interactive_plan()
    else:
        if args.sandboxes.strip():
            sandboxes = [s.strip() for s in args.sandboxes.split(",") if s.strip()]
        else:
            sandboxes = PRESET_FULL if args.preset == "full" else PRESET_MINIMAL

        if "utils" not in sandboxes:
            sandboxes = ["utils"] + sandboxes

        plan = InstallPlan(
            registry=args.registry.rstrip("/"),
            tag=args.tag,
            runner_port=args.port,
            sandboxes=sandboxes,
            pull=args.pull,
            start_now=args.start,
            print_mcp_snippet=args.print_mcp,
            run_smoke_test=args.smoke,
        )

    # Step 3: Write runtime config
    h1("Writing runtime configuration")
    info(f"Config directory: {CONFIG_DIR}")
    write_runtime_files(plan.registry, plan.tag, plan.runner_port)
    ok(f"Wrote: {COMPOSE_FILE}")
    ok(f"Wrote: {ENV_FILE}")

    # Step 4: Pull images (optional)
    if plan.pull:
        pull_images(plan.registry, plan.tag, plan.sandboxes)

    # Step 5: Start runtime (optional)
    runner_url = f"http://localhost:{plan.runner_port}"

    if plan.start_now:
        compose_profiles = [SANDBOXES[s] for s in plan.sandboxes if s in SANDBOXES]
        compose_up(compose_profiles, plan.runner_port)
        compose_ps()
        runner_healthcheck(runner_url)
    else:
        h1("Next steps")
        info("To start later:")
        info(f"  COMPOSE_PROFILES={','.join(plan.sandboxes)} docker compose -f {COMPOSE_FILE} up -d")

    # Step 6: Print MCP config snippet
    if plan.print_mcp_snippet:
        print_mcp_config_snippet(runner_url)

    # Step 7: Optional smoke test
    if plan.start_now and plan.run_smoke_test:
        run_smoke_test(runner_url)

    h1("Done")
    ok("MatrixLab runtime + MCP integration setup complete.")
    info("Start MCP server:")
    info(f"  RUNNER_URL={runner_url} matrixlab-mcp")

    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
