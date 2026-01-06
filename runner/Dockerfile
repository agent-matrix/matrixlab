FROM python:3.12-slim

# ----------------------------
# Install Docker CLI (official)
# ----------------------------
# We only need the CLI inside the Runner container, not the docker daemon.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
 && rm -rf /var/lib/apt/lists/*

# Add Docker's official apt repo and install docker-ce-cli
RUN set -eux; \
    install -m 0755 -d /etc/apt/keyrings; \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg; \
    chmod a+r /etc/apt/keyrings/docker.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends docker-ce-cli; \
    rm -rf /var/lib/apt/lists/*

# ----------------------------
# App install
# ----------------------------
WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app

# ----------------------------
# Runtime config
# ----------------------------
ENV PYTHONUNBUFFERED=1 \
    DOCKER_HOST=unix:///var/run/docker.sock \
    # default behavior; can override in compose/env
    MATRIXLAB_DOCKER_PULL=missing

EXPOSE 8000

# NOTE:
# Running as root is the most reliable choice when using /var/run/docker.sock.
# If you keep USER app, you'll often hit permission issues on the socket.
USER root

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
