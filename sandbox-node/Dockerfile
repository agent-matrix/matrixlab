FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 sandbox
WORKDIR /workspace
USER sandbox
