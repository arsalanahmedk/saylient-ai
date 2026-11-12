"""Email provider tests (password reset delivery).

SMTP is stdlib-only; no real server is used here. The provider returns
None when unconfigured, and forgot-password must answer honestly in
production when no provider exists.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.services.email import build_reset_email, get_email_provider
from tests.conftest import make_user


def test_email_provider_none_when_unconfigured():
    settings = Settings(app_env="development", app_secret_key="x")
    assert get_email_provider(settings) is None


def test_email_provider_present_when_configured():
    settings = Settings(
        app_env="development",
        app_secret_key="x",
        smtp_host="smtp.example.com",
        smtp_username="user",
        smtp_password="secret",
    )
    provider = get_email_provider(settings)
    assert provider is not None
    assert provider.host == "smtp.example.com"


def test_build_reset_email_link_uses_app_origin():
    subject, body = build_reset_email(
        app_origin="https://saylient-ai.vercel.app", token="tok-123"
    )
    assert "Reset your Saylient AI password" in subject
    assert "https://saylient-ai.vercel.app/#reset-password?token=tok-123" in body
    assert "tok-123" in body


def test_forgot_password_honest_when_no_smtp_in_production(monkeypatch):
    """With APP_ENV=production and no SMTP, the response must NOT claim a
    link was sent — it must say reset by email is not set up."""
    import app.api.v1.routes.auth as auth_routes

    production = Settings(
        app_env="production",
        app_secret_key="production-secret-for-tests",
        database_url="sqlite:///./saylient.db",
        allowed_origins=("http://localhost:5173", "http://127.0.0.1:5173"),
        smtp_host="",
    )
    monkeypatch.setattr(auth_routes, "get_settings", lambda: production)

    fresh = TestClient(app)
    user = make_user(fresh, tag="nosmtp")
    resp = fresh.post(
        "/api/v1/auth/forgot-password", json={"email": user["email"]}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("reset_token") is None
    assert "not set up" in body["message"]
    assert "has been sent" not in body["message"]
