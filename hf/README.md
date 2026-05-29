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

---

## MatrixHub MCP 10-minute sandbox mode

This Space can also run as a short-lived MCP server test worker for MatrixHub.io.

### Flow

1. MatrixHub.io user clicks **Test MCP Server**.
2. MatrixHub backend validates the MatrixHub entity manifest.
3. Backend restarts/wakes this Hugging Face Space if needed.
4. Backend calls `POST /mcp/sessions` with a curated install/start command.
5. The Space starts the MCP server over `stdio`, sends `initialize`, then `tools/list`.
6. MatrixHub proxies tool tests through this Space for up to 600 seconds.
7. The Space kills the MCP process and deletes `/tmp` session data.
8. MatrixHub backend may call Hugging Face `pause_space()` after the session expires.

### Recommended Space secrets

- `MATRIXLAB_SANDBOX_TOKEN`: bearer token required by `/mcp/*` write/read APIs.
- `MATRIXLAB_MCP_MAX_TTL_SECONDS`: default `600`.
- `MATRIXLAB_MCP_MAX_SESSIONS`: default `1` for free CPU Spaces.

### Start a session

```bash
curl -X POST "$SPACE_URL/mcp/sessions" \
  -H "Authorization: Bearer $MATRIXLAB_SANDBOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "filesystem-demo",
    "runtime": "node",
    "start_command": "npx -y @modelcontextprotocol/server-filesystem /tmp",
    "transport": "stdio",
    "ttl_seconds": 600
  }'
```

### Poll status

```bash
curl -H "Authorization: Bearer $MATRIXLAB_SANDBOX_TOKEN" \
  "$SPACE_URL/mcp/sessions/$SESSION_ID"
```

### List tools

```bash
curl -H "Authorization: Bearer $MATRIXLAB_SANDBOX_TOKEN" \
  "$SPACE_URL/mcp/sessions/$SESSION_ID/tools"
```

### Call a tool

```bash
curl -X POST "$SPACE_URL/mcp/sessions/$SESSION_ID/tools/call" \
  -H "Authorization: Bearer $MATRIXLAB_SANDBOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"example_tool","arguments":{}}'
```

### MVP safety constraints

This HF mode is a compatibility sandbox, not hardened isolation. For the free MVP, use only curated MatrixHub entries and keep these defaults:

- TTL max: 600 seconds
- Max sessions: 1 per free Space
- No user secrets
- No arbitrary shell scripts
- Allow only `npx`, `uvx`, `pipx`, `python`, `python3`, and `node` commands
- Block `curl | bash`, `wget | bash`, `sudo`, `docker`, package-manager installs, and shell chaining


---

## MatrixHub 10-minute MCP sandbox worker

This Space also exposes a MatrixHub-facing MCP sandbox API. It is designed to be
called by the MatrixHub backend controller when a user clicks **Test in sandbox**.

### Required Space secrets

```text
MATRIXLAB_SANDBOX_TOKEN=<random shared secret>
MATRIXLAB_MCP_MAX_TTL_SECONDS=600
MATRIXLAB_MCP_MAX_SESSIONS=1
MATRIXLAB_MCP_INSTALL_TIMEOUT_SECONDS=120
MATRIXLAB_MCP_STARTUP_TIMEOUT_SECONDS=45
MATRIXLAB_MCP_RPC_TIMEOUT_SECONDS=20
```

### Worker endpoints

```text
GET    /mcp/health
POST   /mcp/sessions
GET    /mcp/sessions/{session_id}
GET    /mcp/sessions/{session_id}/events
GET    /mcp/sessions/{session_id}/tools
POST   /mcp/sessions/{session_id}/tools/call
DELETE /mcp/sessions/{session_id}
```

### Example direct test

```bash
curl -X POST "$SPACE_URL/mcp/sessions" \
  -H "Authorization: Bearer $MATRIXLAB_SANDBOX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "mcp_server:filesystem",
    "runtime": "node",
    "start_command": "npx -y @modelcontextprotocol/server-filesystem /tmp",
    "transport": "stdio",
    "ttl_seconds": 600
  }'
```

Then stream events:

```bash
curl -N "$SPACE_URL/mcp/sessions/$SESSION_ID/events" \
  -H "Authorization: Bearer $MATRIXLAB_SANDBOX_TOKEN"
```

This worker is for curated compatibility testing only. Do not pass production
secrets into it and do not expose it directly to browsers.
