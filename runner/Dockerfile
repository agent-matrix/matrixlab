FROM python:3.12-slim

# Docker CLI so runner can spawn sibling containers
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 10001 app

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
