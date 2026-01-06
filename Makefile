SHELL := /bin/bash

VENV := .venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

# console scripts installed by pyproject.toml
MCP_CLI := $(VENV)/bin/matrixlab-mcp
INSPECT_CLI := $(VENV)/bin/matrixlab-inspect

# Optional dev UI launcher (npx inspector wrapper)
DEV_INSPECTOR := tools/inspector_ui.py

RUNNER_URL ?= http://localhost:8000

# stamp file so we don't reinstall deps every time
INSTALL_STAMP := $(VENV)/.installed

# Optional: show MCP logs clearly (stdio server logs to stderr; keep stdout clean)
MCP_LOG_LEVEL ?= INFO

# -----------------------------
# Docker image publishing config
# -----------------------------
REGISTRY ?= docker.io
DOCKERHUB_NAMESPACE ?= ruslanmv

VERSION ?= 0.1.0
PUSH_LATEST ?= 1
PLATFORMS ?=

# Image names
RUNNER_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrixlab-runner
SB_UTILS_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-utils
SB_PY_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-python
SB_NODE_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-node
SB_GO_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-go
SB_RUST_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-rust
SB_JAVA_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-java
SB_DOTNET_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-dotnet
SB_BUILD_IMAGE := $(REGISTRY)/$(DOCKERHUB_NAMESPACE)/matrix-lab-sandbox-build

# Build contexts
RUNNER_CTX := ./runner
SB_UTILS_CTX := ./sandbox-utils
SB_PY_CTX := ./sandbox-python
SB_NODE_CTX := ./sandbox-node
SB_GO_CTX := ./sandbox-go
SB_RUST_CTX := ./sandbox-rust
SB_JAVA_CTX := ./sandbox-java
SB_DOTNET_CTX := ./sandbox-dotnet
SB_BUILD_CTX := ./sandbox-build

.PHONY: help install reinstall build run stop down purge logs mcp inspect inspector clean status \
	docker-login docker-check-images build-images push-images release

help:
	@echo "Matrix Lab (Matrix sandbox flow)"
	@echo ""
	@echo "Python/MCP:"
	@echo "  make install         - create venv and install matrixlab (only if needed)"
	@echo "  make reinstall       - force reinstall dev deps"
	@echo "  make mcp             - run MCP stdio server (requires Runner running)"
	@echo "  make inspect         - run MCP inspector smoke check (JSON-RPC)"
	@echo "  make inspector       - launch native MCP Inspector UI (npx) pre-wired to matrixlab-mcp"
	@echo ""
	@echo "Runtime (local):"
	@echo "  make build           - docker compose build (Runner + sandbox images)"
	@echo "  make run             - docker compose up -d"
	@echo "  make status          - show compose status + runner health"
	@echo "  make logs            - tail compose logs"
	@echo "  make stop            - stop services"
	@echo "  make down            - remove containers"
	@echo "  make purge           - full reset: containers + volumes + images created by compose"
	@echo ""
	@echo "Publishing (Docker Hub/Registry):"
	@echo "  make build-images    - build & tag all images for publishing"
	@echo "  make push-images     - push all images (VERSION=$(VERSION), latest=$(PUSH_LATEST))"
	@echo "  make release         - build-images + push-images"
	@echo ""
	@echo "Variables:"
	@echo "  DOCKERHUB_NAMESPACE=ruslanmv      (set to your Docker Hub username/org)"
	@echo "  VERSION=0.1.0                     (tag to publish)"
	@echo "  PUSH_LATEST=1                     (also push :latest)"
	@echo "  PLATFORMS=linux/amd64,linux/arm64  (optional multi-arch push)"
	@echo "  RUNNER_URL=http://localhost:8000  (runner endpoint used by MCP server)"

# Install only when inputs change
install: $(INSTALL_STAMP)

reinstall:
	@rm -f "$(INSTALL_STAMP)"
	@$(MAKE) install

$(INSTALL_STAMP): pyproject.toml
	@test -d "$(VENV)" || python3 -m venv "$(VENV)"
	@"$(PIP)" install -U pip
	@"$(PIP)" install -e .
	@touch "$(INSTALL_STAMP)"
	@echo "✅ Installed matrixlab in $(VENV)"

# Local compose build/run
build:
	docker compose build

run: build
	docker compose up -d
	@echo "✅ Runner expected at $(RUNNER_URL)"

status:
	@docker compose ps
	@echo ""
	@echo "Runner health (best effort):"
	@curl -s "$(RUNNER_URL)/health" || true
	@echo ""

logs:
	docker compose logs -f --tail=200

stop:
	docker compose stop

down:
	docker compose down

purge:
	docker compose down -v --rmi local --remove-orphans
	@echo "✅ Purged compose containers, volumes, and local images"

# MCP server (stdio). It will print startup status to stderr (safe for MCP).
mcp: $(INSTALL_STAMP)
	@export RUNNER_URL="$(RUNNER_URL)"; \
	export MATRIXLAB_LOG_LEVEL="$(MCP_LOG_LEVEL)"; \
	if [ -x "$(MCP_CLI)" ]; then \
		"$(MCP_CLI)"; \
	else \
		echo "ERROR: $(MCP_CLI) not found. Did install succeed?" 1>&2; \
		exit 1; \
	fi

inspect: $(INSTALL_STAMP)
	@export RUNNER_URL="$(RUNNER_URL)"; \
	export MATRIXLAB_LOG_LEVEL="$(MCP_LOG_LEVEL)"; \
	if [ -x "$(INSPECT_CLI)" ]; then \
		"$(INSPECT_CLI)"; \
	else \
		echo "ERROR: $(INSPECT_CLI) not found. Did install succeed?" 1>&2; \
		exit 1; \
	fi

# Native MCP Inspector UI (npx) pre-wired to matrixlab-mcp.
# This opens the browser UI and auto-runs the server command with RUNNER_URL.
inspector: $(INSTALL_STAMP)
	@export RUNNER_URL="$(RUNNER_URL)"; \
	export MATRIXLAB_LOG_LEVEL="$(MCP_LOG_LEVEL)"; \
	if [ ! -f "$(DEV_INSPECTOR)" ]; then \
		echo "ERROR: $(DEV_INSPECTOR) not found. Create tools/inspector_ui.py first." 1>&2; \
		exit 1; \
	fi; \
	echo "🧪 Launching MCP Inspector UI (pre-wired to matrixlab-mcp)"; \
	echo "   RUNNER_URL=$(RUNNER_URL)"; \
	"$(PY)" "$(DEV_INSPECTOR)"

clean:
	rm -rf "$(VENV)"
	@echo "✅ Removed $(VENV)"

# -----------------------------
# Publishing targets
# -----------------------------
docker-login:
	@echo "🔐 Login to Docker registry (Docker Hub default)"
	docker login

docker-check-images:
	@test -d "$(RUNNER_CTX)" || (echo "Missing $(RUNNER_CTX)"; exit 1)
	@test -d "$(SB_UTILS_CTX)" || (echo "Missing $(SB_UTILS_CTX)"; exit 1)
	@test -d "$(SB_PY_CTX)" || (echo "Missing $(SB_PY_CTX)"; exit 1)
	@test -d "$(SB_NODE_CTX)" || (echo "Missing $(SB_NODE_CTX)"; exit 1)
	@test -d "$(SB_GO_CTX)" || (echo "Missing $(SB_GO_CTX)"; exit 1)
	@test -d "$(SB_RUST_CTX)" || (echo "Missing $(SB_RUST_CTX)"; exit 1)
	@test -d "$(SB_JAVA_CTX)" || (echo "Missing $(SB_JAVA_CTX)"; exit 1)
	@test -d "$(SB_DOTNET_CTX)" || (echo "Missing $(SB_DOTNET_CTX)"; exit 1)
	@test -d "$(SB_BUILD_CTX)" || (echo "Missing $(SB_BUILD_CTX)"; exit 1)
	@echo "✅ Build contexts present"

# Build & tag images for publishing
build-images: docker-check-images
	@echo "🏗️  Building images (VERSION=$(VERSION))"
	@set -e; \
	PLAT=""; \
	if [ -n "$(PLATFORMS)" ]; then PLAT="--platform=$(PLATFORMS)"; fi; \
	LOAD="--load"; \
	if [ -n "$(PLATFORMS)" ]; then LOAD=""; fi; \
	echo "Using buildx $$PLAT $$LOAD"; \
	docker buildx build $$PLAT $$LOAD -t "$(RUNNER_IMAGE):$(VERSION)" "$(RUNNER_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_UTILS_IMAGE):$(VERSION)" "$(SB_UTILS_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_PY_IMAGE):$(VERSION)" "$(SB_PY_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_NODE_IMAGE):$(VERSION)" "$(SB_NODE_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_GO_IMAGE):$(VERSION)" "$(SB_GO_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_RUST_IMAGE):$(VERSION)" "$(SB_RUST_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_JAVA_IMAGE):$(VERSION)" "$(SB_JAVA_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_DOTNET_IMAGE):$(VERSION)" "$(SB_DOTNET_CTX)"; \
	docker buildx build $$PLAT $$LOAD -t "$(SB_BUILD_IMAGE):$(VERSION)" "$(SB_BUILD_CTX)"; \
	if [ "$(PUSH_LATEST)" = "1" ]; then \
	  docker tag "$(RUNNER_IMAGE):$(VERSION)" "$(RUNNER_IMAGE):latest"; \
	  docker tag "$(SB_UTILS_IMAGE):$(VERSION)" "$(SB_UTILS_IMAGE):latest"; \
	  docker tag "$(SB_PY_IMAGE):$(VERSION)" "$(SB_PY_IMAGE):latest"; \
	  docker tag "$(SB_NODE_IMAGE):$(VERSION)" "$(SB_NODE_IMAGE):latest"; \
	  docker tag "$(SB_GO_IMAGE):$(VERSION)" "$(SB_GO_IMAGE):latest"; \
	  docker tag "$(SB_RUST_IMAGE):$(VERSION)" "$(SB_RUST_IMAGE):latest"; \
	  docker tag "$(SB_JAVA_IMAGE):$(VERSION)" "$(SB_JAVA_IMAGE):latest"; \
	  docker tag "$(SB_DOTNET_IMAGE):$(VERSION)" "$(SB_DOTNET_IMAGE):latest"; \
	  docker tag "$(SB_BUILD_IMAGE):$(VERSION)" "$(SB_BUILD_IMAGE):latest"; \
	fi
	@echo "✅ Built images"

# Push images to registry
push-images:
	@echo "🚀 Pushing images to $(REGISTRY)/$(DOCKERHUB_NAMESPACE)"
	@docker push "$(RUNNER_IMAGE):$(VERSION)"
	@docker push "$(SB_UTILS_IMAGE):$(VERSION)"
	@docker push "$(SB_PY_IMAGE):$(VERSION)"
	@docker push "$(SB_NODE_IMAGE):$(VERSION)"
	@docker push "$(SB_GO_IMAGE):$(VERSION)"
	@docker push "$(SB_RUST_IMAGE):$(VERSION)"
	@docker push "$(SB_JAVA_IMAGE):$(VERSION)"
	@docker push "$(SB_DOTNET_IMAGE):$(VERSION)"
	@docker push "$(SB_BUILD_IMAGE):$(VERSION)"
	@if [ "$(PUSH_LATEST)" = "1" ]; then \
	  docker push "$(RUNNER_IMAGE):latest"; \
	  docker push "$(SB_UTILS_IMAGE):latest"; \
	  docker push "$(SB_PY_IMAGE):latest"; \
	  docker push "$(SB_NODE_IMAGE):latest"; \
	  docker push "$(SB_GO_IMAGE):latest"; \
	  docker push "$(SB_RUST_IMAGE):latest"; \
	  docker push "$(SB_JAVA_IMAGE):latest"; \
	  docker push "$(SB_DOTNET_IMAGE):latest"; \
	  docker push "$(SB_BUILD_IMAGE):latest"; \
	fi
	@echo "✅ Pushed images"

# One command release
release: build-images push-images
	@echo "✅ Release complete: VERSION=$(VERSION), latest=$(PUSH_LATEST)"
