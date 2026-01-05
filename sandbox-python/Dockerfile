FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates curl build-essential \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 sandbox
WORKDIR /workspace
USER sandbox

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
