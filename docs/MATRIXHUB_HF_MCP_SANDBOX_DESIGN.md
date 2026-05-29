# MatrixHub.io + Hugging Face MCP Sandbox Design

## Goal

Add a **Test MCP Server** feature to MatrixHub.io using a Hugging Face Docker Space as a short-lived MCP sandbox worker. Each session lives for at most 10 minutes.

## Why this repository is a good base

MatrixLab already includes:

- `hf/`: Hugging Face Docker Space backend using FastAPI.
- ZIP verification endpoints under `/runs`.
- Remote MatrixLab Runner bridge under `/repo/run`.
- MCP client/inspector logic in `matrixlab/mcp_inspector.py`.
- Safety-first language around ephemeral sandbox execution.

The missing feature was a live MCP session API. The new `hf/app/mcp_sandbox.py` module adds it.

## Runtime architecture

```text
MatrixHub.io frontend
  -> MatrixHub backend / sandbox controller
  -> Hugging Face Space: matrixlab-mcp-sandbox
  -> /mcp/sessions
  -> MCP subprocess over stdio
  -> tools/list and tools/call
  -> auto cleanup at 600 seconds
```

Browser clients should not call the Hugging Face Space directly. MatrixHub backend should proxy calls so it can enforce authentication, rate limits, entity validation, and audit logging.

## API contract

### Start

`POST /mcp/sessions`

```json
{
  "entity_id": "tool.io-github-example-mcp@1.0.0",
  "runtime": "node",
  "start_command": "npx -y example-mcp-server",
  "transport": "stdio",
  "ttl_seconds": 600
}
```

Optional:

```json
{
  "install_command": "pipx install example-mcp-server"
}
```

Prefer no separate install command when using `npx -y`, `uvx`, or `pipx run` because those commands can resolve and run directly.

### Status

`GET /mcp/sessions/{session_id}`

Returns status, remaining TTL, logs, and discovered tools.

### Tools

`GET /mcp/sessions/{session_id}/tools`

Returns the cached `tools/list` result discovered during startup.

### Tool call

`POST /mcp/sessions/{session_id}/tools/call`

```json
{
  "name": "tool_name",
  "arguments": {}
}
```

### Stop

`DELETE /mcp/sessions/{session_id}`

Kills the process and deletes temporary files.

## MatrixHub backend responsibilities

MatrixHub should not forward arbitrary commands from the browser. It should build commands from trusted catalog metadata.

Recommended entity-to-command mapping:

```ts
type MatrixHubMcpSandboxPlan = {
  entity_id: string
  runtime: 'node' | 'python' | 'generic'
  start_command: string
  install_command?: string
  ttl_seconds: 600
}
```

Examples:

```json
{
  "runtime": "node",
  "start_command": "npx -y @modelcontextprotocol/server-filesystem /tmp"
}
```

```json
{
  "runtime": "python",
  "start_command": "uvx example-mcp-server"
}
```

```json
{
  "runtime": "python",
  "start_command": "pipx run example-mcp-server"
}
```

## Hugging Face operations

Use one Space first:

```text
your-org/matrixhub-mcp-sandbox
```

Then later use a pool:

```text
your-org/matrixhub-mcp-sandbox-1
your-org/matrixhub-mcp-sandbox-2
your-org/matrixhub-mcp-sandbox-3
```

Controller flow:

1. Find idle Space.
2. If paused, call Hugging Face `restart_space()`.
3. Poll runtime until running.
4. Call `POST /mcp/sessions`.
5. Proxy test calls for 600 seconds.
6. Call `DELETE /mcp/sessions/{id}`.
7. If no active sessions, call `pause_space()`.

## Safety constraints for the HF free MVP

Keep this strict:

- `MATRIXLAB_MCP_MAX_SESSIONS=1`
- `MATRIXLAB_MCP_MAX_TTL_SECONDS=600`
- no user secrets
- no direct browser-to-Space access
- no arbitrary shell scripts
- no Docker-in-Docker
- no package manager commands such as `apt`, `apk`, `yum`, `dnf`
- no `curl`, `wget`, `sudo`, shell chaining, or redirects

This does not make Hugging Face a hardened sandbox; it makes it a practical compatibility tester for curated MCP servers.

## MatrixHub UI states

Recommended UI states:

```text
Queued -> Waking Space -> Installing -> Starting -> Ready -> Expired
                      \-> Failed
```

Show:

- install/start logs
- tools count
- discovered tool schemas
- TTL countdown
- Stop button

## Upgrade path

When traffic grows, keep the same MatrixHub API and swap the backend runtime:

1. HF Space pool for free/early demo.
2. Cloud Run service for more predictable short sessions.
3. Modal Sandboxes for easier ephemeral code execution.
4. Kubernetes + gVisor/Kata or Firecracker for production-grade isolation.
