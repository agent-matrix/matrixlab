def _make_run(client):
    resp = client.post(
        "/repo/run",
        json={
            "client_id": "agent-matrix",
            "workspace_id": "ws-art",
            "repo_url": "https://example.com/acme/widget.git",
            "branch": "main",
            "profile": "python-repair",
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["run_id"]


def test_list_and_fetch_artifacts(client):
    run_id = _make_run(client)

    listing = client.get(f"/runs/{run_id}/artifacts")
    assert listing.status_code == 200
    arts = listing.json()["artifacts"]
    assert len(arts) == 1
    name = arts[0]["name"]
    assert name == "pytest-report.txt"
    assert arts[0]["url"] == f"/runs/{run_id}/artifacts/{name}"

    fetched = client.get(f"/runs/{run_id}/artifacts/{name}")
    assert fetched.status_code == 200
    assert "profile: python-repair" in fetched.text


def test_unknown_artifact_404(client):
    run_id = _make_run(client)
    resp = client.get(f"/runs/{run_id}/artifacts/nope.txt")
    assert resp.status_code == 404
