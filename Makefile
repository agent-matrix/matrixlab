SHELL := /bin/bash

VENV := .venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

RUNNER_URL ?= http://localhost:8000

.PHONY: help install run down logs mcp inspect clean

help:
	@echo "Matrix Lab"
	@echo "  make install   - create venv and install local dev deps (MCP server + inspector)"
	@echo "  make run       - docker compose up --build (Runner + sandbox images)"
	@echo "  make down      - docker compose down"
	@echo "  make logs      - docker compose logs -f --tail=200"
	@echo "  make mcp       - run MCP stdio server (requires Runner running)"
	@echo "  make inspect   - run MCP inspector against the stdio server"
	@echo "  make clean     - remove local venv"

install:
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) install -U pip
	@$(PIP) install -r mcp/requirements.txt
	@echo "✅ Installed dev deps in $(VENV)"

run:
	docker compose up -d --build
	@echo "✅ Runner on $(RUNNER_URL)"

down:
	docker compose down

logs:
	docker compose logs -f --tail=200

mcp: install
	@export RUNNER_URL=$(RUNNER_URL); \
	$(PY) mcp/mcp_server.py

inspect: install
	@export RUNNER_URL=$(RUNNER_URL); \
	$(PY) mcp/mcp_inspector.py

clean:
	rm -rf $(VENV)
	@echo "✅ Removed $(VENV)"
