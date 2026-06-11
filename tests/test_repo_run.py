def test_repo_run_python_repair(client):
    resp = client.post(
        "/repo/run",
        json={
            "client_id": "gitpilot",
            "workspace_id": "ws-123",
            "repo_url": "https://example.com/acme/widget.git",
            "branch": "main",
            "profile": "python-repair",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["run_id"].startswith("run_")
    assert body["status"] == "passed"
    assert body["exit_code"] == 0
    assert isinstance(body["stdout"], str) and body["stdout"]
    assert body["stderr"] == ""
    assert isinstance(body["duration_ms"], int)

    assert len(body["artifacts"]) == 1
    art = body["artifacts"][0]
    assert art["name"] == "pytest-report.txt"
    assert art["url"] == f"/runs/{body['run_id']}/artifacts/pytest-report.txt"

    # Stored run is retrievable.
    got = client.get(f"/runs/{body['run_id']}")
    assert got.status_code == 200
    assert got.json()["run_id"] == body["run_id"]

    logs = client.get(f"/runs/{body['run_id']}/logs")
    assert logs.status_code == 200
    assert "stdout" in logs.json() and "stderr" in logs.json()


def test_repo_run_unknown_profile(client):
    resp = client.post(
        "/repo/run",
        json={
            "client_id": "gitpilot",
            "workspace_id": "ws-123",
            "repo_url": "https://example.com/x.git",
            "branch": "main",
            "profile": "does-not-exist",
        },
    )
    assert resp.status_code == 404
