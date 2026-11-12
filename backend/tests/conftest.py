"""Test fixtures: one temp SQLite file per test session, one app.

Environment is set at module import (conftest loads before any test
module, so app.main is created with the test database). Rate limiters
are reset before every test so per-IP/per-user counters cannot leak
between tests.
"""

from __future__ import annotations

import os
import tempfile
import uuid

# --- test environment: must run BEFORE app.main is imported anywhere ---
_TMP_DIR = tempfile.mkdtemp(prefix="saylient-test-")
_DB_PATH = os.path.join(_TMP_DIR, "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_PATH}"
os.environ["APP_ENV"] = "development"
os.environ["APP_SECRET_KEY"] = "test-secret-key-for-tests-only"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.rate_limit import reset_all_limiters  # noqa: E402
from app.main import app  # noqa: E402

get_settings.cache_clear()
get_settings()  # validate test settings eagerly


@pytest.fixture(scope="session")
def client() -> TestClient:
    """One shared client for the whole session (one temp DB file)."""
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    reset_all_limiters()
    yield
    reset_all_limiters()


def make_user(client: TestClient, tag: str | None = None) -> dict:
    """Register a fresh user and return {"token", "user", "email", "password"}.

    Tests share one database, so every user gets a unique email.
    """
    tag = tag or uuid.uuid4().hex[:8]
    email = f"user-{tag}-{uuid.uuid4().hex[:6]}@example.com"
    password = "correct-horse-battery"
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": f"Test {tag}"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return {"token": body["token"], "user": body["user"], "email": email, "password": password}


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
