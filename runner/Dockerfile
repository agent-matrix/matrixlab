FROM python:3.12-slim

# Docker CLI so runner can spawn sibling containers
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY app /app/app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
