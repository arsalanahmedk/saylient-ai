"""Security tests (TEST_PLAN.md "Security"): IDOR/cross-user access,
authentication, oversized payloads, rate limits, error envelope shape.
"""

from __future__ import annotations

import json

from tests.conftest import auth_headers, make_user


def _setup_victim(client) -> dict:
    """User A with an analysis, a draft and a template; returns ids + token."""
    user = make_user(client, tag="victim")
    headers = auth_headers(user["token"])
    analysis = client.post(
        "/api/v1/analyses",
        json={"message": "Please pay invoice #1.", "goal": "request_payment"},
        headers=headers,
    ).json()
    draft = client.post(
        f"/api/v1/analyses/{analysis['id']}/drafts",
        json={"draft_text": "A's private draft."},
        headers=headers,
    ).json()
    template = client.post(
        "/api/v1/templates",
        json={"title": "A template", "category": "Work", "body": "A's body."},
        headers=headers,
    ).json()
    return {
        "user": user,
        "headers": headers,
        "analysis_id": analysis["id"],
        "draft_id": draft["id"],
        "template_id": template["id"],
    }


def test_cross_user_idor_returns_404(client):
    victim = _setup_victim(client)
    attacker = make_user(client, tag="attacker")
    headers = auth_headers(attacker["token"])

    # Reading another user's analysis looks exactly like "not found".
    resp = client.get(f"/api/v1/analyses/{victim['analysis_id']}", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"

    # Deleting another user's analysis: same.
    resp = client.delete(f"/api/v1/analyses/{victim['analysis_id']}", headers=headers)
    assert resp.status_code == 404

    # Another user's draft: patch and delete both 404.
    resp = client.patch(
        f"/api/v1/drafts/{victim['draft_id']}",
        json={"draft_text": "attacker rewrite"},
        headers=headers,
    )
    assert resp.status_code == 404
    resp = client.delete(f"/api/v1/drafts/{victim['draft_id']}", headers=headers)
    assert resp.status_code == 404

    # Another user's template: read 404.
    resp = client.get(f"/api/v1/templates/{victim['template_id']}", headers=headers)
    assert resp.status_code == 404

    # And the victim's data is untouched.
    victim_headers = victim["headers"]
    assert (
        client.get(f"/api/v1/analyses/{victim['analysis_id']}", headers=victim_headers).status_code
        == 200
    )


def test_protected_endpoints_require_token(client):
    for method, path in [
        ("get", "/api/v1/analyses"),
        ("get", "/api/v1/analyses/some-id"),
        ("get", "/api/v1/templates"),
        ("get", "/api/v1/privacy/export"),
        ("post", "/api/v1/analyses"),
        ("post", "/api/v1/templates"),
    ]:
        if method == "post":
            resp = getattr(client, method)(path, json={})
        else:
            resp = getattr(client, method)(path)
        assert resp.status_code == 401, f"{method} {path} -> {resp.status_code}"
        assert resp.json()["error"]["code"] == "UNAUTHENTICATED"


def test_invalid_token_is_401(client):
    resp = client.get(
        "/api/v1/analyses", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHENTICATED"


def test_oversized_payload_returns_413(client):
    user = make_user(client, tag="big")
    headers = auth_headers(user["token"])
    oversized = {
        "message": "x" * 1_100_000,  # over the 1 MB body cap
        "goal": "set_boundary",
    }
    resp = client.post(
        "/api/v1/analyses",
        content=json.dumps(oversized),
        headers={**headers, "Content-Type": "application/json"},
    )
    assert resp.status_code == 413
    assert resp.json()["error"]["code"] == "TOO_LARGE"


def test_analysis_rate_limit_returns_429(client):
    user = make_user(client, tag="limited")
    headers = auth_headers(user["token"])
    statuses = []
    for _ in range(31):
        resp = client.post(
            "/api/v1/analyses",
            json={"message": "Please pay invoice #7.", "goal": "request_payment"},
            headers=headers,
        )
        statuses.append(resp.status_code)
    # 30 per minute per user; the 31st must be rate limited.
    assert statuses[:30] == [201] * 30, statuses
    assert statuses[30] == 429
    last = client.post(
        "/api/v1/analyses",
        json={"message": "Please pay invoice #7.", "goal": "request_payment"},
        headers=headers,
    )
    assert last.status_code == 429
    assert last.json()["error"]["code"] == "RATE_LIMITED"


def test_error_envelope_shape_and_request_id(client):
    resp = client.get("/api/v1/analyses/does-not-exist", headers=auth_headers("bad"))
    # Unauthenticated (no valid token) still uses the envelope.
    assert resp.status_code == 401
    body = resp.json()
    assert set(body.keys()) == {"error"}
    assert set(body["error"].keys()) == {"code", "message", "request_id", "details"}
    assert body["error"]["request_id"]
    assert "X-Request-Id" in resp.headers
    assert resp.headers["X-Request-Id"] == body["error"]["request_id"]

    user = make_user(client, tag="envelope")
    headers = auth_headers(user["token"])
    resp = client.get("/api/v1/analyses/does-not-exist", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"
    assert resp.json()["error"]["request_id"] == resp.headers["X-Request-Id"]


def test_health_endpoint(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_unknown_route_is_envelope_404(client):
    resp = client.get("/api/v1/nope")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"
