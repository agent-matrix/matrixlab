FROM rust:1.79-bookworm

# Install basic dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    curl \
    pkg-config \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

# 1. Environment Setup
# We move CARGO_HOME to the workspace (for cache/persistence).
# We DO NOT move RUSTUP_HOME; we leave it at /usr/local/rustup to avoid breaking the pre-installed binaries.
ENV CARGO_HOME=/workspace/.cargo \
    PATH=/workspace/.cargo/bin:/usr/local/cargo/bin:/usr/local/rustup/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# 2. User & Permissions Setup
# We create the user and grant them ownership of the toolchain locations.
# This allows 'sandbox' to install new targets (wasm, etc.) or update rustup if needed.
RUN set -eux; \
    # Create sandbox user (trying to match UID 1000)
    existing="$(getent passwd 1000 | cut -d: -f1 || true)"; \
    if [ -n "$existing" ] && [ "$existing" != "sandbox" ]; then \
      usermod -l sandbox "$existing"; \
      usermod -d /home/sandbox -m sandbox; \
    elif ! id sandbox >/dev/null 2>&1; then \
      useradd -m -u 1000 sandbox; \
    fi; \
    # Create workspace directories
    mkdir -p /workspace/.cargo; \
    # Grant permissions:
    # 1. /workspace: for the user's code and cargo cache
    # 2. /usr/local/rustup: so user can run 'rustup target add' etc.
    # 3. /usr/local/cargo: for shared registry access
    chown -R sandbox:sandbox /workspace /usr/local/rustup /usr/local/cargo; \
    # Ensure binaries are executable by everyone
    chmod -R a+rx /usr/local/rustup /usr/local/cargo

WORKDIR /workspace
USER sandbox

# Verify installation works as the sandbox user
RUN rustc --version && cargo --version