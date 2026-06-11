# MatrixLab Generic Sandbox Validation Provider — API Contract

MatrixLab exposes a **generic** sandbox validation provider that any client
(GitPilot, SelfRepair, Agent-Matrix, future clients) can call to validate a
repo / branch / patch by running **profile** commands in a sandbox. It returns
logs, an exit code, and artifact metadata.

- **Service name:** `matrixlab`
- **Default port:** `8765`
- **Run it:** `matrixlab-api` (or `uvicorn matrixlab.api.app:app --port 8765`)
- **App factory:** `matrixlab.api.app:create_app()` (module-level `app` also exported)
- **Generic:** `client_id` is just a request field; nothing is hardcoded to a
  particular caller.
- **Fail-closed:** any requested command matching a profile's
  `forbidden_commands` pattern is **refused** with HTTP `403`.

## Execution modes

- **Real execution** clones `repo_url`@`branch` (shallow), optionally applies a
  unified-diff `patch`, runs the profile commands in a temp working dir
  (capturing stdout/stderr), enforces `timeout_seconds`, and writes a report
  artifact (`pytest-report.txt` for `python-repair`).
- **Dry-run / stub** (offline, fast, deterministic) is used when
  `MATRIXLAB_DRY_RUN=1` **or** the repo is unreachable. It simulates the run
  and returns synthetic logs, `exit_code: 0`, and a fake artifact **without**
  cloning over the network. This is the path the test suite uses.

---

## Endpoints

### `GET /health`
```json
{ "status": "ok", "service": "matrixlab", "version": "0.1.0",
  "profiles": ["ci-repair", "docs-repair", "node-repair", "python-repair"] }
```

### `GET /capabilities`
```json
{
  "service": "matrixlab",
  "version": "0.1.0",
  "profiles": ["ci-repair", "docs-repair", "node-repair", "python-repair"],
  "languages": ["docs", "node", "python"],
  "features": {
    "artifacts": true, "logs": true, "patch_validation": true,
    "network": "restricted", "dry_run": true
  },
  "max_memory_mb": 4096,
  "max_timeout_seconds": 600
}
```

### `POST /repo/run`
Run profile commands against a repo/branch.

**Request**
```json
{
  "client_id": "gitpilot",
  "workspace_id": "ws-123",
  "repo_url": "https://example.com/acme/widget.git",
  "branch": "main",
  "profile": "python-repair",
  "commands": ["pytest -q"],        // optional; defaults to profile commands
  "timeout_seconds": 600,            // optional; defaults to profile value
  "artifacts": true                  // optional; defaults to profile value
}
```

**Response** (the canonical run contract other repos depend on)
```json
{
  "run_id": "run_001",
  "status": "passed",                // "passed" | "failed" | "error"
  "exit_code": 0,
  "stdout": "...",
  "stderr": "",
  "duration_ms": 12345,
  "artifacts": [
    { "name": "pytest-report.txt", "url": "/runs/run_001/artifacts/pytest-report.txt" }
  ]
}
```

### `POST /repo/validate-patch`
Same as `/repo/run`, plus a unified-diff `patch` (or a pre-staged
`workspace_ref`) applied before the profile runs. The response echoes the
files the patch touched in `patched_files`.

**Request** (adds to the `/repo/run` body)
```json
{
  "client_id": "selfrepair",
  "workspace_id": "ws-9",
  "repo_url": "https://example.com/acme/widget.git",
  "branch": "main",
  "profile": "python-repair",
  "patch": "diff --git a/src/app.py b/src/app.py\n--- a/src/app.py\n+++ b/src/app.py\n@@ ...",
  "workspace_ref": null
}
```

**Response** — same shape as `/repo/run` plus:
```json
{ "...": "...", "patched_files": ["src/app.py"] }
```

### `GET /runs/{run_id}`
Returns the stored `RunResponse` (same shape as above). `404` if unknown.

### `GET /runs/{run_id}/logs`
```json
{ "stdout": "...", "stderr": "..." }
```

### `GET /runs/{run_id}/artifacts`
```json
{ "run_id": "run_001",
  "artifacts": [ { "name": "pytest-report.txt", "url": "/runs/run_001/artifacts/pytest-report.txt" } ] }
```

### `GET /runs/{run_id}/artifacts/{name}`
Serves the artifact file (`text/plain`). `404` if the run or artifact is unknown.

---

## Error responses

| Status | Condition |
|--------|-----------|
| `403`  | Requested command matches a profile `forbidden_commands` pattern (fail-closed). |
| `404`  | Unknown profile, run, or artifact. |
| `422`  | Request body fails validation (missing required fields). |

---

## Profiles

Profiles live in `matrixlab/profiles/*.yml` and are shipped with the wheel.

### `python-repair`
```yaml
name: python-repair
description: Install a Python project (editable) and run its pytest suite.
language: python
commands:
  - python -m pip install -U pip
  - pip install -e .
  - pytest -q
timeout_seconds: 600
network: restricted
max_memory_mb: 4096
artifacts: true
artifact_files:
  - pytest-report.txt
forbidden_commands:
  - "rm -rf /"
  - "mkfs"
  - "shutdown"
  - "dd if="
```

Other bundled profiles: `node-repair` (`npm ci` / `npm test`),
`docs-repair` (`mkdocs build --strict`), `ci-repair` (`ruff check` / `ruff
format --check`). Each carries the same `forbidden_commands` fail-closed list.
