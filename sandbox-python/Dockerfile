FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

# Ensure we have a non-root "sandbox" user. Prefer UID 1000 if available.
# If UID 1000 already exists, rename that user to "sandbox" instead of failing.
RUN set -eux; \
    existing="$(getent passwd 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing" ] && [ "$existing" != "sandbox" ]; then \
      usermod -l sandbox "$existing"; \
      usermod -d /home/sandbox -m sandbox; \
    elif ! id sandbox >/dev/null 2>&1; then \
      useradd -m -u 1000 sandbox; \
    fi; \
    mkdir -p /workspace; \
    chown -R sandbox:sandbox /workspace

WORKDIR /workspace
USER sandbox

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
