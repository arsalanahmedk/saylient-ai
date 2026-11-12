# REST API Specification

Base path: `/api/v1`; HTTPS in production. Auth mechanism must be selected and configured securely.

## Auth
`POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`.

## Analyses
`POST /analyses`; `GET /analyses`; `GET /analyses/{analysis_id}`; `DELETE /analyses/{analysis_id}`.

Example request:
```json
{
  "message": "Could you also complete these extra revisions today?",
  "conversation_context": [],
  "goal": "set_boundary",
  "context": {
    "power": "unknown",
    "social_distance": "unknown",
    "imposition": "medium"
  }
}
```

## Drafts and templates
`POST /analyses/{analysis_id}/drafts`; `PATCH /drafts/{draft_id}`; `DELETE /drafts/{draft_id}`; CRUD `/templates`.

## Privacy
`GET /privacy/export`; `POST /privacy/delete-account`.

## Rules
Verify ownership on every resource. Validate schema, IDs, content type and request size. Apply pagination and rate limits. Do not expose provider keys, stack traces or raw provider errors.
