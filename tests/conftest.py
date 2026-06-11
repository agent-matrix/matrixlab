import os

import pytest

# Force offline/deterministic execution for the whole test session.
os.environ.setdefault("MATRIXLAB_DRY_RUN", "1")

from fastapi.testclient import TestClient  # noqa: E402

from matrixlab.api.app import create_app  # noqa: E402
from matrixlab.api import executor  # noqa: E402


@pytest.fixture()
def client():
    executor.reset_state()
    app = create_app()
    with TestClient(app) as c:
        yield c
