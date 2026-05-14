# MatrixLab Admin Frontend

React/Vite admin console for monitoring and testing MatrixLab sandboxes.

## Features

- Runner health and `matrixlab.runner.v1` capability monitoring.
- Warm-pool status cards backed by `GET /pool/status`.
- Sandbox image health summaries backed by `GET /sandboxes/health`.
- One-click Python hello-world run through native `POST /run`.
- Terminal-style log panel for system and sandbox execution output.
- Settings modal for Runner URL, bearer token, polling interval, image, and network toggle.

## Local development

```bash
make install      # installs Python package and frontend dependencies
make run          # starts backend and frontend
```

Run only the UI during frontend development:

```bash
make run-frontend
# or run in the foreground
make frontend-dev
```

By default the UI calls `http://localhost:8000`. Override it with:

```bash
VITE_MATRIXLAB_API_URL=http://localhost:8000 npm --prefix frontend run dev
```

The Runner enables CORS for `http://localhost:5173` and `http://127.0.0.1:5173` by default. Override with `MATRIXLAB_CORS_ORIGINS` if needed.
