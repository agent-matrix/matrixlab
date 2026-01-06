FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    coreutils \
    ca-certificates \
    git \
    curl \
    unzip \
    zip \
    tar \
    gzip \
    xz-utils \
    file \
    findutils \
    jq \
    ripgrep \
 && rm -rf /var/lib/apt/lists/*

# Create/ensure non-root "sandbox" user (UID-safe)
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

ENV HOME=/home/sandbox
