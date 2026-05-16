---
title: MatrixLab Enterprise Console
emoji: 🧪
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
license: apache-2.0
short_description: Enterprise web console for the MatrixLab Runner
pinned: false
---

# MatrixLab Enterprise Console

The web console for the **MatrixLab Runner**. Operator-facing dashboards
for Service Monitor, Runs, Environments, Profiles, Integrations,
Security, Admin (Runtime Health / Warm Pools / Images / Settings), and
an interactive Sandbox Playground that exercises the runner's
`/code/run` endpoint.

## Connecting to a Runner

The console is **runner-agnostic** — it does not bundle a runner.
Connect it to any reachable MatrixLab Runner from **Settings → Connection**
in the top-right of the console:

| Field | Example | Notes |
|---|---|---|
| Runner URL | `https://your-runner.example.com` | The MatrixLab Runner HTTP base URL |
| Bearer token | _(optional)_ | Required when the runner has `MATRIXLAB_BEARER_TOKEN` set |
| Polling interval | `5s` | How often the console refreshes status |

The settings are persisted in browser `localStorage`; nothing is sent
to Hugging Face beyond what your browser sends directly to the
configured Runner URL.

## Running a Runner

The console talks to a standard [MatrixLab Runner](https://github.com/agent-matrix/matrixlab).
Production deployments use the published Docker image:

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
```

Then point the console's *Runner URL* at it (typically
`http://localhost:8000` for local development, or your reachable
hostname for production).

## Local development

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Build for Hugging Face

This directory is published as a Docker SDK Space. The
[CI workflow](../.github/workflows/sync-hf-console.yml) syncs the
console source from `frontend/` into the Space tree, then HF builds
the Docker image from the included `Dockerfile`.

```text
hf-console/
├── README.md       this file (HF Space metadata in the frontmatter)
├── Dockerfile      multi-stage: node build → nginx serve on :7860
├── nginx.conf      single-page-app fallback + gzip
└── (frontend/      synced from ../frontend at deploy time)
```

## License

Apache-2.0 — see the top-level [LICENSE](../LICENSE).
