"""Integration tests for auth (FR-01): register / login / logout /
forgot / reset / me. Covers TEST_PLAN.md "Integration" for auth."""

from __future__ import annotations

from tests.conftest import auth_headers, make_user


def test_register_login_logout_me(client):
    user = make_user(client, tag="flow")
    headers = auth_headers(user["token"])

    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == user["email"]

    logged_out = client.post("/api/v1/auth/logout", headers=headers)
    assert logged_out.status_code == 200

    # The token is revoked: /me now fails.
    me_after = client.get("/api/v1/auth/me", headers=headers)
    assert me_after.status_code == 401
    assert me_after.json()["error"]["code"] == "UNAUTHENTICATED"


def test_login_with_wrong_password_fails(client):
    user = make_user(client, tag="wrongpw")
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": "not-the-password"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHENTICATED"


def test_login_unknown_email_fails(client):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "whatever-123"},
    )
    assert resp.status_code == 401
    # Same message whether the account or the password was wrong.
    assert "incorrect" in resp.json()["error"]["message"].lower()


def test_duplicate_registration_conflict(client):
    user = make_user(client, tag="dupe")
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": user["email"], "password": "another-pass-123", "display_name": "X"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_invalid_email_and_short_password_rejected(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "password": "long-enough-123"},
    )
    assert resp.status_code == 422
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "valid@example.com", "password": "short"},
    )
    assert resp.status_code == 422


def test_forgot_and_reset_password(client):
    user = make_user(client, tag="reset")

    # Forgot: same generic message in development, token included only in dev.
    resp = client.post(
        "/api/v1/auth/forgot-password", json={"email": user["email"]}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "message" in body
    assert body["reset_token"], "dev mode must return the reset token"

    # Unknown email: identical generic message.
    resp_unknown = client.post(
        "/api/v1/auth/forgot-password", json={"email": "ghost@example.com"}
    )
    assert resp_unknown.status_code == 200
    assert resp_unknown.json()["message"] == body["message"]
    assert resp_unknown.json().get("reset_token") is None

    # Reset with the token, then log in with the new password.
    resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": body["reset_token"], "new_password": "new-password-456"},
    )
    assert resp.status_code == 200

    login_new = client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": "new-password-456"},
    )
    assert login_new.status_code == 200

    # Old password no longer works.
    login_old = client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert login_old.status_code == 401


def test_reset_with_bad_token_fails(client):
    resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": "definitely-not-a-real-token", "new_password": "new-pass-789"},
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_me_without_token_is_401(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHENTICATED"
