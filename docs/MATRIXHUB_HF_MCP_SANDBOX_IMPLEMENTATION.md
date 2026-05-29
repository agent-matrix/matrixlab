# MatrixHub 10-minute Hugging Face MCP sandbox implementation

This package contains a buildable MVP for a hosted MatrixHub sandbox flow:

```text
MatrixHub.io frontend
  -> MatrixHub Sandbox Controller
  -> Hugging Face Docker Space worker
  -> temporary stdio MCP subprocess, max 10 minutes
```

The browser must call the MatrixHub backend, not the Hugging Face Space directly.
The controller validates catalog entries, enforces `sandbox_enabled`, creates HF
sessions, proxies events/tool calls, and records audit events.

## Files added or modified

### Hugging Face Space worker

```text
hf/app/mcp_sandbox.py
hf/app/main.py
hf/Dockerfile
hf/README.md
```

Endpoints exposed by the HF Space worker:

```text
GET    /mcp/health
POST   /mcp/sessions
GET    /mcp/sessions
GET    /mcp/sessions/{session_id}
GET    /mcp/sessions/{session_id}/events
GET    /mcp/sessions/{session_id}/tools
POST   /mcp/sessions/{session_id}/tools/call
DELETE /mcp/sessions/{session_id}
```

### MatrixHub controller example

```text
examples/matrixhub-controller/
  app/main.py
  app/catalog.py
  app/hf_client.py
  catalog.example.json
  requirements.txt
  .env.example
  README.md
```

Public MatrixHub endpoints implemented by the example controller:

```text
GET    /v1/meta
GET    /v1/catalog/search
GET    /v1/catalog/{id}
POST   /v1/sandbox/sessions
GET    /v1/sandbox/sessions
GET    /v1/sandbox/sessions/{id}
GET    /v1/sandbox/sessions/{id}/events
GET    /v1/sandbox/sessions/{id}/tools
POST   /v1/sandbox/sessions/{id}/tools/call
DELETE /v1/sandbox/sessions/{id}
GET    /v1/audit
```

### Frontend snippet

```text
frontend-snippets/matrixhub-sandbox-client.ts
```

## Hugging Face deployment

Deploy the `hf/` directory as a Docker Space. Configure these Space secrets:

```text
MATRIXLAB_SANDBOX_TOKEN=<random shared secret>
MATRIXLAB_MCP_MAX_TTL_SECONDS=600
MATRIXLAB_MCP_MAX_SESSIONS=1
MATRIXLAB_MCP_INSTALL_TIMEOUT_SECONDS=120
MATRIXLAB_MCP_STARTUP_TIMEOUT_SECONDS=45
MATRIXLAB_MCP_RPC_TIMEOUT_SECONDS=20
MATRIXLAB_MCP_MAX_LOG_CHARS=20000
```

For free CPU Spaces, keep `MATRIXLAB_MCP_MAX_SESSIONS=1`. For concurrency, create
a pool of Spaces and add pool selection in the controller.

## Controller deployment

Run locally:

```bash
cd examples/matrixhub-controller
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit HF_SPACE_URL and MATRIXLAB_SANDBOX_TOKEN
set -a && . ./.env && set +a
uvicorn app.main:app --reload --port 8080
```

Create a session:

```bash
curl -X POST http://localhost:8080/v1/sandbox/sessions \
  -H "Authorization: Bearer dev-matrixhub-token" \
  -H "Content-Type: application/json" \
  -d '{"catalog_id":"mcp_server:filesystem","ttl_seconds":600}'
```

Follow events:

```bash
curl -N http://localhost:8080/v1/sandbox/sessions/<session_id>/events \
  -H "Authorization: Bearer dev-matrixhub-token"
```

## Catalog manifest requirement

Each sandboxable MCP server needs:

```json
{
  "id": "mcp_server:filesystem",
  "kind": "mcp_server",
  "version": "1.0.0",
  "runtime": "node",
  "transport": "stdio",
  "verified": true,
  "sandbox_enabled": true,
  "sandbox": {
    "start_command": "npx -y @modelcontextprotocol/server-filesystem /tmp",
    "install_command": null,
    "ttl_seconds": 600,
    "requires_secrets": false,
    "network": "disabled",
    "safe_sample_arguments": {}
  }
}
```

## MVP safety policy

Allow only curated MCP catalog items. The HF worker blocks common dangerous
patterns and allows only these command binaries:

```text
npx, uvx, pipx, python, python3, node
```

The controller rejects items requiring real secrets, non-stdio transports, and
non-MCP server types.

## TODO to productionize

1. Replace in-memory controller storage with Postgres/Supabase.
2. Replace bearer token frontend auth with real user/session auth.
3. Add signed stream URLs or cookie auth for SSE; browser `EventSource` cannot set
   Authorization headers.
4. Add a Hugging Face Space pool manager for concurrency.
5. Add catalog signing and manifest verification.
6. Add risk scoring: package reputation, package version pinning, last update,
   maintainer reputation, license, vulnerabilities.
7. Add network controls in a stronger runtime when you move beyond demos. Hugging
   Face Spaces are not a hardened arbitrary-code sandbox.
8. Add persistent audit log table.
9. Add test fixtures for known MCP servers.
10. Add UI components: status panel, countdown, tool list, tool-call form, logs.
