FROM python:3.12-slim

# Production-friendly defaults
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# NOTE:
# With the updated orchestrator (ChatGPT-like flow), we do NOT need git anymore,
# because language detection happens via Runner in sandbox-utils.
# Keep ca-certificates for HTTPS requests to Runner/Git hosts.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Non-root user (avoid UID 1000 to reduce collisions)
RUN useradd -m -u 10001 app

WORKDIR /app

# Install deps first for better layer caching
COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

# Copy application
COPY app /app/app

USER app

# Entry (module)
CMD ["python", "-m", "app.main"]
