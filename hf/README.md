---
title: MatrixLab Sandbox
emoji: 🧪
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
license: apache-2.0
short_description: Sandbox for testing AI agent projects
---

# MatrixLab Sandbox

A production sandbox environment for verifying generated AI agent projects.

- Upload a project ZIP
- Automatic language/framework detection
- Install dependencies + run tests
- Syntax validation, import checks, security scans
- Structured verification reports

## API

```
POST /runs          Upload ZIP, get run_id
GET  /runs/{id}     Get run status + results
GET  /runs          List recent runs
GET  /health        Health check
```

## Local Run

```bash
docker build -t matrixlab-sandbox .
docker run -p 7860:7860 matrixlab-sandbox
```
