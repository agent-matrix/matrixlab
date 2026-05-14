from __future__ import annotations

import base64
import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from runner.app.main import app


def main() -> None:
    client = TestClient(app)
    capabilities = client.get("/capabilities").json()
    assert capabilities["protocol"] == "matrixlab.runner.v1"
    assert capabilities["features"]["workspace_zip"] is True
    assert capabilities["features"]["repo_clone"] is True
    assert capabilities["features"]["artifacts"] is True
    assert capabilities["features"]["code_run"] is True
    assert capabilities["features"]["chatbot_snippets"] is True
    assert "warm_pool" in capabilities["features"]
    assert "/code/run" in capabilities["endpoints"]
    assert "/chat/run" in capabilities["endpoints"]
    assert "/snippets/chatbot" in capabilities["endpoints"]
    assert "/repo/run" in capabilities["endpoints"]
    assert "/pool/status" in capabilities["endpoints"]

    pool = client.get("/pool/status").json()
    assert pool["enabled"] is False

    snippets = client.get("/snippets/chatbot").json()
    assert "POST /code/run" in snippets["api"]["endpoint"]
    assert "matrixlab-code-runner" in snippets["html"]

    invalid_packages = client.post(
        "/code/run",
        json={"language": "python", "code": "print('x')", "packages": ["requests"]},
    )
    assert invalid_packages.status_code == 400
    assert "allow_network" in invalid_packages.text

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hello.txt", "hello matrixlab")

    response = client.post(
        "/workspaces/upload",
        json={"zip_base64": base64.b64encode(buf.getvalue()).decode("ascii")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["upload_id"].startswith("ws_")
    print("native contract smoke OK")


if __name__ == "__main__":
    main()
