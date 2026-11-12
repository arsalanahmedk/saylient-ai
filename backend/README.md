# Saylient AI — Backend

FastAPI backend for Saylient AI (formerly PoliteAI), the AI-based
freelancer communication assistant. Implements Phases 3 + 4 of the project
roadmap: REST API, database, rule-based analysis baseline, auth, drafts,
templates, privacy export/deletion, rate limits and error handling.

Docs this backend follows (all under
`freelancer_communication_assistant_docs/`):
- `01-product/SRS.md` — functional requirements FR-01..FR-12
- `04-data/DATABASE_DESIGN.md`, `04-data/DATA_DICTIONARY.md` — tables
- `05-ai-ml/AI_ML_ARCHITECTURE.md` — output contract + guardrails
- `05-ai-ml/DATASET_PLAN.md`, `05-ai-ml/MODEL_EVALUATION.md` — golden set
- `06-api/API_SPEC.md`, `06-api/ERROR_CONVENTIONS.md` — endpoints + envelope
- `07-engineering/BACKEND_GUIDE.md`, `07-engineering/DEPLOYMENT.md` — stack + env
- `07-engineering/TEST_PLAN.md` — test coverage

## Quick start

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # then edit values; .env is never committed
uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/health — `{"status": "ok"}`.
API docs (development only): http://127.0.0.1:8000/docs.

Default database is SQLite (`sqlite:///./saylient.db`, created on first
start). Set `DATABASE_URL` to a `postgresql://...` URL for staging or
production.

## Environment variables

| Name | Default | Notes |
|---|---|---|
| `APP_ENV` | `development` | `development`, `staging`, `production` |
| `APP_SECRET_KEY` | — | **Required unless `APP_ENV=development`.** In development only, an insecure placeholder is used so a local run is one command. Production refuses to start without a real secret (or with the placeholder). |
| `DATABASE_URL` | `sqlite:///./saylient.db` | SQLite file or PostgreSQL URL |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `SESSION_COOKIE_SECURE` | `false` | Set `true` in production (HTTPS) |
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax` / `strict` / `none` |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | empty | Reserved for a future LLM provider adapter; the current engine makes **no** external calls |

## Endpoints (base `/api/v1`, JSON only)

**Auth** — `POST /auth/register` (201, returns token), `POST /auth/login`,
`POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`,
`GET /auth/me`. Sessions are opaque bearer tokens (`Authorization: Bearer
<token>`); only the SHA-256 hash is stored. Tokens expire after 7 days;
logout revokes the token; a password reset revokes all sessions.

**Forgot-password note:** the response body is always the same generic
message. The reset token is returned in the response **only when
`APP_ENV=development`**, so the flow is testable without email. Production
must deliver the token by email and never put it in a response.

**Analyses** — `POST /analyses` (201), `GET /analyses?limit&offset`
(paginated), `GET /analyses/{id}`, `DELETE /analyses/{id}` (also deletes
the analysis's drafts). Request: `message` (1-2000 chars),
`conversation_context` (optional list of strings or `{role, text}`),
`goal` (one of the 7 intents), `context` (`power` / `social_distance` /
`imposition`, each `unknown` / `low` / `medium` / `high`).

**Drafts** — `POST /analyses/{id}/drafts` (201), `PATCH /drafts/{id}`,
`DELETE /drafts/{id}`.

**Templates** — `POST /templates` (201), `GET /templates` (paginated),
`GET /templates/{id}`, `PATCH /templates/{id}`, `DELETE /templates/{id}`.

**Privacy** — `GET /privacy/export` (profile, analyses, drafts, templates,
consent records), `POST /privacy/delete-account` (requires the password;
deletes the account and all its data).

### Errors

Every failure uses one envelope (06-api/ERROR_CONVENTIONS.md):

```json
{"error": {"code": "VALIDATION_ERROR", "message": "...", "request_id": "...", "details": []}}
```

Codes: `VALIDATION_ERROR` (422), `UNAUTHENTICATED` (401), `FORBIDDEN`
(403), `NOT_FOUND` (404), `CONFLICT` (409), `TOO_LARGE` (413),
`RATE_LIMITED` (429), `INTERNAL` (500). Every response also carries an
`X-Request-Id` header. Errors never contain stack traces, SQL, secrets,
or raw message text.

### Limits and ownership

- JSON body cap 1 MB (413 above it).
- Rate limits: 60/min per IP on auth routes; 30/min per user on
  `POST /analyses` (429 above).
- Every resource endpoint verifies ownership. A resource that does not
  exist or belongs to another user is reported as **404**, never 403, so
  callers cannot probe for other users' data.

## The analysis engine (`app/services/analysis_engine.py`)

Rule-based baseline, `model_version: "prototype-0.1"`. Output is exactly
the contract from 05-ai-ml/AI_ML_ARCHITECTURE.md:

```json
{
  "intent": {"label": "set_boundary", "confidence": 0.78},
  "tone": {"label": "frustrated", "confidence": 0.62},
  "fta": {"detected": true, "description": "Possible request or pressure ..."},
  "face_concern": ["negative_face"],
  "context_factors": {"power": "unknown", "social_distance": "unknown", "imposition": "medium"},
  "strategy": {"label": "negative_politeness", "rationale": "..."},
  "draft": "Hi,\n\n...",
  "limitations": ["This is a rule-based prototype analysis, not a human judgement."],
  "model_version": "prototype-0.1"
}
```

- **Intent** — keyword scoring over the 7 intents (`set_boundary`,
  `request_payment`, `negotiate_deadline`, `clarify_requirements`,
  `respond_to_criticism`, `negotiate_budget`, `resolve_disagreement`);
  `"unknown"` when nothing matches. The user's stated `goal` is used
  only to break exact ties.
- **Tone** — `direct`, `frustrated`, `diplomatic`, `neutral`, `anxious`,
  `appreciative`; default `neutral`.
- **Confidence** — a saturating function of keyword-match strength
  (`0.35 + 0.55·(1 − e^(−score/2))`, capped at 0.95). A single weak
  match scores ~0.57; no match is `unknown` at 0.20. The number is
  honest about weak evidence.
- **Strategy** — Brown & Levinson (1987) rules, first match wins
  (documented in the module, labels R1–R6):
  1. criticism/disagreement → `positive_politeness` (`off_record` when
     imposition is high; `avoidance` when imposition **and** distance
     are high);
  2. payment/deadline pressure → `negative_politeness`;
  3. high imposition + unknown/high distance → `negative_politeness`;
  4. low imposition + low distance → `bald_on_record`;
  5. clarifying + unknown/low imposition → `bald_on_record`;
  6. default → `negative_politeness`.
- **P/D/R are never guessed.** Context factors come only from the
  request; `unknown` stays `unknown` in the output and adds a limitation.
- **Drafts** are template-based and reuse only facts found in the user's
  own message (dates, invoice numbers, amounts). They never invent a
  recipient's name, facts, or promises. No message is ever sent.
- **Guardrails:** no protected-trait inference, no claim about the
  recipient's true intent or emotions, at least one limitation always.

### Evaluation results

Golden set: `eval/golden.json` — 12 hand-labelled examples (message,
goal, P/D/R context, expected intent + strategy). Run it with:

```bash
pytest -s tests/test_engine.py::test_golden_set_agreement
```

**Latest measured result (2026-11-12): intent 12/12, strategy 12/12**
(the test requires ≥ 10/12 on both). The set covers all 7 intents and
all 5 strategy labels, including the `avoidance` and `off_record`
edge cases. Limitations to report honestly (05-ai-ml/MODEL_EVALUATION.md):
the golden set is small, hand-written, and keyword-aligned with the
engine — it measures rule consistency, not generalisation to real
freelancer messages. A real evaluation needs a held-out,
double-annotated dataset (see 05-ai-ml/DATASET_PLAN.md).

## Tests

```bash
pytest            # 45 tests (see below)
pytest -s tests/test_engine.py::test_golden_set_agreement   # golden-set numbers
```

- **Unit** (`tests/test_engine.py`): message validation, P/D/R unknown
  handling, 8 strategy-rule cases, draft fact reuse, honest confidence,
  schema validation, golden-set agreement.
- **Integration** (`tests/test_auth.py`, `tests/test_analyses.py`):
  register/login/logout/me, forgot/reset password, create/read/list
  analyses, draft lifecycle, template CRUD, cascade deletion of drafts
  when an analysis is deleted, privacy export, account deletion.
- **Security** (`tests/test_security.py`): cross-user IDOR (404, no
  existence leak), 401 without a token, oversized payload → 413, rate
  limit → 429, error-envelope + `X-Request-Id` shape, `/health`.

Tests use one temp SQLite file per session and reset the in-memory rate
limiters before every test.

## Project structure

```
backend/
  requirements.txt
  .env.example
  app/
    main.py                 # app factory: CORS, middleware, error handlers
    db.py                   # engine/session, create_all (prototype migrations)
    models.py               # users, sessions, analyses, analysis_context,
                            #   drafts, templates, security_events, consent_records
    schemas.py              # Pydantic v2 request/response schemas
    core/
      config.py             # env config validated at startup
      errors.py             # AppError hierarchy -> error envelope
      security.py           # PBKDF2 passwords, opaque session tokens
      rate_limit.py         # in-memory sliding-window limiter
    services/
      analysis_engine.py    # rule-based baseline (the AI)
      auth.py  analyses.py  drafts.py  templates.py  privacy.py
    api/v1/
      deps.py               # current-user + rate-limited-user dependencies
      routes/  auth.py  analyses.py  templates.py  privacy.py
  eval/
    golden.json             # 12 hand-labelled evaluation examples
  tests/
    conftest.py  test_engine.py  test_auth.py  test_analyses.py  test_security.py
```

## What a real LLM provider needs later

1. **Provider adapter** (`app/services/llm_provider.py`, new): one
   interface — `generate_draft(analysis, goal, constraints)` — with the
   engine's analysis as its only input, keeping the rule-based engine
   as the fallback when the provider is down or slow (SRS NFR:
   graceful degradation; p95 < 8 s for analysis excluding slow providers).
   Wire `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` from the environment;
   never log provider keys or raw provider errors.
2. **Migrations**: replace `create_all` with Alembic (see `app/db.py`).
   `create_all` never alters existing tables.
3. **Shared rate limiting**: the limiter is in-memory per process —
   use Redis for multi-worker deployments.
4. **Email delivery** for forgot-password (the dev-only token-in-response
   must be removed in production).
5. **HTTPS + secure cookies** (`SESSION_COOKIE_SECURE=true`,
   `SESSION_COOKIE_SAMESITE=lax` or `strict`) and a real secret manager
   for `APP_SECRET_KEY`.
6. **Evaluation**: replace/augment the golden set with a held-out,
   double-annotated dataset and report per-class precision/recall/F1
   (05-ai-ml/MODEL_EVALUATION.md).
