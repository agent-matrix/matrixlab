<p align="center">
  <img src="assets/matrixlab-logo.svg" alt="MatrixLab" width="640" />
</p>

<p align="center">
  <strong>Enterprise-grade, safety-first sandbox execution for agents, CI, and MCP tools.</strong>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache%202.0-blue"></a>
  <a href="https://pypi.org/project/matrixlab/"><img alt="PyPI" src="https://img.shields.io/badge/pypi-matrixlab-blue"></a>
  <img alt="Docker" src="https://img.shields.io/badge/docker-required-2496ED?logo=docker&logoColor=white">
  <img alt="Python" src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white">
</p>

---

## Why MatrixLab

MatrixLab provides a production execution fabric for untrusted code and autonomous maintenance loops:

- **Isolated execution** in fresh, disposable containers
- **Policy-friendly defaults** (resource limits, restricted capabilities, network control)
- **MCP-ready integration** for agentic orchestration
- **Artifact-centric evidence** for compliance and debugging
- **HF Space control-plane compatibility** for remote repo maintenance

---

## Architecture (production model)

<p align="center">
  <img src="assets/matrixlab-architecture.svg" alt="MatrixLab architecture" width="900" />
</p>

Core execution chain:

1. Agent / CI / MCP Host
2. MatrixLab MCP server
3. Runner API
4. Ephemeral sandbox containers

Each run is stateless-by-default: no persistent host filesystem exposure, no cross-run contamination, and reproducible artifact output.

---

## How it works

MatrixLab separates the *control plane* — a single FastAPI service that owns the HTTP contract — from the *execution plane*, a set of ephemeral, per-language sandbox containers spawned through the host Docker daemon. The runner never executes user code in its own address space. Every request becomes a dedicated `docker run`, and the container is destroyed once the call returns.

### Components

| Component | Image | Role |
|---|---|---|
| **Runner** | `ruslanmv/matrixlab-runner` | The HTTP service. Owns request validation, workspace preparation, image dispatch, artifact capture, and lifecycle endpoints. Stateless and horizontally scalable. |
| **Sandbox images** | `ruslanmv/matrix-lab-sandbox-*` | One small image per language toolchain (`python`, `node`, `go`, `rust`, `java`, `dotnet`, `utils`, `build`). The runner selects an image from the `language` field of each request. |
| **Job workspace** | Bind-mounted directory | A per-request directory containing the user's source file and the runner's bookkeeping. Mounted into the sandbox at `/workspace`; destroyed at the end of the request. |

### Request lifecycle

1. The caller submits `POST /code/run` with `{ language, code, timeout, … }`. GitPilot, MCP clients, and CI systems all use the same contract.
2. The runner allocates a job directory under `MATRIXLAB_LOCAL_JOBS_DIR`, writes the source file (`main.py`, `main.js`, `script.sh`, …), and prepares an output directory for artifacts.
3. The runner invokes `docker run` against the matching sandbox image, bind-mounting the job directory at `/workspace` and the output directory at `/output`. Resource limits, network policy, and pull policy are applied at this point.
4. The sandbox executes the language-appropriate entry command (`python main.py`, `node main.js`, …) and writes any files to `/output`.
5. The runner captures `exit_code`, `stdout`, `stderr`, `duration_ms`, and the artifact set; tears down the container and the job directory; and returns a structured JSON response.

### Host filesystem requirement

Because the runner typically operates inside a container while dispatching sandboxes through the host Docker daemon (`/var/run/docker.sock`), the job directory must be reachable at the same path from both perspectives. Failing to share that path produces an empty bind-mount and a `No such file or directory` error inside the sandbox.

Production deployments share a single host directory at an identical path on both sides:

```bash
-v /var/lib/matrixlab/jobs:/var/lib/matrixlab/jobs \
-e MATRIXLAB_LOCAL_JOBS_DIR=/var/lib/matrixlab/jobs \
-e MATRIXLAB_HOST_JOBS_DIR=/var/lib/matrixlab/jobs
```

The values of `MATRIXLAB_LOCAL_JOBS_DIR` and `MATRIXLAB_HOST_JOBS_DIR` are otherwise independent, supporting deployments where Docker-in-Docker, rootless containers, or remote daemons translate paths between namespaces.

---

## Deploying from Docker Hub

The runner and the eight sandbox images are published to Docker Hub on every release and on every commit to the default branch. Tags published per image:

| Tag pattern | When applied | Intended consumer |
|---|---|---|
| `latest` | Release only | Production deployments tracking the latest stable release |
| `vX.Y.Z`, `X.Y.Z`, `X.Y`, `X` | Release and manual dispatch | Pinned production deployments |
| `sha-<short>` | Every build | Reproducible references for any commit |
| `master`, `edge` | Push to default branch | Pre-release and integration testing |

Recommended production launch:

```bash
mkdir -p /var/lib/matrixlab/jobs
chmod 755 /var/lib/matrixlab/jobs

docker run -d --name matrixlab --restart unless-stopped \
  -p 8000:8000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/matrixlab/jobs:/var/lib/matrixlab/jobs \
  -e MATRIXLAB_LOCAL_JOBS_DIR=/var/lib/matrixlab/jobs \
  -e MATRIXLAB_HOST_JOBS_DIR=/var/lib/matrixlab/jobs \
  -e MATRIXLAB_BEARER_TOKEN="$(openssl rand -hex 32)" \
  ruslanmv/matrixlab-runner:latest

curl -fsS http://localhost:8000/health
```

Per-language sandbox images are pulled lazily on first use. Pre-pulling them at startup reduces first-request latency:

```bash
for lang in python node utils go rust java dotnet build; do
  docker pull "ruslanmv/matrix-lab-sandbox-${lang}:latest"
done
```

### Published images

| Image | Contents |
|---|---|
| `ruslanmv/matrixlab-runner` | HTTP dispatcher (the service you deploy) |
| `ruslanmv/matrix-lab-sandbox-python` | Python 3, pip |
| `ruslanmv/matrix-lab-sandbox-node` | Node.js, npm |
| `ruslanmv/matrix-lab-sandbox-go` | Go toolchain |
| `ruslanmv/matrix-lab-sandbox-rust` | rustc, cargo |
| `ruslanmv/matrix-lab-sandbox-java` | JDK |
| `ruslanmv/matrix-lab-sandbox-dotnet` | .NET SDK |
| `ruslanmv/matrix-lab-sandbox-utils` | bash, find, ripgrep, unzip |
| `ruslanmv/matrix-lab-sandbox-build` | gcc, make, build-essential |

---

## Configuration

All runtime behavior is controlled through environment variables. Set them on `docker run -e`, in your orchestrator's container spec, or in your shell before `make run`.

| Variable | Default | Purpose |
|---|---|---|
| `MATRIXLAB_LOCAL_JOBS_DIR` | `/app/runner_tmp` | Path inside the runner container where job workspaces are written. |
| `MATRIXLAB_HOST_JOBS_DIR` | matches local | Path on the host filesystem that maps to the local jobs directory. Required when running in a container that dispatches through the host Docker daemon. |
| `MATRIXLAB_IMAGE_NAMESPACE` | `ruslanmv` (in the published image) | Registry namespace prefixed to sandbox image references. Empty when running against locally-built images. |
| `MATRIXLAB_DOCKER_PULL` | `missing` | Sandbox image pull policy. One of `always`, `missing`, `never`. |
| `MATRIXLAB_BEARER_TOKEN` | unset | When set, mutating endpoints require `Authorization: Bearer <token>`. Recommended for any deployment reachable beyond `localhost`. |
| `MATRIXLAB_WARM_POOL_ENABLED` | `0` | Enables the Docker freezer-based warm pool for sub-second cold starts. |
| `MATRIXLAB_WARM_POOL_MIN` / `_MAX` | `3` / `5` | Warm pool size bounds. |
| `MATRIXLAB_WARM_POOL_IMAGES` | unset | Comma-separated language list to maintain in the warm pool, e.g. `python,node`. |

---

## GitPilot integration

GitPilot ships an installation flow for MatrixLab under **Admin → Sandbox → Install MatrixLab Addon**. The installer performs the production deployment described above on the operator's behalf:

1. Pulls `ruslanmv/matrixlab-runner` and the baseline sandbox images.
2. Starts the runner container with the required volume mounts and environment variables.
3. Probes `GET /health` until the runner reports ready.
4. Switches GitPilot's active sandbox backend to `matrixlab`, routing the **Run** action on chat code blocks and the agent's `EXECUTE` planner step to this runner.

A second installation mode under *Advanced → Local clone install* clones this repository, builds a dedicated Python virtual environment, and runs the runner natively from `runner/`. This mode is appropriate for operators who maintain the runner from source.

---

## What MatrixLab is (and is not)

### ✅ MatrixLab **is**

- A secure sandbox execution backend
- A repo verification and maintenance execution engine
- A bridge from MCP workflows to Docker-isolated runtime
- A practical backend for HF Space-triggered maintenance loops

### ❌ MatrixLab **is not**

- A VM replacement
- A package manager
- A long-lived mutable development shell

---

## Core capabilities

- **Sandbox images:** utils, python, node, go, rust (+ optional java, dotnet, build)
- **Runner API:** health/capabilities/run plus environment lifecycle endpoints
- **MCP server tools:** repository run, zip run, detect stack, artifact utilities
- **Environment lifecycle:** bootstrap cache + task execution on branch
- **HF backend APIs:** profile-driven repo runs (`/repo/run`) for remote operations

---

## Quickstart

### 1) Install

```bash
pip install matrixlab
```

### 2) Start local runtime

```bash
make run
curl http://localhost:8000/health
```

### 3) Run MCP server

```bash
make mcp
```

### 4) Validate MCP server

```bash
make inspect
```

---

## Make targets (enterprise workflow)

```bash
make install              # install matrixlab (pip editable in venv)
make test                 # compile + route smoke checks
make run                  # start runner + sandboxes
make mcp                  # run MCP stdio server
make inspect              # MCP initialize/tools smoke check
make inspector            # MCP Inspector UI launcher
make hf-build             # build HF Space image from hf/
make hf-deploy-tree       # clean deploy tree in .dist/hf-space
make matrix-maintain-plan # dry-run org maintenance payloads
make matrix-maintain-run  # execute org maintenance via HF backend
make build-images         # build container images
make push-images          # push images to registry
```

---

## Native GitPilot runtime contract

MatrixLab Runner now exposes a GitPilot-compatible `matrixlab.runner.v1` HTTP contract in addition to the legacy step runner used by the MCP server.

Core endpoints:

```bash
GET  /health
GET  /capabilities
POST /workspaces/upload
POST /run
POST /repo/run
GET  /runs/{sandbox_id}/events
GET  /runs/{sandbox_id}/artifacts
GET  /runs/{sandbox_id}/artifacts/{artifact_id}
POST /env/bootstrap
POST /env/{env_id}/run
DELETE /env/{env_id}
```

`POST /run` accepts local workspace ZIP references for portable local-workspace execution, while `POST /repo/run` clones a remote Git ref for GitHub-style workflows. Set `MATRIXLAB_BEARER_TOKEN` to require bearer authentication for mutating/native endpoints, and use `GET /capabilities` for protocol negotiation before assuming streaming, artifacts, image aliases, or limits.

---

## Interactive local sandbox CLI

For local development, GitPilot adapters, MCP tools, and A2A agents can use the same native Runner contract through `matrixlab-sandbox`. The CLI packages a workspace as a ZIP, applies safe default excludes (`.git`, `node_modules`, virtualenvs, caches, `.env`, private keys), sends it to `POST /run`, and prints the sandbox result.

Start the Runner first:

```bash
make run
```

Run a generated Python hello-world program in the sandbox:

```bash
make sandbox-hello
# or
matrixlab-sandbox hello-python --runner-url http://localhost:8000
```

Run a command against the current workspace without host execution:

```bash
matrixlab-sandbox run --cmd "python hello.py" --workspace . --image python
```

Open a small interactive loop:

```bash
matrixlab-sandbox repl --workspace . --image python
matrixlab> hello
matrixlab> run python hello.py
matrixlab> exit
```

Best-practice defaults:

- Keep the Runner URL explicit for tools/agents via `RUNNER_URL` or `MATRIXLAB_RUNNER_URL`.
- Keep network off unless dependency installation or remote access is required (`--network`).
- Use `--dry-run --json` to inspect packaging metadata before execution.
- Put additional local packaging exclusions in `.gitpilotignore`.
- Set `MATRIXLAB_BEARER_TOKEN` when the Runner requires bearer authentication.

---

## Chatbot runnable-code API

MatrixLab exposes a small code-cell API for chatbot UIs, docs pages, and webviews that want a **Run** button next to a code block.

```bash
curl -sS http://localhost:8000/code/run \
  -H 'Content-Type: application/json' \
  -d '{"language":"python","code":"print(\"Hello from MatrixLab sandbox\")","timeout":120}'
```

Useful endpoints:

```bash
POST /code/run        # run a single Python/Node/Bash code cell
POST /chat/run        # alias for chatbot integrations
GET  /snippets/chatbot # copy/paste HTML + markdown snippets
```

For a copy/paste browser widget and a Python scraping example with packages/network egress, see [`docs/CHATBOT_SANDBOX_SNIPPET.md`](docs/CHATBOT_SANDBOX_SNIPPET.md). For production website, learning, testing, and AI code-generation integration guidance, see [`docs/AI_ENGINEER_SANDBOX_INTEGRATION.md`](docs/AI_ENGINEER_SANDBOX_INTEGRATION.md).

---

## Admin web console

`frontend/` contains a React/Vite MatrixLab Admin console for local operators and GitPilot runtime administrators. It monitors Runner health, protocol capabilities, warm-pool state, sandbox image health, and can launch a Python hello-world sandbox run through the `POST /code/run` code-cell contract.

```bash
make install       # installs Python package and frontend dependencies
make run           # starts backend and frontend
# open http://localhost:5173
```

Run services separately when needed:

```bash
make run-backend   # backend only
make run-frontend  # frontend only
make stop          # stop backend and frontend
```

Build for deployment:

```bash
make frontend-build
```

The UI reads `VITE_MATRIXLAB_API_URL` at build/dev time and also allows changing the Runner URL and bearer token from the settings modal.

---

## Warm Pool sandbox mode

For lower-latency local worker nodes, MatrixLab can optionally maintain a Docker cgroup-freezer warm pool. Warm containers are provisioned with the runtime image, paused with `docker pause`, unpaused for one request, and then destroyed after use. Used sandboxes are **never** returned to the pool.

Enable it explicitly on Docker-capable workers:

```bash
MATRIXLAB_WARM_POOL_ENABLED=1 \
MATRIXLAB_WARM_POOL_MIN=3 \
MATRIXLAB_WARM_POOL_MAX=5 \
MATRIXLAB_WARM_POOL_IMAGES=python,node \
make run
```

Inspect pool state:

```bash
curl http://localhost:8000/pool/status
```

Operational notes:

- Warm pool currently accelerates local workspace `POST /run` commands that do not request network egress.
- Remote repo runs and network-enabled setup phases continue to use the normal ephemeral container path.
- Sleeping containers start with `--network none`; grant network only through explicit non-warm execution paths.
- For enterprise production, run the warm-pool manager on dedicated worker nodes or behind a worker daemon rather than exposing Docker socket access to an internet-facing control plane.

---

## Hugging Face Space backend mode

`hf/` is a production control-plane app that delegates execution to MatrixLab Runner.

Flow:

1. Deploy `hf/` as a Hugging Face Space
2. Set `MATRIXLAB_RUNNER_URL`
3. Call `POST /repo/run` with profile/custom repo details
4. Runner bootstraps cache + executes task in sandbox

Built-in profile compatibility:

- `https://github.com/ruslanmv/gitpilot`
- `https://github.com/ruslanmv/agent-generator`
- `https://github.com/ruslanmv/RepoGuardian`

For full API examples and runtime variables, see `hf/README.md`.

---

## Matrix Maintainer mode (Agent-Matrix org operations)

MatrixLab can act as the execution backbone for `matrix-maintainer` style loops across `https://github.com/agent-matrix`.

Included assets:

- `configs/agent_matrix_repos.json` — canonical maintenance repo manifest
- `tools/matrix_maintainer.py` — dry-run planner and optional executor (`--execute`)
- `.github/workflows/matrix-maintainer-health.yml` — scheduled dry-run + manual execute

### Example

```bash
make matrix-maintain-plan MATRIXLAB_HF_URL=https://your-hf-space-url
make matrix-maintain-run  MATRIXLAB_HF_URL=https://your-hf-space-url
```

Design principle: **non-destructive by default** (plan first, execute explicitly).

---


## GitPilot enterprise runtime review

A stability review for using MatrixLab as the enterprise sandbox runtime for GitPilot is available in [`docs/GITPILOT_RUNTIME_STABILITY_REVIEW.md`](docs/GITPILOT_RUNTIME_STABILITY_REVIEW.md). It summarizes the current strengths, production gaps, and roadmap needed to make GitPilot branch testing simple, durable, and safe.

## Production deployment notes

- Use dedicated executor hosts for Runner workloads
- Apply network segmentation and secret isolation
- Put authentication + rate limiting in front of HF `/repo/run`
- Keep human approval gates in higher-level governance systems
- Store artifacts for audit and rollback evidence

---

## License

Apache-2.0 — see `LICENSE`.
