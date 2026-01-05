FROM rust:1.79-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates curl pkg-config \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 sandbox
WORKDIR /workspace
USER sandbox

ENV CARGO_HOME=/workspace/.cargo \
    RUSTUP_HOME=/workspace/.rustup
