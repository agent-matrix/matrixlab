# MatrixLab stability review for GitPilot enterprise sandbox runtime

This review focuses on making MatrixLab stable, safe, and simple enough to serve as the runtime environment for testing and running GitPilot enterprise sandbox workloads, especially the GitPilot branch `claude/code-review-improvements-F0BE9`.

## Target workload assumptions

The referenced GitPilot branch is a multi-agent coding assistant with a Python FastAPI backend, React/web UI, VS Code extension, provider integrations, Docker deployment, and test automation. Its README describes an Explorer, Planner, Coder, and Reviewer flow, plus `Ask`, `Auto`, and `Plan` execution modes. For MatrixLab, this means the runtime must support:

- Cloning GitHub repositories and checking out feature branches.
- Installing Python and JavaScript dependencies.
- Running backend tests, frontend tests/builds, static analysis, and security checks.
- Capturing logs and artifacts in a form GitPilot can present to users and reviewers.
- Enforcing enterprise controls around network access, permissions, resource limits, and auditability.

## Current MatrixLab strengths

MatrixLab already has the right high-level shape for a GitPilot runtime:

1. **Docker-isolated runner service** — the Runner API exposes health, capabilities, direct `/run`, and cached environment lifecycle endpoints.
2. **Language-specific sandbox images** — local compose builds Python, Node, Go, Rust, and utility sandboxes.
3. **MCP integration** — the MCP server exposes runner diagnostics, repo exploration helpers, stack detection, `repo_run`, and `zip_run` tools.
4. **HF backend control plane** — the Hugging Face backend can create cached environments and run profile-driven repo tasks against GitPilot.
5. **Disposable workspaces and artifact ZIPs** — each run creates a job directory, mounts workspace/output paths into a sandbox, and returns output artifacts as base64 ZIP content.


## Implemented native-runner baseline

MatrixLab now includes the first native GitPilot runner contract surface:

- `GET /health` returns `ok`, `service`, `version`, and Docker diagnostics.
- `GET /capabilities` advertises `matrixlab.runner.v1`, image aliases, features, endpoints, and execution limits for protocol negotiation.
- `POST /workspaces/upload` stores base64 ZIP workspaces for portable local-workspace execution.
- `POST /run` accepts both the legacy MatrixLab step contract and the native GitPilot `cmd`/`workspace` contract.
- `POST /repo/run` clones a remote repository/ref and executes a command behind the same native response shape.
- `GET /runs/{sandbox_id}/events` exposes MatrixLab stdout/stderr/artifact/exit events.
- `GET /runs/{sandbox_id}/artifacts` and `GET /runs/{sandbox_id}/artifacts/{artifact_id}` expose stored run artifacts.
- `POST /env/bootstrap`, `POST /env/{env_id}/run`, and `DELETE /env/{env_id}` provide GitPilot-friendly lifecycle aliases over the existing environment cache.

The remaining roadmap items below are still needed for a fully production-hardened GitPilot deployment, especially true live streaming, tenant-aware persistence, egress allowlists, image-digest enforcement, and a Docker-socket-free executor architecture.

## Implemented warm-pool baseline

MatrixLab also includes an opt-in Docker cgroup-freezer warm-pool baseline for local/worker deployments:

- `MATRIXLAB_WARM_POOL_ENABLED=1` starts a background high/low-watermark replenisher.
- `MATRIXLAB_WARM_POOL_MIN` and `MATRIXLAB_WARM_POOL_MAX` control how many paused containers are kept ready.
- `MATRIXLAB_WARM_POOL_IMAGES` chooses the image aliases to prewarm, such as `python,node`.
- Warm containers start with `--network none`, are paused with Docker cgroups, unpaused for one workspace command, and destroyed after the command completes.
- `/pool/status` reports warm-pool state for diagnostics and autoscaling hooks.

This implements the simpler cgroup-freezer option. Firecracker snapshot/restore remains the recommended future isolation model for high-scale enterprise multi-tenant deployments.

## Stability gaps to close before enterprise use

### 1. Replace Docker socket mounting with a hardened execution boundary

The compose setup mounts `/var/run/docker.sock` into the Runner and runs the Runner container as root. This is convenient for local development but not enterprise-safe because Docker socket access is effectively host-root access.

**Required before stable enterprise use:**

- Provide a production executor mode that does not expose the host Docker socket to the control plane.
- Split the control-plane API from the privileged executor process or run the executor on dedicated throwaway hosts.
- Add a documented threat model for attacker-controlled repo code, malicious dependencies, and compromised sandbox images.
- Default production deployment docs should mark Docker socket mode as local/dev only.

### 2. Make network policy explicit and enforceable per phase

The current step model allows `none` or `egress`, and setup defaults to egress while task execution defaults to no network. That is a good start, but GitPilot enterprise runs need more granular controls.

**Required before stable enterprise use:**

- Define named phases such as `clone`, `setup`, `test`, `review`, and `artifact_upload` with fixed network defaults.
- Add allowlists for GitHub, package registries, and internal mirrors.
- Add a dependency-cache mode so tests can run with `network=none` after setup.
- Record the effective network policy in every run result.

### 3. Add authentication, authorization, and tenancy controls

Runner and HF endpoints are currently unauthenticated service APIs. The README already notes that production should put authentication and rate limiting in front of HF `/repo/run`, but the stable product should not rely on external reverse-proxy configuration alone.

**Required before stable enterprise use:**

- Add first-class API authentication for Runner and HF backend calls.
- Add tenant/project IDs to environment records and run records.
- Validate that users can only access environments, artifacts, and logs for their tenant.
- Add rate limits and concurrent-run quotas by tenant.

### 4. Persist run metadata, logs, and artifacts outside process memory

The HF backend stores ZIP verification runs in memory, while Runner environment metadata is file-backed under a local data directory. Enterprise GitPilot usage needs durable audit trails and predictable cleanup.

**Required before stable enterprise use:**

- Store run metadata in SQLite/PostgreSQL with schema migrations.
- Store artifacts in object storage or a managed artifact directory with retention policy.
- Add a run detail API with timestamps, phase durations, image digests, resource limits, network mode, exit codes, and artifact references.
- Add artifact size limits, output truncation policy, and cleanup jobs.

### 5. Pin and verify sandbox images

Compose uses local `:latest` image tags, and the Runner can pull images based on `MATRIXLAB_DOCKER_PULL`. For reproducible enterprise results, image identity must be immutable.

**Required before stable enterprise use:**

- Publish versioned sandbox images and use immutable digests in production profiles.
- Include image name and digest in run results.
- Add image provenance/SBOM generation and vulnerability scanning.
- Maintain separate slim runtime images and larger build images for heavy repositories.

### 6. Improve GitPilot-specific setup and test profiles

The current HF `gitpilot` profile installs only root Python `requirements.txt` when present and then runs generic Python tests. The referenced GitPilot branch includes a backend, frontend, VS Code extension, docs, Docker files, and tests, so a stable runtime needs a richer profile.

**Recommended GitPilot profile phases:**

```bash
# setup
python -m venv .venv
. .venv/bin/activate
python -m pip install -U pip
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then pip install -e .[dev] || pip install -e .; fi
if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; fi
if [ -f frontend/package-lock.json ]; then (cd frontend && npm ci); fi
if [ -f extensions/vscode/package-lock.json ]; then (cd extensions/vscode && npm ci); fi

# test/check
. .venv/bin/activate || true
pytest -q || python -m unittest discover || python -m compileall .
if [ -f package.json ]; then npm test -- --watch=false || npm run build; fi
if [ -f frontend/package.json ]; then (cd frontend && npm test -- --watch=false || npm run build); fi
if [ -f extensions/vscode/package.json ]; then (cd extensions/vscode && npm test -- --watch=false || npm run compile); fi
```

This should become a named `gitpilot-enterprise` profile with higher memory/CPU defaults and a Node+Python capable sandbox image.

### 7. Provide a one-command stable path for local and CI use

The project has useful Make targets, but stable adoption needs a narrower golden path.

**Required before stable use:**

- Add `make doctor` to validate Docker, compose, image availability, Runner health, MCP tool list, and HF profile connectivity.
- Add `make gitpilot-smoke BRANCH=...` to run the GitPilot profile end to end.
- Add JSON examples for direct Runner, HF `/repo/run`, and MCP `repo_run` invocation.
- Document expected runtime requirements: Docker version, disk, CPU, memory, network, and OS constraints.

### 8. Make failure modes easier to diagnose

MatrixLab returns step stdout/stderr and artifact ZIPs, but enterprise users need structured failure reasons instead of only raw logs.

**Required before stable use:**

- Add normalized statuses such as `clone_failed`, `setup_failed`, `test_failed`, `timeout`, `resource_exhausted`, and `policy_denied`.
- Include timeout, CPU, memory, and pids limit values in each failed step.
- Include the exact command, sanitized environment, image, network mode, and working directory in run details.
- Preserve full logs as artifacts while returning concise summaries to API clients.

### 9. Add stronger input validation and command policy

The APIs currently accept scripts and commands directly. That is powerful, but enterprise sandbox usage needs policy controls around what can be executed.

**Required before stable use:**

- Separate trusted profile scripts from user-supplied task commands.
- Add optional command allowlists or policy hooks.
- Restrict repository URLs by organization/host for managed tenants.
- Validate refs and branches to avoid shell surprises and confusing fallbacks.

### 10. Expand automated tests beyond route checks

`make test` currently compiles Python code and checks that important routes exist. Stable enterprise usage needs integration coverage of real sandbox behavior.

**Required before stable use:**

- Unit-test request validation, profile expansion, cache key changes, artifact extraction, and error normalization.
- Integration-test direct `/run` with each sandbox image.
- Integration-test environment bootstrap cache hit/miss behavior.
- Contract-test HF `/repo/run` responses and MCP tool outputs.
- Add CI jobs that run lightweight tests without Docker and privileged integration tests on Docker-capable runners.

## Suggested stabilization roadmap

### Phase 0 — Product definition and hardening baseline

- Define supported GitPilot workflows: backend checks, frontend checks, VS Code extension checks, full Docker compose smoke, and read-only code review.
- Publish a threat model and explicitly classify local/dev versus production deployment modes.
- Add `make doctor` and a GitPilot profile smoke test.

### Phase 1 — Simple stable developer experience

- Add a `gitpilot-enterprise` profile with Python+Node setup.
- Add a documented `curl` workflow for the referenced GitPilot branch.
- Add structured run records and better failure statuses.
- Pin sandbox image versions for the default compose path.

### Phase 2 — Enterprise runtime controls

- Add Runner/HF authentication.
- Add tenant/project isolation.
- Add persistent metadata/artifact storage.
- Add concurrency limits, retention policy, and audit log export.

### Phase 3 — Production executor architecture

- Replace or isolate Docker socket execution.
- Add image digest enforcement and SBOM/vulnerability scanning.
- Add network allowlists and dependency mirror support.
- Add hardened deployment templates for Kubernetes or dedicated executor hosts.

## Minimal GitPilot branch smoke API example

Once a GitPilot-specific profile exists, the stable user-facing request should be as simple as:

```bash
curl -X POST "$MATRIXLAB_HF_URL/repo/run" \
  -H 'Content-Type: application/json' \
  -d '{
    "environment_id": "gitpilot-code-review-improvements",
    "profile": "gitpilot-enterprise",
    "repo_url": "https://github.com/ruslanmv/gitpilot",
    "default_branch": "claude/code-review-improvements-F0BE9",
    "branch": "claude/code-review-improvements-F0BE9",
    "force_rebuild": false
  }'
```

The response should include a durable run ID, clear phase status, artifact URLs, image digest, resource limits, network policy, and a copy-paste-ready summary for GitPilot's Reviewer agent.

## Stable-readiness checklist

MatrixLab should be considered stable for GitPilot enterprise sandbox use when all of the following are true:

- [ ] `make doctor` passes on a clean machine.
- [ ] A GitPilot branch can be cloned, bootstrapped, tested, and re-tested from cache with one documented command.
- [ ] Runner and HF APIs require authentication in non-dev deployments.
- [ ] Docker socket mode is documented as local/dev only or replaced with a hardened executor architecture.
- [ ] Run metadata and artifacts are persisted with retention controls.
- [ ] Sandbox images are versioned, scanned, and referenced by digest in production profiles.
- [ ] Network policy, resource limits, command, image, and artifact references are recorded for every run.
- [ ] Failure responses are structured enough for GitPilot agents to act on without scraping raw logs.
- [ ] CI includes unit, API contract, and Docker-backed integration tests.
