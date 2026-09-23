# Proof-obligation verification

MatrixLab is the independent execution verifier for Agent-Matrix.

`POST /verify` accepts the proof obligations selected **before execution** and
runs their concrete verifier commands in a fresh MatrixLab sandbox.

The response contains:

- pass/fail verdict,
- one result per criterion/verifier,
- exit code/stdout/stderr,
- sandbox job id,
- SHA-256 digest over the verification evidence.

MatrixLab does not decide policy, rewrite the plan, or mark a criterion as passed
based on model opinion. This endpoint is deterministic: a declared verifier
command passes when it exits successfully.

Example:

```json
{
  "run_id": "run_123",
  "plan_id": "plan_123",
  "repo_url": "https://github.com/example/project",
  "ref": "candidate-branch",
  "checks": [
    {"criterion":"unit tests pass","verifier":"pytest","command":"pytest -q"},
    {"criterion":"types pass","verifier":"mypy","command":"mypy src"}
  ]
}
```
