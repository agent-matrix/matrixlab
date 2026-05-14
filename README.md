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
