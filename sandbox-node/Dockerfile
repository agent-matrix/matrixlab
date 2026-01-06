FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# node base images commonly already have a UID 1000 user (often named "node").
# We want a predictable username ("sandbox") but cannot create UID 1000 twice.
# So: if UID 1000 exists, rename that user to "sandbox". Otherwise create it.
RUN set -eux; \
    existing="$(getent passwd 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing" ] && [ "$existing" != "sandbox" ]; then \
      usermod -l sandbox "$existing"; \
      usermod -d /home/sandbox -m sandbox; \
    elif ! id sandbox >/dev/null 2>&1; then \
      useradd -m -u 1000 sandbox; \
    fi

WORKDIR /workspace
USER sandbox
