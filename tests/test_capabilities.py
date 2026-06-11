def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "matrixlab"
    assert "version" in body
    assert "python-repair" in body["profiles"]


def test_capabilities_lists_profiles(client):
    resp = client.get("/capabilities")
    assert resp.status_code == 200
    body = resp.json()
    assert "python-repair" in body["profiles"]
    for expected in ("node-repair", "docs-repair", "ci-repair"):
        assert expected in body["profiles"]
    assert body["features"]["artifacts"] is True
    assert body["features"]["logs"] is True
    assert body["features"]["network"] == "restricted"
    assert isinstance(body["max_memory_mb"], int)
    assert "languages" in body
