# 🧪 Matrix Lab

**Matrix Lab** is a controlled execution + verification facility used by higher-level systems (e.g., **Matrix Architect**) to safely **clone**, **install**, **test**, and **debug** untrusted repositories (agents/tools/**MCP servers**) inside **ephemeral sandboxes**.

It implements the proven **Orchestrator → Runner → Sandbox** pattern:
- **Orchestrator** decides *what* to do (plan, steps, retries).
- **Runner** executes *how* to do it (isolated containers per step).
- **Sandbox images** provide clean, language-specific runtimes.

---

## Why Matrix Lab

When you need to validate third-party code (or AI-generated code) you want:
- Reproducible environments
- Strong isolation boundaries
- Evidence you can inspect (logs + artifacts)
- A simple interface for automation (HTTP + MCP tools)

Matrix Lab is designed for **safe automation**: it can be invoked by humans, CI pipelines, agents, or other systems in the Matrix ecosystem.

---

## Features

- **Runner (FastAPI)**  
  Executes job steps in short-lived Docker containers with safety defaults (non-root, read-only rootfs, limited resources).

- **Language-aware pipelines (Orchestrator)**  
  Deterministically detects repo language and selects the right sandbox image + install/test flow.

- **Sandbox images per language**  
  - Python
  - Go
  - Rust
  - Node.js

- **MCP stdio server**  
  Exposes tools (e.g. `repo_run(...)`) so MCP hosts/agents can trigger validation runs.

- **MCP Inspector**  
  A smoke-check utility that boots the MCP server and validates it responds to `initialize` and `tools/list`.

---

## Repository Layout

```text
matrix-lab/
  runner/               # FastAPI Runner service (HTTP /run)
  orchestrator/         # Example client + language detection + pipelines
  sandbox-python/       # Python sandbox runtime image
  sandbox-go/           # Go sandbox runtime image
  sandbox-rust/         # Rust sandbox runtime image
  sandbox-node/         # Node.js sandbox runtime image
  mcp/                  # MCP stdio server + inspector
  scripts/              # Convenience scripts
  docker-compose.yml
  Makefile
````

---

## Requirements

* Docker + Docker Compose (plugin)
* Python 3.10+ (for local MCP server + inspector tooling)
* `make`
* Optional: `jq` for nicer JSON output

---

## Quickstart

### 1) Start Runner + sandbox images

```bash
make run
```

Check Runner health:

```bash
curl -s http://localhost:8000/health | jq
```

You should see:

```json
{ "status": "ok" }
```

### 2) Run the MCP server (stdio)

In another terminal:

```bash
make mcp
```

This starts the MCP stdio server locally (it calls the Runner at `RUNNER_URL`, default `http://localhost:8000`).

### 3) Inspect the MCP server

In a third terminal:

```bash
make inspect
```

The inspector will:

* start the MCP server as a subprocess
* call `initialize`
* call `tools/list`
* print the responses and exit non-zero if something looks wrong

---

## Configuration

### Environment variables

* `RUNNER_URL` (default: `http://localhost:8000`)
  Where the MCP server / inspector will call the Runner.

Override example:

```bash
RUNNER_URL=http://127.0.0.1:8000 make mcp
```

---

## Runner API

### `POST /run`

Matrix Lab Runner accepts a job description consisting of **steps**.

Each step includes:

* `name`
* `command` (shell executed via `bash -lc`)
* `timeout_seconds`
* `network`: `none` or `egress`

Runner returns:

* `results[]` with `exit_code`, `stdout`, `stderr` per step
* `artifacts_zip_base64`: a zipped `/output` directory produced by the job

This API is designed to be easy for orchestrators (human or AI) to call repeatedly.

---

## Language Detection (Orchestrator)

Matrix Lab uses deterministic file-based detection (no LLM guessing):

* `go.mod` → Go
* `Cargo.toml` → Rust
* `package.json` → Node
* `pyproject.toml` / `requirements.txt` / `setup.py` → Python

This ensures reproducible behavior and reduces the risk of hallucinated setup steps.

---

## Security Model (v1)

Runner launches sandbox containers with these defaults:

* Runs as non-root (uid 1000)
* Read-only root filesystem
* Drops Linux capabilities
* Resource limits (CPU / memory / pids)
* `/tmp` mounted as `tmpfs` with `noexec,nosuid`
* **Network disabled by default**

  * enable only for steps that require fetching (clone/install)

> Local development mounts Docker socket (`/var/run/docker.sock`) into the Runner container so it can launch sandbox containers.
> **Do not use this pattern in production.** Prefer a dedicated executor host, rootless Docker, gVisor, or Kubernetes Jobs with restricted permissions.

---

## Common Workflows

### Validate a GitHub MCP server repo

* Use MCP host → call `repo_run(repo_url, ref, command)`
* Or call Runner API directly via `/run`

### Integrate with Matrix Architect

Matrix Architect can treat Matrix Lab as:

* a “verification facility” for repos and MCP servers
* an evidence producer (logs + artifacts)
* a gating input before deploy/publish

---

## Development

### Install local tooling

Installs MCP dependencies into `.venv`:

```bash
make install
```

### View logs

```bash
make logs
```

### Stop everything

```bash
make down
```

---

## License

Apache-2.0. See `LICENSE`.

