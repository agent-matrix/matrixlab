# MatrixLab Upgrade — Dedicated Hugging Face MCP Test Server for matrixhub.io

**Status:** Proposed (design / implementation brief)
**Audience:** Backend developer implementing the MatrixHub backend + MatrixLab runtime upgrade.
**Supersedes / extends:** `MATRIXHUB_HF_MCP_SANDBOX_DESIGN.md`,
`MATRIXHUB_HF_MCP_SANDBOX_IMPLEMENTATION.md`, `MATRIXHUB_HF_MCP_SANDBOX_TODO.md`.

---

## 0. TL;DR

We already shipped a **single-session, free-tier MVP** (`hf/app/mcp_sandbox.py` +
`examples/matrixhub-controller/`). It proves the flow but cannot satisfy the
executive brief, which asks for a **dedicated server in Hugging Face that can
test *all* the MCP servers in matrixhub.io** and back the operator CLI console
1:1.

This document upgrades the MVP into a **dedicated, stable, capacity-bounded MCP
Test Server** ("`matrixhub-mcp-testd`") plus a **MatrixHub control plane** that:

1. Runs on **upgraded, always-warm HF hardware** (not a paused free Space), with
   a **bounded concurrent session pool** and a **fair queue**.
2. Tests **both transport classes present in the live catalog** — local
   `STDIO` subprocess servers *and* remote `SSE`/streamable-HTTP servers — not
   just stdio.
3. Adds the **missing plan-derivation layer** that turns a real catalog
   manifest (`mcp_registration` + `packages[]`: npm / pypi / mcpb / oci) into a
   safe, signed run plan, and computes `sandbox_enabled` automatically instead of
   requiring it to be hand-authored on ~7,100 manifests.
4. Adds a **catalog-wide conformance sweep** that produces a persisted
   **compatibility report** per server (the artifact that powers the green/grey
   "● available" tag and the marketplace's "verified build" claim).
5. Maps every CLI command in the brief (§3) onto a real route, and reproduces
   the `install → run` streamed event sequence (§4) **verbatim**.

### The local-vs-hosted decision (resolved)

The brief flags this as the one thing to confirm up front. The task —
*"create a dedicated server in Hugging Face … to test all our MCP servers"* —
answers it for the **test/sandbox path**: that path is **hosted** (the dedicated
HF server; the URL is remote). We therefore adopt a **hybrid** model and stop
pretending it is one or the other:

| Path | Where it runs | URL the user sees | Who owns it |
|---|---|---|---|
| `matrix install` / `matrix run` (operator's own machine) | **Local** runner daemon | `http://127.0.0.1:<port>/sse` | The MatrixLab CLI on the user's box |
| `matrix mcp test` / "Test in sandbox" (marketplace) | **Hosted** dedicated HF test server | `https://<space>/s/<token>/sse` (expiring) | MatrixHub cloud |

The `127.0.0.1` in the pasted console output stays **honest** for the local
install/run lifecycle. The marketplace "trial before install" button is the
hosted path. Both speak the **same event schema and the same lifecycle steps**,
flagged `sandbox: true|false` and `location: "local"|"hosted"`. This is the
single most important architectural commitment in this document; everything
below is built around it.

---

## 1. Goals & non-goals

### Goals
- A **dedicated** HF Space (`matrixhub-mcp-testd`) that is the canonical place to
  trial/probe any sandbox-eligible MCP server in the catalog.
- Support **N concurrent** short-lived sessions (not 1), bounded by hardware, with
  a queue and per-workspace quotas.
- Support **STDIO** (subprocess) **and** **SSE / streamable-HTTP** (remote/proxied)
  MCP servers — both exist in the live catalog.
- **Derive** run plans + `sandbox_enabled` from real manifests; sign them; verify
  signatures before execution.
- A **batch conformance harness** that can sweep the whole catalog on a schedule
  and emit a per-server **compatibility report** + **trust badge**.
- A control plane that backs the CLI console 1:1 (brief §3) and the marketplace
  "Test in sandbox" UI, with auth, audit, SSE, and a real `/v1/meta` banner.

### Non-goals (explicitly out of scope for this upgrade)
- Hosting MCP servers **long-term** as a production runtime for end users
  (that is the local runner / customer gateway, not this test server).
- Hardened multi-tenant arbitrary-code isolation **on HF** (HF Spaces are not
  Firecracker/gVisor). We keep curated + signed + allowlisted, and document the
  graduation path (§11.4) to Cloud Run / Modal / Kata when arbitrary code is
  needed.
- Running servers that **require real secrets** against real third-party APIs
  (those are tested with mock/scoped tokens only, or marked
  `sandbox_enabled:false`).

---

## 2. What exists today vs. what the brief needs (gap analysis)

| Capability | MVP today | Brief / this upgrade |
|---|---|---|
| HF sessions | 1 (`MATRIXLAB_MCP_MAX_SESSIONS=1`) | Pool of **N**, queue, quotas |
| HF lifecycle | Paused free Space, wake-on-demand | **Dedicated always-warm** Space (upgraded HW), wake/pause as cost control |
| Transports | `stdio` only | `stdio` **+ `sse` / streamable-HTTP** |
| `sandbox_enabled` | Hand-authored boolean on manifest | **Derived** from manifest + policy, persisted |
| `start_command` | Hand-authored `sandbox.start_command` | **Derived** from `packages[]` / `mcp_registration.exec`, **signed** |
| Catalog source | `catalog.example.json` (1 item) | Live catalog (~7,100 servers, mixed transports) |
| Testing | Manual single `tools/call` | **Conformance suite** + **catalog-wide sweep** + report |
| Result surface | logs + tools list | **Compatibility report**, verdict, badge, latency |
| Storage | In-memory dicts | **Postgres** (sessions, reports, audit) |
| Auth | shared bearer | Identity + workspace scoping + signed stream URLs |
| Signing | none | **Signed manifests + signed run plans**, verified pre-exec |

The MVP is the seed of the **session worker** and the **control plane**; this
upgrade keeps both module boundaries and grows them.

---

## 3. Target architecture

```text
                        ┌──────────────────────────────────────────────┐
   Browser (MatrixHub.io)│  Marketplace UI  +  Matrix CLI Console (SSE) │
                        └───────────────┬──────────────────────────────┘
                                        │  HTTPS (cookie / signed stream URL)
                          ┌─────────────▼──────────────┐
                          │   MatrixHub Control Plane    │  (cloud: Cloud Run / Fly / k8s)
                          │  FastAPI + Postgres + Redis  │
                          │  • /v1/catalog/* (search/show)│
                          │  • /v1/installs (local proxy)│
                          │  • /v1/runners/* (local proxy)│
                          │  • /v1/sandbox/* (hosted test)│
                          │  • /v1/assistant (RAG)        │
                          │  • /v1/meta, /v1/audit        │
                          │  • Auth · Audit · Signing     │
                          │  • Plan derivation + verify   │
                          │  • HF pool manager + queue    │
                          └───┬───────────────────┬──────┘
            local path        │                   │     hosted test path
        (matrix install/run)  │                   │  (matrix mcp test / "Test in sandbox")
                              ▼                   ▼
                   ┌────────────────────┐   ┌─────────────────────────────────────┐
                   │ Local Runner daemon │   │  Dedicated HF Space: matrixhub-mcp-testd │
                   │ ~/.matrix/runners   │   │  • session pool (N concurrent)        │
                   │ 127.0.0.1:<port>    │   │  • stdio subprocess workers           │
                   │ (user's machine)    │   │  • sse/http proxy workers             │
                   └────────────────────┘   │  • conformance harness                │
                                            │  • TTL auto-destroy, /tmp wipe         │
                                            └─────────────────────────────────────┘
                                                          │ (egress allow-list)
                                                          ▼
                                            npm / PyPI / mcpb release assets
                                            (and, for remote servers, the
                                             server's own published endpoint)
```

Key principles:
- **Browsers never talk to the HF Space directly.** The control plane proxies so
  it can enforce auth, quotas, validation, audit, and signed-URL expiry.
- **The control plane derives and signs the run plan; the Space verifies the
  signature before executing.** The Space never accepts a free-form command from
  the browser.
- **One event schema everywhere**: `{ step, status: "start|ok|error", message, data }`.

---

## 4. The dedicated HF test server (`matrixhub-mcp-testd`)

This is the upgrade of `hf/app/mcp_sandbox.py` into a real, multi-session worker.

### 4.1 Hardware & lifecycle
- Dedicated Space on **upgraded hardware** (start: CPU upgrade / small GPU not
  required; size for `MATRIXLAB_MCP_MAX_SESSIONS` × per-session RAM). Persistent
  storage **off** (ephemeral by design); a small **build cache** volume is the one
  exception (§4.4).
- **Always-warm** during business windows; the control plane may `pause_space()`
  off-peak and `restart_space()` on first request (warmup event emitted to the
  UI as `step:"waking"`). For the *sweep* (§6) the Space is kept warm for the
  duration of the batch.

### 4.2 Multi-session pool (replaces `MAX_SESSIONS=1`)
- `MATRIXLAB_MCP_MAX_SESSIONS = N` (sized to hardware; e.g. 4–8 on a CPU-upgrade
  Space). Each session keeps its own `workdir`, subprocess, stderr pump, event
  queue, and TTL task (the MVP already models this per-session — we just lift the
  global cap and add admission control).
- **Admission control**: when full, return `429` with `Retry-After` and a queue
  position; the control plane owns the actual fair queue (Redis), the Space stays
  simple and stateless-ish.
- **Hard caps unchanged in spirit**: per-session CPU/mem/time limits, TTL ≤ a few
  minutes, `/tmp`-only writes, no persistent storage, egress allow-list.

### 4.3 Multi-transport workers (NEW — the catalog needs this)
The live catalog has both `STDIO` and `SSE` servers. The worker gains a
`transport` dimension:

- **`stdio`** (today): spawn subprocess, JSON-RPC over stdin/stdout, `initialize`
  → `notifications/initialized` → `tools/list`. (Already implemented; keep.)
- **`sse` / `streamable-http`** (NEW): two sub-modes —
  - **launch-then-proxy**: the server is a package that *serves* SSE locally
    (e.g. `uvx some-server --transport sse --port $PORT`). The worker launches it,
    waits for `/health` or first SSE byte, then health-checks and proxies
    `/sse` + `/messages` to the control plane. This is the path that produces the
    `http://127.0.0.1:<port>/sse`-style URL — except hosted, it becomes the
    expiring `https://<space>/s/<token>/sse`.
  - **remote-attach** (probe-only): the manifest points at an already-published
    remote endpoint (the ~173 manifests with a `url`). The worker does **not**
    launch anything; it connects as an MCP *client* to verify reachability,
    `initialize`, and `tools/list`, then disconnects. Used for conformance
    badges, never for proxying third-party endpoints to anonymous browsers.

A small `transport.py` in the worker abstracts an `MCPSession` interface
(`initialize()`, `list_tools()`, `call_tool()`, `close()`) with `StdioBackend`
and `SseBackend` implementations so the rest of the worker is transport-agnostic.

### 4.4 Build cache (the only persisted state)
Sweeping 7,100 servers means re-resolving npm/pypi packages constantly. Add an
**append-only, content-addressed cache** for resolved artifacts (npm tarballs,
wheels, mcpb bundles) keyed by `fileSha256` from the manifest `packages[]`. This:
- speeds the sweep dramatically,
- lets us **pin + verify** the exact bytes we tested (provenance),
- never holds session data (sessions remain ephemeral).

### 4.5 Worker endpoints (superset of MVP)
```text
GET    /mcp/health                         # + pool capacity, queue depth, build-cache stats
POST   /mcp/sessions                       # now requires a SIGNED run plan (see §11.2)
GET    /mcp/sessions  /{id}  /{id}/events  # unchanged shape
GET    /mcp/sessions/{id}/tools
POST   /mcp/sessions/{id}/tools/call
DELETE /mcp/sessions/{id}
POST   /mcp/conform                        # NEW: run the conformance suite, return a report
GET    /s/{stream_token}/sse               # NEW: expiring proxied SSE for launch-then-proxy servers
```

---

## 5. Catalog → sandbox plan derivation (the missing layer)

Real catalog manifests look like this (from `catalog/servers/.../manifest.json`):

```json
{
  "id": "mcp.io-github-rghsoftware-linux-filesystem.stdio.f75944e510",
  "type": "mcp_server",
  "version": "1.2.1",
  "mcp_registration": { "server": { "exec": { "cmd": [], "env": {} }, "transport": "STDIO" } },
  "packages": [{ "registryType": "mcpb", "identifier": "https://…/linux-filesystem.mcpb",
                 "fileSha256": "3174…", "transport": { "type": "stdio" } }],
  "lifecycle": { "status": "disabled", "reason": "Missing required package metadata …" }
}
```

There is **no** `sandbox_enabled` and **no** `sandbox.start_command`. Hand-authoring
those on ~7,100 manifests is a non-starter. So the control plane gains a
**deterministic plan deriver** (`planner/derive.py`):

### 5.1 Inputs → output
Input: a catalog manifest. Output: a `SandboxPlan` (or a rejection with reason).

```jsonc
// SandboxPlan (derived, then signed)
{
  "catalog_id": "mcp.io-github-…",
  "version": "1.2.1",
  "runtime": "node|python|generic",
  "transport": "stdio|sse",
  "command": ["npx","-y","@scope/pkg","..."],   // argv, never a shell string
  "env_allowlist": ["MATRIXHUB_PUBLIC_*"],
  "artifact": { "registryType":"npm|pypi|mcpb|oci", "identifier":"…", "sha256":"…" },
  "network": "disabled|allowlist",
  "ttl_seconds": 300,
  "sandbox_enabled": true,
  "reasons": []                                   // why enabled/disabled
}
```

### 5.2 Derivation rules (per `packages[].registryType`)
| registryType | derived command | notes |
|---|---|---|
| `npm` | `["npx","-y","<pkg>@<ver>"]` | pin version; `transport.type` selects stdio/sse args |
| `pypi` | `["uvx","<pkg>==<ver>"]` (or `pipx run`) | prefer `uvx` for speed |
| `mcpb` | download `identifier`, **verify `fileSha256`**, unpack, exec entry from bundle manifest | uses build cache |
| `oci` | **not** runnable on HF (no Docker-in-Docker) → `sandbox_enabled:false`, reason `oci_requires_container_runtime` | graduate to Cloud Run tier |
| (none) / `exec.cmd` empty | `sandbox_enabled:false`, reason mirrors `lifecycle.reason` | matches the `disabled` example above |

### 5.3 `sandbox_enabled` computation (policy gate)
`sandbox_enabled = true` only if **all** hold:
- `type == "mcp_server"` and `lifecycle.status != "disabled"`.
- A runnable package was derived (npm/pypi/mcpb with a known entry), **or** a
  remote `url` exists (→ probe-only mode).
- `requires_secrets == false` (no required secret env without a mock).
- Derived `command[0]` ∈ allowlist (`npx/uvx/pipx/python/python3/node`) and no
  blocked tokens/shell patterns (reuse the MVP `_validate_command` rules).
- Size/time within caps.

The result + `reasons[]` is **persisted on the catalog item** (so the UI's
green/grey tag is a cheap read), and **recomputed** by the sweep (§6). This is how
"not every server is sandbox-enabled" becomes true and explainable rather than a
hand-set flag.

### 5.4 Signing
The derived plan is canonicalized (sorted JSON) and **signed** by the control
plane's plan-signing key. `POST /mcp/sessions` and `POST /mcp/conform` accept
`{plan, signature}`; the Space **verifies** before executing (§11.2). The browser
can never inject a command — it can only name a `catalog_id`.

---

## 6. The catalog-wide conformance harness ("test all our MCP servers")

This is the literal request: a way to test *all* servers. Two modes:

### 6.1 Per-server conformance suite (`POST /mcp/conform`)
Given a signed plan, run a fixed, bounded battery and return a structured report:

| Check | Pass criterion |
|---|---|
| `resolve` | plan derived + signature valid |
| `materialize` | artifact fetched, `sha256` matches |
| `launch` | process starts (stdio) / endpoint reachable (sse) within startup timeout |
| `initialize` | MCP `initialize` returns a valid result, protocol version captured |
| `tools/list` | returns ≥ 0 tools; schemas well-formed |
| `smoke_call` | if `safe_sample_arguments` present, call one read-only tool; assert no error | 
| `teardown` | process exits / temp wiped within grace |

Output `ConformanceReport`:
```jsonc
{
  "catalog_id": "...", "version": "...", "transport": "stdio",
  "verdict": "pass|partial|fail|skipped",
  "checks": [{ "name":"initialize","status":"ok","ms":812 }, ...],
  "tools_count": 7,
  "protocol_version": "2024-11-05",
  "latency_ms": { "init": 812, "tools_list": 41 },
  "artifact_sha256": "3174…",
  "tested_at": "2026-05-29T…Z",
  "worker": "matrixhub-mcp-testd@<rev>",
  "logs_tail": "…"
}
```

### 6.2 Catalog-wide sweep (scheduled)
A control-plane job (`sweep/runner.py`, triggered by cron / GitHub Action):
1. Stream the catalog index (~7,100 servers).
2. For each: derive plan → if `sandbox_enabled`, enqueue a `conform` job.
3. Dispatch to the HF pool at **bounded concurrency** (`N` sessions), with retries
   + backoff; respect TTL and egress allow-list.
4. Persist each `ConformanceReport`; update the catalog item's
   `sandbox_enabled`, `verdict`, `latency`, `last_tested_at`, and a **trust badge**.
5. Emit a sweep summary (counts by verdict, regressions vs last run) — this is the
   evidence behind "verified build, signed manifest, audited install path."

Because this is large, the sweep is **incremental**: skip servers whose
`fileSha256` + plan are unchanged since last green run (use the build cache +
report store). A full cold sweep is a batch job; daily runs only touch deltas.

### 6.3 Where reports live
`conformance_reports` table (Postgres) + a denormalized `verdict`/`badge` on the
catalog item for fast UI reads. Optionally publish a public
`agent-matrix/catalog` artifact (`reports/conformance/<id>.json`) so badges are
reproducible and auditable.

---

## 7. CLI command surface → routes (brief §3, 1:1)

The console already parses these; each gets a real route. **Local** commands
proxy to the user's runner daemon; **hosted test** commands hit the HF server.

| CLI command | Route | Path |
|---|---|---|
| `matrix search <q> [--type]` | `GET /v1/catalog/search` | control plane (ranked, §6 badges feed ranking) |
| `matrix show <id>` | `GET /v1/catalog/{id}` | control plane (manifest + verdict + report link) |
| `matrix install <id> --alias` | `POST /v1/installs` (SSE) | **local** runner proxy; streams §8 steps |
| `matrix run <alias>` | `POST /v1/runners/{alias}/run` | **local** |
| `matrix ps` | `GET /v1/runners` | local |
| `matrix logs <alias> -f` | `GET /v1/runners/{alias}/logs` (SSE) | local |
| `matrix do <alias> "q"` | `POST /v1/runners/{alias}/do` | local |
| `matrix uninstall <alias> [--purge]` | `DELETE /v1/runners/{alias}` | local |
| `matrix mcp probe --alias <a>` | `GET /v1/runners/{alias}/probe` (SSE) | local |
| **`matrix mcp test <id>`** (NEW) | `POST /v1/sandbox/sessions` (SSE) | **hosted** HF test server |
| natural language | `POST /v1/assistant` | control plane (RAG over catalog) |

`matrix mcp test` is the CLI surface for the dedicated HF server: same lifecycle
as install/run, flagged `sandbox:true`, returns an **expiring** SSE URL. This is
the console equivalent of the marketplace "Test in sandbox" button, and it is
what makes the dedicated server reachable from the operator console.

---

## 8. Install → run lifecycle event contract (brief §4, verbatim)

Both local install/run and hosted test emit the **same** streamed events; the UI
prints them progressively. Schema: `{ step, status, message, data }`.

`matrix install retell-ai --alias retell-ai`:
```text
{step:"resolve",     status:"ok", message:"retell-ai → mcp_server:retell-ai@0.1.0", data:{id,version}}
{step:"materialize", status:"start", message:"fetching artifact to ~/.matrix/runners/retell-ai/0.1.0"}
{step:"materialize", status:"ok",    message:"artifact ready", data:{sha256}}
{step:"prepare_env", status:"start", message:"creating venv (python 3.11+)"}
{step:"prepare_env", status:"ok",    message:"pip install -r requirements.txt complete"}
{step:"confirm",     status:"ok",    message:"✓ installed retell-ai (mcp_server:retell-ai@0.1.0)", data:{next:"matrix run retell-ai"}}
```

`matrix run retell-ai`:
```text
{step:"launch", status:"start", message:"starting process"}
{step:"launch", status:"ok",    message:"running", data:{
   sse_url:"http://127.0.0.1:<port>/sse",        // local; hosted → https://<space>/s/<token>/sse
   health_url:".../health",
   logs_cmd:"matrix logs retell-ai -f",
   interact_cmd:"matrix do retell-ai \"…\""}}
```

The hosted (sandbox) variant is byte-identical except `sse_url`/`health_url` are
the expiring proxied URLs and every event carries `sandbox:true`.

---

## 9. Sandbox service spec (brief §5) — upgrades over MVP

- **`sandbox_enabled`**: now **derived + persisted** (§5.3), not hand-authored.
- **Ephemeral isolated runtime**: `/tmp`-only, **egress allow-list** (npm/PyPI/the
  mcpb release host only), CPU/mem/time caps, **TTL auto-destroy** — MVP already
  does TTL + `/tmp` wipe; add the egress allow-list and cgroup caps at the Space
  level.
- **No real credentials**: enforce `requires_secrets:false` to be sandbox-eligible;
  any env must be `MATRIXHUB_PUBLIC_*` (MVP already enforces this prefix). For
  servers that *need* a token to do anything, inject **mock/scoped** tokens and
  mark the verdict `partial` (initialize/tools-list verified, calls mocked).
- **Same lifecycle, sandboxed**: `install → run → probe → do` flagged
  `sandbox:true`, returning an expiring URL.
- **Result surface**: `ConformanceReport` (§6.1) + a one-line **verdict** the user
  reads to decide install-or-not.

Endpoints (control plane): `POST /v1/sandbox/sessions` (create, returns
`session + expires_at + stream_url`), `POST /v1/sandbox/{session}/do`,
`GET /v1/sandbox/{session}/report`, `DELETE /v1/sandbox/{session}`.

---

## 10. Realtime / SSE & browser auth

- SSE for: install progress, run startup, `logs -f`, sandbox lifecycle. Event
  schema as above; keep-alive comments every 15s (MVP already does this).
- **Browser auth fix (was a TODO):** `EventSource` cannot set `Authorization`.
  The control plane issues a **short-lived signed stream URL**
  (`/v1/sandbox/sessions/{id}/events?st=<jws>`), `st` is a JWS bound to
  `{session_id, user, exp}`. The control plane verifies `st` and proxies the HF
  event stream. (Alternative: HTTP-only same-site cookie. Pick signed URL — it
  works cross-origin and for the CLI alike.)
- **`/v1/meta`** returns the real banner: `matrix_cli`, `sdk`, `python`, `hub`
  url, `status`, **plus** `sandbox: { warm: bool, capacity: N, queue_depth }` so
  the console banner reflects live HF state.

---

## 11. Security — the "secure install layer"

### 11.1 Identity & workspace scoping
Operator identity + clearance + `workspace ∈ {production, staging, sandbox}`
(the console's `whoami`). Hosted tests always run in `workspace:sandbox`. Local
installs to `production` may require an **approval gate** (audit-logged).

### 11.2 Signed plans + signed artifacts (verified before exec)
- Control plane holds a **plan-signing key**; the Space holds the **public key**.
- Worker `POST /mcp/sessions` / `/mcp/conform` reject any body whose
  `signature` does not verify against the canonicalized `plan`. The browser
  therefore can never inject a command — only a `catalog_id`, which the control
  plane resolves → derives → signs.
- Artifacts are pinned by `fileSha256` (npm/pypi resolved hash, mcpb
  `fileSha256`); the worker **re-verifies the hash** after download before exec.
- Catalog **manifests** themselves get a detached signature (sigstore/minisign)
  so "signed manifest" is real; ingestion verifies it.

### 11.3 Audit (append-only)
`AuditEvent { actor, action, target, workspace, ts, signature }` for every
search/install/run/test/uninstall/sweep. Persist to Postgres (MVP keeps it
in-memory — replace). Production installs and any approval-gated action are
non-repudiable (signed).

### 11.4 Isolation tiers (honest about HF limits)
HF Spaces are a **curated compatibility tester**, not hardened isolation. Defense
in depth on HF: command allowlist (`npx/uvx/pipx/python/python3/node`), blocked
tokens/shell patterns, no Docker-in-Docker, no package-manager installs,
`/tmp`-only, egress allow-list, TTL, per-session caps. **Graduation path** when we
need to run arbitrary/`oci`/secret-bearing servers:

```text
Tier 0  HF dedicated Space (this doc)      curated + signed + allowlisted
Tier 1  Cloud Run / Fly Machines           per-session container, predictable
Tier 2  Modal Sandboxes                     easy ephemeral arbitrary code
Tier 3  k8s + gVisor/Kata or Firecracker    production multi-tenant untrusted
```
The control-plane API is **identical** across tiers; only the worker backend
swaps (the MVP's `hf_client.py` becomes one of several `*_client.py` behind a
`SandboxBackend` interface).

---

## 12. Data models (minimum)

```text
CatalogItem    { id, name, kind, type, version, description, installs, rating,
                 updated, created, license, verified, homepage, source,
                 security_url, latency, runtime, transport,
                 sandbox_enabled, sandbox_reasons[], verdict, last_tested_at,
                 manifest_signature }
SandboxPlan    { catalog_id, version, runtime, transport, command[], env_allowlist[],
                 artifact{registryType,identifier,sha256}, network, ttl_seconds,
                 sandbox_enabled, reasons[] }            # signed
SandboxSession { id, catalog_id, version, hf_session_id, transport, workspace,
                 status, created_at, expires_at, stream_url, verdict }
ConformanceReport { id, catalog_id, version, transport, verdict, checks[],
                    tools_count, protocol_version, latency_ms{}, artifact_sha256,
                    worker, tested_at, logs_tail }
Install        { id, catalog_id, version, alias, workspace, status, steps[], created_by }
Runner         { alias, pid_or_container, url, health_url, status, started_at }
AuditEvent     { id, actor, action, target, workspace, ts, signature }
```

---

## 13. Capacity, scaling & cost

- **Pool**: `N` concurrent sessions on the dedicated Space; control-plane **queue**
  (Redis) for overflow with fair per-workspace scheduling and `Retry-After`.
- **HF wake/pause** via `huggingface_hub` (`restart_space`/`pause_space`) as a cost
  control; keep warm during the nightly sweep and business hours.
- **Pool of Spaces** (`matrixhub-mcp-testd-1..M`) when one Space's `N` is not
  enough; control plane load-balances and tracks per-Space health/capacity.
- **Build cache** (§4.4) makes the sweep cheap after the first cold run.

---

## 14. Deliverables & phased rollout

**Phase 1 — Dedicated worker (lift the cap, add transports)**
- [ ] Pool: `MAX_SESSIONS=N`, admission `429`+`Retry-After`, `/mcp/health` capacity.
- [ ] `transport.py`: `StdioBackend` (extract from MVP) + `SseBackend`
      (launch-then-proxy + remote-attach), expiring `/s/{token}/sse`.
- [ ] Build cache (content-addressed, `sha256`-verified).
- [ ] `POST /mcp/conform` + `ConformanceReport`.

**Phase 2 — Control-plane plan layer + security**
- [ ] `planner/derive.py` (manifest → `SandboxPlan`, per-registryType rules, §5).
- [ ] Plan signing + worker-side verification; artifact hash verification.
- [ ] Postgres: sessions, reports, audit (replace in-memory).
- [ ] Signed stream URLs for browser SSE; `/v1/meta` with live sandbox state.
- [ ] Workspace scoping + approval gates + persisted audit.

**Phase 3 — Catalog-wide sweep + UI**
- [ ] `sweep/runner.py` incremental sweep (cron / GH Action); badge + verdict
      written back to catalog items; sweep summary + regression report.
- [ ] `matrix mcp test <id>` CLI command + marketplace "Test in sandbox" UI
      (status panel, countdown, tools list, tool-call form, verdict).
- [ ] OpenAPI spec covering all §7/§9 routes + the SSE event schema.

**Phase 4 — Graduation hooks (optional, when arbitrary code needed)**
- [ ] `SandboxBackend` interface + Cloud Run/Modal backend behind same API.
- [ ] Egress allow-list + network policy in the stronger runtime.

---

## 15. Open decisions to confirm

1. **Pool size `N` & HF tier** — what monthly budget? (Sets `N`, warm window, and
   whether we run a Space pool.) Default proposal: one CPU-upgrade Space, `N=4`,
   warm 08:00–22:00 + during nightly sweep.
2. **Sweep cadence** — nightly incremental + weekly full cold? (Default: yes.)
3. **Mock-token policy** — for `requires_secrets` servers, do we ship per-server
   mock fixtures so they reach `partial` verdict, or hard-skip them? (Default:
   skip in Phase 1–2, add fixtures in Phase 3.)
4. **Badge publication** — keep reports in Postgres only, or also publish
   `agent-matrix/catalog/reports/conformance/*.json` for public auditability?
   (Default: publish — it backs the "verified build" marketing claim.)
5. **`oci`/Docker servers** — confirm they are out of HF scope and routed to the
   Tier-1 backend when that lands. (Default: yes, `sandbox_enabled:false` on HF.)

> Items 1–5 don't block Phase 1 (worker pool + transports + conform) — that can
> start immediately against the existing `hf/` codebase.
