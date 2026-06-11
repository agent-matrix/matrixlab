PATCH = """diff --git a/src/app.py b/src/app.py
index 0000000..1111111 100644
--- a/src/app.py
+++ b/src/app.py
@@ -1,2 +1,2 @@
-def add(a, b):
-    return a - b
+def add(a, b):
+    return a + b
"""


def test_validate_patch_applies_and_runs(client):
    resp = client.post(
        "/repo/validate-patch",
        json={
            "client_id": "selfrepair",
            "workspace_id": "ws-9",
            "repo_url": "https://example.com/acme/widget.git",
            "branch": "main",
            "profile": "python-repair",
            "patch": PATCH,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "passed"
    assert body["exit_code"] == 0
    assert body["patched_files"] == ["src/app.py"]
    assert body["artifacts"]


def test_validate_patch_rejects_forbidden_command(client):
    resp = client.post(
        "/repo/validate-patch",
        json={
            "client_id": "selfrepair",
            "workspace_id": "ws-9",
            "repo_url": "https://example.com/acme/widget.git",
            "branch": "main",
            "profile": "python-repair",
            "commands": ["rm -rf /"],
            "patch": PATCH,
        },
    )
    # Fail-closed: forbidden command is refused.
    assert resp.status_code == 403
    assert "forbidden" in resp.json()["detail"].lower()
