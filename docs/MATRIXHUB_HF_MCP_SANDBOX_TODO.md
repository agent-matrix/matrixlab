# Build TODO: MatrixHub hosted 10-minute MCP sandbox

## 1. Hugging Face worker

- [x] Add `/mcp/sessions` start endpoint.
- [x] Add `/mcp/sessions/{id}` status endpoint.
- [x] Add `/mcp/sessions/{id}/events` SSE endpoint.
- [x] Add `/mcp/sessions/{id}/tools` endpoint.
- [x] Add `/mcp/sessions/{id}/tools/call` endpoint.
- [x] Add `/mcp/sessions/{id}` delete endpoint.
- [x] Enforce 600-second max TTL.
- [x] Enforce one session by default on free HF Space.
- [x] Kill subprocess and delete temp directory on expiry.
- [ ] Add real package cache for popular verified servers.
- [ ] Add sample MCP server fixture for CI.

## 2. MatrixHub backend controller

- [x] Add example FastAPI controller.
- [x] Add catalog search/get endpoints.
- [x] Add sandbox session endpoints.
- [x] Add SSE proxy endpoint.
- [x] Add basic audit log.
- [ ] Replace in-memory store with database.
- [ ] Add production auth and workspace scoping.
- [ ] Add signed stream URL support for browser EventSource.
- [ ] Add Hugging Face Space wake/pause via `huggingface_hub`.
- [ ] Add pool selection across `matrixhub-sandbox-1..N`.

## 3. Catalog

- [x] Add example manifest with `sandbox_enabled`.
- [ ] Add sandbox metadata to real MatrixHub catalog manifests.
- [ ] Add signed manifest support.
- [ ] Add `requires_secrets` gating.
- [ ] Add `safe_sample_arguments` per tool.

## 4. Frontend

- [x] Add TypeScript client snippet.
- [ ] Add “Test in 10-minute sandbox” button.
- [ ] Show disabled state when `sandbox_enabled=false`.
- [ ] Add lifecycle log panel using SSE.
- [ ] Add countdown timer from `expires_at`.
- [ ] Add tool list and tool-call form.
- [ ] Add manual “Stop sandbox” button.

## 5. Security

- [x] Block dangerous shell patterns in HF worker.
- [x] Allow only narrow binaries: `npx`, `uvx`, `pipx`, `python`, `python3`, `node`.
- [x] Reject env vars unless prefixed with `MATRIXHUB_PUBLIC_`.
- [ ] Move to gVisor/Kata/Firecracker for arbitrary untrusted code.
- [ ] Add network egress policy in production runtime.
- [ ] Add vulnerability/package risk scanner.
- [ ] Add org/user quotas and rate limits.
