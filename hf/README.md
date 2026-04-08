---
title: MatrixLab Sandbox
emoji: 🧪
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
license: apache-2.0
short_description: MatrixLab HF backend for AI repo testing and debugging
---

# MatrixLab HF Backend (Space)

This Hugging Face Space is a **microservice frontend** for MatrixLab.

It supports two modes:
1. **Upload ZIP** for static verification (syntax/security/basic tests).
2. **Remote GitHub execution** through MatrixLab Runner using environment bootstrap + cached task runs.

## Production Goal

Use this Space as a backend entrypoint for testing and debugging AI/code repos, including:
- `https://github.com/ruslanmv/gitpilot`
- `https://github.com/ruslanmv/agent-generator`
- `https://github.com/ruslanmv/RepoGuardian`

The Space sends workload requests to MatrixLab Runner (`MATRIXLAB_RUNNER_URL`), which executes in isolated containers.

## Environment Variables

Set these in HF Space settings:

- `MATRIXLAB_RUNNER_URL` (required): e.g. `https://your-runner.example.com`
- `MATRIXLAB_RUNNER_TIMEOUT_S` (optional, default `120`)

## API

### Health
```bash
GET /health
```

### List repo profiles
```bash
GET /profiles
```

### Run GitHub repo task through MatrixLab Runner
```bash
POST /repo/run
Content-Type: application/json

{
  "environment_id": "gitpilot-main",
  "profile": "gitpilot",
  "repo_url": "https://github.com/ruslanmv/gitpilot",
  "default_branch": "main",
  "branch": "main",
  "force_rebuild": false
}
```

Profiles:
- `gitpilot`
- `agent-generator`
- `repoguardian`
- `custom` (provide your own `repo_url` + scripts)

### ZIP verification mode (local in Space)
```bash
POST /runs        # upload zip multipart
GET  /runs
GET  /runs/{id}
```

## Local Run

```bash
cd hf
docker build -t matrixlab-hf-space .
docker run -p 7860:7860 -e MATRIXLAB_RUNNER_URL=http://host.docker.internal:8000 matrixlab-hf-space
```

## Notes

- This Space is intentionally lightweight and acts as control-plane API/UI.
- Containerized build/test execution happens in MatrixLab Runner.
- For production, put authentication + rate-limiting in front of `/repo/run`.
- For organization-wide maintenance sweeps, use `tools/matrix_maintainer.py` with `configs/agent_matrix_repos.json`.
