"""Integration tests for analyses, drafts, templates and privacy
(FR-02..FR-12): create/read/list/delete, draft lifecycle, template CRUD,
cascade deletion on analysis delete, data export, account deletion."""

from __future__ import annotations

from tests.conftest import auth_headers, make_user

PAYMENT_MESSAGE = (
    "Hi, I wanted to check in on invoice #1048 — it has been overdue for "
    "two weeks. Could you let me know when the payment will be sent?"
)


def _create_analysis(client, headers, message=PAYMENT_MESSAGE, goal="request_payment"):
    resp = client.post(
        "/api/v1/analyses",
        json={
            "message": message,
            "goal": goal,
            "context": {
                "power": "unknown",
                "social_distance": "medium",
                "imposition": "high",
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_create_and_read_analysis(client):
    user = make_user(client, tag="analysis")
    headers = auth_headers(user["token"])

    body = _create_analysis(client, headers)
    assert body["goal"] == "request_payment"
    assert body["intent"]["label"] == "request_payment"
    assert body["strategy"]["label"] == "negative_politeness"
    assert "invoice #1048" in body["draft"]
    assert body["model_version"] == "prototype-0.1"
    assert body["limitations"]
    assert body["context_factors"]["imposition"] == "high"

    read = client.get(f"/api/v1/analyses/{body['id']}", headers=headers)
    assert read.status_code == 200
    assert read.json()["id"] == body["id"]
    assert read.json()["message"] == PAYMENT_MESSAGE


def test_list_analyses_pagination(client):
    user = make_user(client, tag="list")
    headers = auth_headers(user["token"])
    for i in range(3):
        _create_analysis(client, headers, message=f"Please pay invoice #{100 + i}.", goal="request_payment")

    page1 = client.get("/api/v1/analyses?limit=2&offset=0", headers=headers).json()
    assert page1["total"] == 3
    assert len(page1["items"]) == 2
    assert page1["limit"] == 2 and page1["offset"] == 0
    page2 = client.get("/api/v1/analyses?limit=2&offset=2", headers=headers).json()
    assert len(page2["items"]) == 1


def test_create_analysis_with_context_list(client):
    user = make_user(client, tag="ctx")
    headers = auth_headers(user["token"])
    resp = client.post(
        "/api/v1/analyses",
        json={
            "message": "Could you clarify the details on the homepage?",
            "conversation_context": [
                "Client: Please revise the homepage.",
                {"role": "freelancer", "text": "Sure, which section?"},
            ],
            "goal": "clarify_requirements",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert len(body["conversation_context"]) == 2
    assert body["conversation_context"][0]["role"] == "prior"
    assert body["conversation_context"][1]["text"] == "Sure, which section?"


def test_draft_lifecycle(client):
    user = make_user(client, tag="draft")
    headers = auth_headers(user["token"])
    analysis = _create_analysis(client, headers)

    created = client.post(
        f"/api/v1/analyses/{analysis['id']}/drafts",
        json={"draft_text": "First draft.", "tone_setting": "Diplomatic"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    draft = created.json()
    assert draft["analysis_id"] == analysis["id"]

    patched = client.patch(
        f"/api/v1/drafts/{draft['id']}",
        json={"draft_text": "Revised draft.", "tone_setting": "Friendly"},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["draft_text"] == "Revised draft."
    assert patched.json()["tone_setting"] == "Friendly"

    deleted = client.delete(f"/api/v1/drafts/{draft['id']}", headers=headers)
    assert deleted.status_code == 200
    again = client.patch(
        f"/api/v1/drafts/{draft['id']}", json={"draft_text": "x"}, headers=headers
    )
    assert again.status_code == 404


def test_list_drafts_for_analysis(client):
    user = make_user(client, tag="listdrafts")
    headers = auth_headers(user["token"])
    other = make_user(client, tag="listdrafts-b")
    other_headers = auth_headers(other["token"])
    analysis = _create_analysis(client, headers)

    empty = client.get(f"/api/v1/analyses/{analysis['id']}/drafts", headers=headers)
    assert empty.status_code == 200
    assert empty.json()["items"] == []

    first = client.post(
        f"/api/v1/analyses/{analysis['id']}/drafts",
        json={"draft_text": "First saved draft.", "tone_setting": "Diplomatic"},
        headers=headers,
    ).json()
    second = client.post(
        f"/api/v1/analyses/{analysis['id']}/drafts",
        json={"draft_text": "Second saved draft.", "tone_setting": "Friendly"},
        headers=headers,
    ).json()

    listed = client.get(f"/api/v1/analyses/{analysis['id']}/drafts", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 2
    assert {item["id"] for item in listed.json()["items"]} == {first["id"], second["id"]}

    # Another user sees nothing — not even existence.
    assert (
        client.get(f"/api/v1/analyses/{analysis['id']}/drafts", headers=other_headers).status_code
        == 404
    )


def test_delete_analysis_cascades_drafts(client):
    user = make_user(client, tag="cascade")
    headers = auth_headers(user["token"])
    analysis = _create_analysis(client, headers)
    draft = client.post(
        f"/api/v1/analyses/{analysis['id']}/drafts",
        json={"draft_text": "Keep me?"},
        headers=headers,
    ).json()

    deleted = client.delete(f"/api/v1/analyses/{analysis['id']}", headers=headers)
    assert deleted.status_code == 200

    assert client.get(f"/api/v1/analyses/{analysis['id']}", headers=headers).status_code == 404
    # The draft went with the analysis.
    assert (
        client.patch(f"/api/v1/drafts/{draft['id']}", json={"draft_text": "x"}, headers=headers).status_code
        == 404
    )


def test_templates_crud(client):
    user = make_user(client, tag="template")
    headers = auth_headers(user["token"])

    created = client.post(
        "/api/v1/templates",
        json={"title": "Payment reminder", "category": "Payment", "body": "Hi, following up on the invoice."},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    template = created.json()

    # Duplicate title for the same user -> 409.
    dupe = client.post(
        "/api/v1/templates",
        json={"title": "Payment reminder", "category": "Payment", "body": "Other body."},
        headers=headers,
    )
    assert dupe.status_code == 409

    read = client.get(f"/api/v1/templates/{template['id']}", headers=headers)
    assert read.status_code == 200
    assert read.json()["title"] == "Payment reminder"

    listed = client.get("/api/v1/templates", headers=headers).json()
    assert listed["total"] == 1

    patched = client.patch(
        f"/api/v1/templates/{template['id']}",
        json={"body": "Hi, gentle reminder about the invoice."},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["body"] == "Hi, gentle reminder about the invoice."

    deleted = client.delete(f"/api/v1/templates/{template['id']}", headers=headers)
    assert deleted.status_code == 200
    assert client.get(f"/api/v1/templates/{template['id']}", headers=headers).status_code == 404


def test_privacy_export(client):
    user = make_user(client, tag="export")
    headers = auth_headers(user["token"])
    _create_analysis(client, headers)
    client.post(
        "/api/v1/templates",
        json={"title": "Scope", "category": "Work", "body": "Scope template."},
        headers=headers,
    )

    resp = client.get("/api/v1/privacy/export", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["email"] == user["email"]
    assert len(body["analyses"]) == 1
    assert len(body["templates"]) == 1
    assert "password_hash" not in resp.text


def test_delete_account(client):
    user = make_user(client, tag="delacct")
    headers = auth_headers(user["token"])
    analysis = _create_analysis(client, headers)

    # Wrong password: nothing happens.
    wrong = client.post(
        "/api/v1/privacy/delete-account",
        json={"password": "wrong-password"},
        headers=headers,
    )
    assert wrong.status_code == 401

    deleted = client.post(
        "/api/v1/privacy/delete-account",
        json={"password": user["password"]},
        headers=headers,
    )
    assert deleted.status_code == 200

    # The account and its data are gone.
    login = client.post(
        "/api/v1/auth/login",
        json={"email": user["email"], "password": user["password"]},
    )
    assert login.status_code == 401
    assert client.get(f"/api/v1/analyses/{analysis['id']}", headers=headers).status_code == 401
