"""Tests for Google sign-in (OAuth), the failed-login lockout, and
setting a password on a Google-only account."""

from __future__ import annotations

import os
import tempfile
import uuid
from dataclasses import replace
from datetime import timedelta

import pytest
from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings
from app.core.security import utcnow
from app.db import init_db
from app.main import app
from app.models import SecurityEvent
from tests.conftest import auth_headers, make_user

GOOGLE_SETTINGS = dict(
    google_client_id="test-client-id",
    google_client_secret="test-client-secret",
    google_redirect_uri="http://127.0.0.1:8000/api/v1/auth/google/callback",
)


@pytest.fixture
def google_settings(monkeypatch):
    """Make the auth routes see a Google-configured backend."""
    settings = replace(get_settings(), **GOOGLE_SETTINGS)
    monkeypatch.setattr("app.api.v1.routes.auth.get_settings", lambda: settings)
    return settings


def _start_google_login(client):
    """GET /google/login without following the redirect; return (state, response)."""
    resp = client.get("/api/v1/auth/google/login", follow_redirects=False)
    assert resp.status_code == 302, resp.text
    state = client.cookies.get("saylient_oauth_state")
    assert state, "state cookie missing"
    return state, resp


def _fake_profile(email="guser@example.com", sub=None, verified=True):
    # A fresh Google sub per call: tests share one database, and a sub
    # pins to exactly one account (see complete_google_login).
    return {
        "sub": sub or f"google-sub-{uuid.uuid4().hex[:8]}",
        "email": email,
        "email_verified": verified,
        "name": "Google User",
    }


# ---------------------------------------------------------------- providers


def test_providers_empty_when_not_configured(client):
    resp = client.get("/api/v1/auth/providers")
    assert resp.status_code == 200
    assert resp.json() == {"providers": []}


def test_providers_lists_google_when_configured(client, google_settings):
    resp = client.get("/api/v1/auth/providers")
    assert resp.status_code == 200
    assert resp.json() == {"providers": ["google"]}


# ---------------------------------------------------------------- login start


def test_google_login_redirects_when_configured(client, google_settings):
    state, resp = _start_google_login(client)
    location = resp.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert "client_id=test-client-id" in location
    assert "response_type=code" in location
    assert "scope=openid+email+profile" in location or "scope=openid%20email%20profile" in location
    assert f"state={state}" in location
    assert "redirect_uri=" in location


def test_google_login_not_configured_503(client):
    resp = client.get("/api/v1/auth/google/login", follow_redirects=False)
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "NOT_CONFIGURED"


# ---------------------------------------------------------------- callback


def test_google_callback_creates_new_user(client, google_settings, monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.routes.auth.fetch_google_profile",
        lambda code, settings: _fake_profile(),
    )
    state, _ = _start_google_login(client)
    resp = client.get(
        f"/api/v1/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code == 302, resp.text
    assert resp.headers["location"] == "http://127.0.0.1:5173/#overview"
    assert "saylient_session=" in resp.headers.get("set-cookie", "")

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["email"] == "guser@example.com"
    assert body["has_password"] is False
    assert body["google_linked"] is True
    assert "password_hash" not in body
    assert "google_sub" not in body


def test_google_callback_links_existing_user(client, google_settings, monkeypatch):
    user = make_user(client, tag="glink")
    monkeypatch.setattr(
        "app.api.v1.routes.auth.fetch_google_profile",
        lambda code, settings: _fake_profile(email=user["email"], sub="google-sub-9"),
    )
    state, _ = _start_google_login(client)
    resp = client.get(
        f"/api/v1/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "http://127.0.0.1:5173/#overview"

    me = client.get("/api/v1/auth/me")
    assert me.json()["id"] == user["user"]["id"]
    assert me.json()["has_password"] is True
    assert me.json()["google_linked"] is True


def test_fetch_google_profile_rejects_unverified(monkeypatch):
    """The real exchange path: an unverified Google email is refused."""
    import httpx

    from app.services.oauth import OAuthError, fetch_google_profile

    def _handler(request):
        if "oauth2.googleapis.com/token" in str(request.url):
            return httpx.Response(200, json={"access_token": "tok-1"})
        return httpx.Response(
            200,
            json={"sub": "s1", "email": "u@example.com", "email_verified": False},
        )

    client = httpx.Client(transport=httpx.MockTransport(_handler))
    with pytest.raises(OAuthError):
        fetch_google_profile("code-1", replace(get_settings(), **GOOGLE_SETTINGS), client)


def test_fetch_google_profile_returns_verified(monkeypatch):
    import httpx

    from app.services.oauth import fetch_google_profile

    def _handler(request):
        if "oauth2.googleapis.com/token" in str(request.url):
            return httpx.Response(200, json={"access_token": "tok-1"})
        return httpx.Response(
            200,
            json={
                "sub": "s1",
                "email": "u@example.com",
                "email_verified": True,
                "name": "U",
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(_handler))
    profile = fetch_google_profile(
        "code-1", replace(get_settings(), **GOOGLE_SETTINGS), client
    )
    assert profile["email"] == "u@example.com"


def test_google_callback_rejects_unverified_email(client, google_settings, monkeypatch):
    # The exchange itself refuses an unverified email (see the unit test
    # above); here the callback must turn that failure into a login-page
    # redirect with no session issued.
    from app.services.oauth import OAuthError

    def _fail(code, settings):
        raise OAuthError("Google did not confirm this email address.")

    monkeypatch.setattr("app.api.v1.routes.auth.fetch_google_profile", _fail)
    state, _ = _start_google_login(client)
    resp = client.get(
        f"/api/v1/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "http://127.0.0.1:5173/#login"
    # No session was issued.
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401


def test_google_callback_rejects_bad_state(client, google_settings, monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.routes.auth.fetch_google_profile",
        lambda code, settings: _fake_profile(),
    )
    _start_google_login(client)
    resp = client.get(
        "/api/v1/auth/google/callback?code=test-code&state=wrong-state",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert resp.headers["location"] == "http://127.0.0.1:5173/#login"


def test_google_callback_refuses_second_google_account(
    client, google_settings, monkeypatch
):
    """Same email, different Google sub: the link is pinned to the first."""
    user = make_user(client, tag="gpin")
    monkeypatch.setattr(
        "app.api.v1.routes.auth.fetch_google_profile",
        lambda code, settings: _fake_profile(email=user["email"], sub="google-sub-a"),
    )
    state, _ = _start_google_login(client)
    first = client.get(
        f"/api/v1/auth/google/callback?code=c1&state={state}",
        follow_redirects=False,
    )
    assert first.headers["location"] == "http://127.0.0.1:5173/#overview"
    client.cookies.clear()

    monkeypatch.setattr(
        "app.api.v1.routes.auth.fetch_google_profile",
        lambda code, settings: _fake_profile(email=user["email"], sub="google-sub-b"),
    )
    state, _ = _start_google_login(client)
    resp = client.get(
        f"/api/v1/auth/google/callback?code=c2&state={state}",
        follow_redirects=False,
    )
    assert resp.headers["location"] == "http://127.0.0.1:5173/#login"


# ---------------------------------------------------------------- lockout


def test_login_lockout_after_five_failures(client):
    user = make_user(client, tag="lockout")
    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/login",
            json={"email": user["email"], "password": "wrong-password"},
        )
        assert resp.status_code == 401
        assert "too many" not in resp.json()["error"]["message"].lower()
    # The correct password is now locked out too.
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert resp.status_code == 401
    assert "too many" in resp.json()["error"]["message"].lower()


def test_lockout_ignores_old_failures(client):
    user = make_user(client, tag="lockout-old")
    factory = app.state.session_factory
    db = factory()
    try:
        for _ in range(5):
            db.add(
                SecurityEvent(
                    user_id=user["user"]["id"],
                    event_type="login",
                    result="failure",
                    request_id=None,
                    created_at=utcnow() - timedelta(minutes=16),
                )
            )
        db.commit()
    finally:
        db.close()
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------- Google-only password


def test_google_only_user_can_set_password(client, google_settings, monkeypatch):
    monkeypatch.setattr(
        "app.api.v1.routes.auth.fetch_google_profile",
        lambda code, settings: _fake_profile(email="gset@example.com"),
    )
    state, _ = _start_google_login(client)
    resp = client.get(
        f"/api/v1/auth/google/callback?code=test-code&state={state}",
        follow_redirects=False,
    )
    assert resp.status_code == 302
    # Session cookie from the callback authenticates the PATCH.
    patched = client.patch("/api/v1/auth/me", json={"new_password": "Newpass123!"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["has_password"] is True
    # And the new password signs in with email.
    client.cookies.clear()
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "gset@example.com", "password": "Newpass123!"},
    )
    assert login.status_code == 200, login.text


def test_password_user_still_needs_current_password(client):
    user = make_user(client, tag="needcurrent")
    resp = client.patch(
        "/api/v1/auth/me",
        json={"new_password": "Newpass123!"},
        headers=auth_headers(user["token"]),
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------- migration


def test_migration_adds_google_sub_to_old_db():
    """A database created before google_sub existed gains the column."""
    tmp = tempfile.mkdtemp(prefix="saylient-mig-")
    path = os.path.join(tmp, "old.db")
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users ("
                "id VARCHAR(36) PRIMARY KEY, email VARCHAR(255) NOT NULL, "
                "password_hash VARCHAR(255), display_name VARCHAR(100) NOT NULL, "
                "status VARCHAR(20) NOT NULL, reset_token_hash VARCHAR(64), "
                "reset_token_expires_at DATETIME, created_at DATETIME NOT NULL, "
                "updated_at DATETIME NOT NULL)"
            )
        )
    init_db(engine)
    columns = {c["name"] for c in inspect(engine).get_columns("users")}
    assert "google_sub" in columns
    # Idempotent: a second run changes nothing.
    init_db(engine)
    assert "google_sub" in {c["name"] for c in inspect(engine).get_columns("users")}
