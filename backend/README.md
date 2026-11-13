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
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax` / `strict` / `none` — the deployed frontend (Vercel) calls this API (Render) cross-site, so production needs `none` + `SESSION_COOKIE_SECURE=true` (browsers reject SameSite=None without Secure) |
| `APP_ORIGIN` | `http://127.0.0.1:5173` | Public origin of the web app; used to build password-reset links |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_USE_TLS` | empty / `587` / empty / empty / `Saylient AI <noreply@saylient.ai>` / `true` | Password-reset email (SMTP). All optional — without `SMTP_HOST` no email is sent; in production forgot-password then answers honestly that reset by email is not set up (it never claims a link was sent). Set in the deployment environment (Render env vars), never commit credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | empty | Google sign-in (OAuth 2.0). All three must be set together or all empty — a partial set fails startup. All empty = Google sign-in disabled: `GET /auth/providers` returns no providers, the web app hides the Google button, and `GET /auth/google/login` answers 503. The client comes from Google Cloud Console (APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application); the redirect URI registered there must match `GOOGLE_REDIRECT_URI` exactly — for this deployment: `https://saylient-ai-backend.onrender.com/api/v1/auth/google/callback`. Set in the deployment environment (Render env vars), never commit credentials |
| `LOGIN_LOCKOUT_ATTEMPTS` / `LOGIN_LOCKOUT_WINDOW_MINUTES` | `5` / `15` | Failed-login lockout: this many failed sign-ins for one account inside the window locks it for the same window. The window slides on its own. |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` | empty | Reserved for a future LLM provider adapter; the current engine makes **no** external calls |

## Google sign-in (OAuth 2.0)

`GET /auth/providers` lists configured providers. `GET /auth/google/login`
redirects to Google with a random `state` (double-submit via a short-lived
HttpOnly cookie); `GET /auth/google/callback` exchanges the code, fetches
the profile from Google, and only accepts it when `email_verified` is true.
The Google account links to the Saylient account with the same verified
email (or a new account is created with no password); the Google `sub` is
stored (`users.google_sub`, added by a startup migration — see `app/db.py`)
so the link is pinned to that Google account. Success sets the same
HttpOnly session cookie as password login and redirects to the workspace;
any failure redirects to the sign-in page with no detail. Google-only
accounts can set a password in Profile (no current password to check) so
they can also sign in with email — including in the browser extension,
which uses email sign-in (its Google button opens the website login).

## Endpoints (base `/api/v1`, JSON only) — 24 under `/api/v1`, plus `/health` = 25 routes

**Auth** — `POST /auth/register` (201), `POST /auth/login`,
`POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password`,
`GET /auth/me`, `PATCH /auth/me` (display name; password change with the
current password, revokes every other session), `GET /auth/providers`,
`GET /auth/google/login` and `GET /auth/google/callback` (Google sign-in,
see above). Five failed sign-ins for one account inside 15 minutes lock
it for 15 minutes (`LOGIN_LOCKOUT_*`). Sessions are opaque tokens
(only the SHA-256 hash is stored) issued two ways at once: an HttpOnly
session cookie (`saylient_session`) for the web app and the `token` field
in the JSON body for Bearer clients (the browser extension, which cannot
use cross-site cookies). Tokens expire after 7 days; logout revokes the
token; a password change/reset revokes all sessions. Cookie-authenticated
state changes are CSRF-protected: a request whose `Origin` header is not
an allowed origin is rejected (403); the SameSite cookie attribute is
the second layer.

**Forgot-password note:** the response body is always the same generic
message when email is configured. The reset token is returned in the
response **only when `APP_ENV=development`**, so the flow is testable
without email. In production the token is delivered by email (SMTP_* config,
see `app/services/email.py`) and never appears in a response; when no
email provider is configured, production answers honestly that reset by
email is not set up — it never claims a link was sent.

**Analyses** — `POST /analyses` (201), `GET /analyses?limit&offset`
(paginated), `GET /analyses/stats` (dashboard aggregates), `GET /analyses/{id}`,
`POST /analyses/{id}/regenerate` (re-runs the engine on the same analysis,
in place — no duplicate history row), `DELETE /analyses/{id}` (also deletes
the analysis's drafts). Request: `message` (1-2000 chars),
`conversation_context` (optional list of strings or `{role, text}`),
`goal` (one of the 7 intents), `context` (`power` / `social_distance` /
`imposition`, each `unknown` / `low` / `medium` / `high`), `tone`
(Professional/Friendly/Diplomatic/Assertive/Empathetic — changes the draft
greeting) and `directness` (`direct` / `balanced` / `gentle` — changes how
hedged the draft is). Tone/directness never change intent, tone label,
FTA or strategy.

**Drafts** — `GET /analyses/{id}/drafts`, `POST /analyses/{id}/drafts` (201),
`PATCH /drafts/{id}`, `DELETE /drafts/{id}`.

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
  limit → 429, error-envelope + `X-Request-Id` shape, `/health`, security
  headers on every response, cookie CSRF rejection of a foreign Origin.
- **Email** (`tests/test_email.py`): provider is None when SMTP is
  unconfigured; the reset link uses `APP_ORIGIN`; forgot-password in
  production without SMTP answers honestly instead of claiming a link
  was sent.
- **Auth** also covers cookie sessions (HttpOnly `saylient_session` set
  on login/register, cookie-only `/me`), generic register-conflict
  message (no email leak), and `PATCH /auth/me` (display name, password
  change revoking other sessions).
- **Analyses** also covers `POST /analyses/{id}/regenerate` (in place,
  no duplicate row), `GET /analyses/stats`, and tone/directness
  restyling of the draft (engine tests cover the Power rule R3).

## Password hashing: PBKDF2, not Argon2id (documented choice)

The docs name Argon2id; this implementation uses PBKDF2-HMAC-SHA256
with 600,000 iterations and a random 16-byte salt (stdlib
`hashlib.pbkdf2_hmac`, format `pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>`).
PBKDF2 at 600k iterations is a vetted, OWASP-listed password-hashing
choice and keeps the backend dependency-free (no `argon2-cffi` binary
wheel, which matters for the Render free build). Argon2id would add
memory-hardness against GPU cracking; switching later means re-hashing
passwords on next login — a known, small migration, deferred to a later
phase. This is a deliberate deviation from the docs, not a vulnerability.

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
      email.py              # SMTP provider for password-reset email
    api/v1/
      deps.py               # current-user + rate-limited-user dependencies
      routes/  auth.py  analyses.py  templates.py  privacy.py
  eval/
    golden.json             # 12 hand-labelled evaluation examples
  tests/
    conftest.py  test_engine.py  test_auth.py  test_analyses.py
    test_security.py  test_email.py
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
4. **Email delivery** for forgot-password is implemented (SMTP provider,
   `app/services/email.py`, `SMTP_*` config). Production still needs
   credentials set (Render env vars) — without them forgot-password
   answers honestly that reset by email is not set up.
5. **HTTPS + secure cookies** are implemented (`SESSION_COOKIE_SECURE=true`,
   `SESSION_COOKIE_SAMESITE=none` for the cross-site Vercel → Render
   setup). A real secret manager for `APP_SECRET_KEY` is still a
   later step.
6. **Evaluation**: replace/augment the golden set with a held-out,
   double-annotated dataset and report per-class precision/recall/F1
   (05-ai-ml/MODEL_EVALUATION.md).
