# AI Engineer guide: integrating MatrixLab Sandbox

MatrixLab Sandbox gives AI engineers a production-oriented execution layer for running untrusted or generated code behind websites, learning products, automated testing workflows, and code-generation agents. Use it as a remote code interpreter: the product sends source code plus policy metadata to the Runner, and the Runner executes it in an isolated, short-lived Docker sandbox with explicit resource and network controls.

## Recommended integration pattern

```text
Website / LMS / agent UI
        |
        | HTTPS + bearer token
        v
Backend gateway owned by your product
        |
        | POST /code/run for code cells
        | POST /run for packaged workspaces
        | POST /repo/run for repository checks
        v
MatrixLab Runner
        |
        v
Ephemeral sandbox container + artifacts
```

Best practice is to call MatrixLab from your own backend, not directly from the browser. The backend should authenticate users, enforce quotas, redact secrets, choose resource limits, and attach trace metadata before forwarding requests to MatrixLab.

## Choose the right API

| Use case | Endpoint | When to use it |
| --- | --- | --- |
| Website code blocks, chatbot code interpreter, learning exercises | `POST /code/run` | Single Python, Node/JavaScript, or Bash snippets with optional stdin and packages. |
| AI code generation against a generated project | `POST /run` | Package a workspace ZIP and run commands such as `pytest`, `npm test`, `ruff`, or build checks. |
| Repository validation and maintenance | `POST /repo/run` | Clone a Git repository/ref and run an isolated verification command. |
| Copy/paste UI examples | `GET /snippets/chatbot` | Retrieve browser and Markdown snippets for prototypes and internal demos. |
| Run evidence | `GET /runs/{sandbox_id}/artifacts` | Download output files, reports, and generated assets from `/output`. |

## Website and chatbot integration

1. Put a **Run** button next to code blocks in your web product.
2. Send code to your backend with the authenticated user/session id.
3. The backend calls `POST /code/run` with conservative defaults.
4. Render `stdout`, `stderr`, `exit_code`, `duration_ms`, and artifact links in the UI.

Example backend request:

```bash
curl -sS "$MATRIXLAB_RUNNER_URL/code/run" \
  -H "Authorization: Bearer $MATRIXLAB_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d @- <<'JSON'
{
  "language": "python",
  "code": "print('Hello from a MatrixLab learning cell')",
  "timeout": 30,
  "allow_network": false,
  "cpu_limit": 1.0,
  "mem_limit_mb": 1024,
  "pids_limit": 128,
  "metadata": {
    "product": "learning-portal",
    "feature": "code-cell",
    "trace_id": "replace-with-request-id"
  }
}
JSON
```

For browser prototypes only, `GET /snippets/chatbot` returns a copy/paste HTML widget. In production, avoid embedding Runner tokens in client-side code; proxy through your backend gateway instead.

## Learning and assessment workflows

For tutorials, notebooks, and quizzes:

- Keep `allow_network` disabled for deterministic exercises.
- Set short per-run timeouts such as 10-60 seconds.
- Predefine accepted languages and images per course.
- Store rubric/test code server-side and combine it with learner submissions in a temporary workspace.
- Write grading reports to `/output` so they become MatrixLab artifacts.
- Return clear feedback from `stdout`/`stderr`, but hide internal test secrets from learners.

For multi-file projects, package the learner workspace and hidden tests, then use `POST /run`:

```json
{
  "cmd": "python -m pytest -q tests",
  "cwd": ".",
  "workspace": { "type": "zip", "zip_base64": "..." },
  "image": "python",
  "allow_network": false,
  "timeout": 120,
  "metadata": { "product": "learning-portal", "assignment_id": "arrays-101" }
}
```

## AI code-generation and testing loops

For code-generation agents, use MatrixLab as the verification gate before showing or merging generated code:

1. Generate or edit code in a temporary workspace.
2. Exclude secrets, `.git`, dependency caches, `node_modules`, and virtualenvs before upload.
3. Run the fastest relevant checks first (`python -m compileall`, `pytest -q`, `npm test`, `npm run build`, `ruff check`, etc.).
4. Feed concise failure output back to the model for repair.
5. Persist artifacts such as coverage, screenshots, logs, or generated files from `/output`.
6. Stop after a bounded number of repair attempts to control cost and risk.

Suggested command policy:

| Stack | First check | Follow-up checks |
| --- | --- | --- |
| Python | `python -m compileall .` | `pytest -q`, `ruff check .`, `mypy` or `pyright` if configured |
| Node/web | `npm test -- --runInBand` or project equivalent | `npm run build`, `npm run lint` |
| Docs/static sites | site generator build | link checker, screenshot diff, accessibility audit |
| Data examples | smoke script with small fixtures | notebook execution, artifact validation |

## Security and operations standards

Use these controls before exposing sandbox execution to real users or autonomous agents:

- **Authenticate every mutating endpoint** with `MATRIXLAB_BEARER_TOKEN` and keep the token server-side.
- **Disable network by default**; enable `allow_network` only for approved dependency installation or scraping tasks.
- **Bound resources** with timeout, CPU, memory, and PID limits on every request.
- **Treat code and output as untrusted**; sanitize HTML rendering and never execute returned artifacts in the host page.
- **Never forward raw user secrets** to sandbox code. Use short-lived, scoped credentials only when a task explicitly needs them.
- **Log trace metadata** such as user id hash, feature, assignment, model, and request id for auditability without storing sensitive prompts unnecessarily.
- **Apply quotas and rate limits** per user, team, model, and endpoint.
- **Pin dependencies where possible** and prefer prebuilt images for common courses or products instead of installing packages on every run.
- **Separate environments** for development, staging, and production runners.
- **Monitor** run counts, failures, duration, timeout rate, image pull failures, warm-pool health, and artifact storage growth.

## Reference response handling

A successful `POST /code/run` response includes:

```json
{
  "sandbox_id": "...",
  "language": "python",
  "exit_code": 0,
  "stdout": "...",
  "stderr": "...",
  "duration_ms": 1234,
  "timed_out": false,
  "truncated": false,
  "console": ["Run started", "Running code"],
  "artifacts": []
}
```

Product UIs should always display `exit_code`, handle non-zero exits as normal user feedback, and show a friendly timeout message when `timed_out` is true. Use `sandbox_id` for support tickets, trace lookup, event streaming, and artifact retrieval.
