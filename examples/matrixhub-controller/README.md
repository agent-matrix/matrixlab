# MatrixHub Sandbox Controller example

This is the API layer that MatrixHub.io should call. It validates catalog items,
checks `sandbox_enabled`, forwards safe requests to the Hugging Face Space worker,
proxies SSE events, proxies `tools/list` and `tools/call`, and records a minimal
audit trail.

## Run locally

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

## API

```text
GET    /v1/meta
GET    /v1/catalog/search?q=filesystem&sandbox_only=true
GET    /v1/catalog/{id}
POST   /v1/sandbox/sessions
GET    /v1/sandbox/sessions/{id}
GET    /v1/sandbox/sessions/{id}/events
GET    /v1/sandbox/sessions/{id}/tools
POST   /v1/sandbox/sessions/{id}/tools/call
DELETE /v1/sandbox/sessions/{id}
GET    /v1/audit
```

## Create a session

```bash
curl -X POST http://localhost:8080/v1/sandbox/sessions \
  -H "Authorization: Bearer dev-matrixhub-token" \
  -H "Content-Type: application/json" \
  -d '{"catalog_id":"mcp_server:filesystem","ttl_seconds":600}'
```

## Follow events

```bash
curl -N http://localhost:8080/v1/sandbox/sessions/SBX_ID/events \
  -H "Authorization: Bearer dev-matrixhub-token"
```
