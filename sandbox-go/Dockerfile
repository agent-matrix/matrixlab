FROM golang:1.22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 sandbox
WORKDIR /workspace
USER sandbox

ENV GOMODCACHE=/workspace/.cache/gomod \
    GOCACHE=/workspace/.cache/gocache
