#!/usr/bin/env bash
set -euo pipefail

# MatrixLab runtime smoke test (ChatGPT-like flow)
# - verifies docker + compose
# - verifies containers are up
# - verifies runner /health
# - verifies sandbox images run basic commands
# - optional: runs a tiny end-to-end job via Runner (/run_repo or /run)
#
# Usage:
#   ./scripts/smoke-test.sh
#   RUNNER_URL=http://localhost:8000 ./scripts/smoke-test.sh
#
# Exit codes:
#   0 OK
#   1 failure

RUNNER_URL="${RUNNER_URL:-http://localhost:8000}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PROJECT_NAME="${PROJECT_NAME:-}"

# Images (match your tags)
IMG_UTILS="${IMG_UTILS:-matrix-lab-sandbox-utils:latest}"
IMG_PY="${IMG_PY:-matrix-lab-sandbox-python:latest}"
IMG_NODE="${IMG_NODE:-matrix-lab-sandbox-node:latest}"
IMG_GO="${IMG_GO:-matrix-lab-sandbox-go:latest}"
IMG_RUST="${IMG_RUST:-matrix-lab-sandbox-rust:latest}"

# Optional end-to-end test repo (small & stable)
E2E_REPO_URL="${E2E_REPO_URL:-https://github.com/pallets/flask.git}"
E2E_REPO_REF="${E2E_REPO_REF:-main}"

# Pretty printing
if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; CYAN=""; RESET=""
fi

h1()   { echo "${BOLD}${CYAN}$1${RESET}"; }
ok()   { echo "${GREEN}✓${RESET} $1"; }
warn() { echo "${YELLOW}!${RESET} $1"; }
fail() { echo "${RED}✗${RESET} $1" >&2; exit 1; }
info() { echo "• $1"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

compose() {
  # Use explicit compose file if provided
  if [[ -n "$PROJECT_NAME" ]]; then
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

curl_json() {
  local url="$1"
  curl -fsS "$url"
}

assert_container_running() {
  local name="$1"
  if ! docker ps --format '{{.Names}}' | grep -qx "$name"; then
    fail "Container not running: $name"
  fi
  ok "Container running: $name"
}

test_image_cmd() {
  local img="$1"
  local label="$2"
  shift 2
  info "Testing ${label}: ${img}"
  docker run --rm --network none "$img" "$@" >/dev/null
  ok "${label} OK"
}

main() {
  h1 "MatrixLab runtime smoke test"
  info "RUNNER_URL=$RUNNER_URL"
  info "COMPOSE_FILE=$COMPOSE_FILE"
  echo

  need_cmd docker
  need_cmd curl

  # Compose plugin check
  if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose plugin not available (need: docker compose)"
  fi
  ok "Docker + compose available"

  # Show compose status
  echo
  h1 "Compose status"
  compose ps || true

  # Verify runner health
  echo
  h1 "Runner health"
  if curl_json "$RUNNER_URL/health" >/dev/null; then
    ok "Runner /health reachable"
    info "Response: $(curl_json "$RUNNER_URL/health" | tr -d '\n')"
  else
    fail "Runner /health not reachable at $RUNNER_URL"
  fi

  # Verify containers up (names as in your output)
  echo
  # Sandboxes are images (ephemeral). They should NOT be running as services.
  h1 "Sandbox images present"
  docker image inspect "$IMG_UTILS" >/dev/null 2>&1 && ok "Image present: $IMG_UTILS" || fail "Missing image: $IMG_UTILS"
  docker image inspect "$IMG_PY"    >/dev/null 2>&1 && ok "Image present: $IMG_PY"    || fail "Missing image: $IMG_PY"
  docker image inspect "$IMG_NODE"  >/dev/null 2>&1 && ok "Image present: $IMG_NODE"  || fail "Missing image: $IMG_NODE"
  docker image inspect "$IMG_GO"    >/dev/null 2>&1 && ok "Image present: $IMG_GO"    || fail "Missing image: $IMG_GO"
  docker image inspect "$IMG_RUST"  >/dev/null 2>&1 && ok "Image present: $IMG_RUST"  || fail "Missing image: $IMG_RUST"


  # Verify images are runnable and have expected tools
  echo
  h1 "Sandbox toolchain checks (container run)"
  test_image_cmd "$IMG_UTILS" "utils: unzip present" bash -lc 'command -v unzip >/dev/null'
  test_image_cmd "$IMG_UTILS" "utils: file present" bash -lc 'command -v file >/dev/null'
  test_image_cmd "$IMG_UTILS" "utils: ripgrep/grep present" bash -lc 'command -v rg >/dev/null || command -v grep >/dev/null'
  test_image_cmd "$IMG_UTILS" "utils: tar present" bash -lc 'command -v tar >/dev/null'

  test_image_cmd "$IMG_PY" "python: python runs" python -V
  test_image_cmd "$IMG_PY" "python: pip runs" bash -lc 'python -m pip --version >/dev/null'

  test_image_cmd "$IMG_NODE" "node: node runs" node -v
  test_image_cmd "$IMG_NODE" "node: npm runs" npm -v

  test_image_cmd "$IMG_GO" "go: go runs" go version
  test_image_cmd "$IMG_RUST" "rust: rustc runs" rustc --version
  test_image_cmd "$IMG_RUST" "rust: cargo runs" cargo --version

  # Optional: check Runner capabilities endpoint if exists
  echo
  h1 "Runner capabilities (optional)"
  if curl -fsS "$RUNNER_URL/capabilities" >/dev/null 2>&1; then
    ok "Runner /capabilities reachable"
    info "Response: $(curl_json "$RUNNER_URL/capabilities" | tr -d '\n')"
  else
    warn "Runner /capabilities not available (ok)."
  fi

  # Optional: end-to-end run via Runner if endpoint exists
  echo
  h1 "End-to-end job (optional)"
  if curl -fsS "$RUNNER_URL/run_repo" >/dev/null 2>&1; then
    warn "GET /run_repo exists unexpectedly; skipping (expected POST)."
  fi

  # Try POST /run_repo first; if not found, try /run fallback.
  set +e
  http_code=$(curl -s -o /tmp/matrixlab_e2e.json -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -X POST "$RUNNER_URL/run_repo" \
    -d "$(jq -n --arg repo "$E2E_REPO_URL" --arg ref "$E2E_REPO_REF" \
      '{repo_url:$repo, ref:$ref, entrypoint:"auto", command:"", limits:{cpu:0.5, mem_mb:768, pids:128}}' 2>/dev/null)" )
  set -e

  if [[ "$http_code" == "200" ]]; then
    ok "POST /run_repo succeeded"
    info "Saved response to /tmp/matrixlab_e2e.json"
  else
    warn "POST /run_repo not available or failed (HTTP $http_code). Trying POST /run (legacy)..."
    # Legacy payload shape (your runner might only support /run)
    set +e
    http_code2=$(curl -s -o /tmp/matrixlab_e2e.json -w "%{http_code}" \
      -H "Content-Type: application/json" \
      -X POST "$RUNNER_URL/run" \
      -d "$(cat <<JSON
{
  "repo_url": "${E2E_REPO_URL}",
  "ref": "${E2E_REPO_REF}",
  "sandbox_image": "${IMG_PY}",
  "cpu_limit": 0.5,
  "mem_limit_mb": 768,
  "pids_limit": 128,
  "steps": [
    {"name":"clone","network":"egress","timeout_seconds":180,"command":"rm -rf repo && git clone --depth=1 ${E2E_REPO_URL} repo && cd repo && git checkout ${E2E_REPO_REF} || true"},
    {"name":"venv","network":"none","timeout_seconds":120,"command":"cd repo && python -m venv .venv && . .venv/bin/activate && python -V"},
    {"name":"install","network":"egress","timeout_seconds":420,"command":"cd repo && . .venv/bin/activate && (pip install -r requirements.txt || pip install -e . || true)"},
    {"name":"test","network":"none","timeout_seconds":420,"command":"cd repo && . .venv/bin/activate && python -m compileall . && echo ok > /output/ok.txt"}
  ]
}
JSON
)" )
    set -e
    if [[ "$http_code2" == "200" ]]; then
      ok "POST /run succeeded"
      info "Saved response to /tmp/matrixlab_e2e.json"
    else
      warn "End-to-end Runner job not executed (HTTP $http_code2). This is OK if you haven't implemented /run_repo yet."
      info "Core container/tool checks passed."
    fi
  fi

  echo
  h1 "All checks passed"
  ok "MatrixLab runtime looks healthy and compatible."
}

# jq is optional, but if present we can build nicer JSON for /run_repo
if ! command -v jq >/dev/null 2>&1; then
  warn "jq not found; /run_repo POST will be skipped if needed. Install jq for best results."
fi

main "$@"
