"""Request dependencies: database session, current user, rate limits.

``get_current_user`` resolves the session in two ways (in this order):
1. the ``Authorization: Bearer <token>`` header (the browser extension
   and API clients — an explicit credential, so it wins when both are
   present); and
2. the ``saylient_session`` HttpOnly cookie (the web app — see
   app/api/v1/routes/auth.py, which sets it on register/login); the
   browser stores it and the API reads it, so JavaScript never sees
   the token (SECURITY_ARCHITECTURE §3).

No token, an unknown token, a revoked token or an expired token all
become 401 (UNAUTHENTICATED) — never 403, and never a hint about which
part failed. The raw token and the auth method are stored on
``request.state`` so routes can revoke the current session (logout,
profile password change) without re-parsing the request.

CSRF: the session cookie is ambient, so a state-changing request
authenticated by the cookie is only accepted when its Origin header —
when present — is one of the configured allowed origins. Browsers
always send Origin on cross-site POST/PATCH/DELETE, while the
SameSite cookie attribute blocks the ambient case for same-site
requests. Bearer-authenticated requests are not ambient credentials,
so the check does not apply to them.
"""

from __future__ import annotations

from typing import Generator

from fastapi import Depends, Request
from sqlalchemy.orm import Session as DbSession

from app.core.config import get_settings
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.core.rate_limit import enforce_analysis_rate_limit
from app.models import User
from app.services.auth import get_user_from_token

SESSION_COOKIE_NAME = "saylient_session"


def get_db(request: Request) -> Generator[DbSession, None, None]:
    """Yield a request-scoped session from the factory stored on the app."""
    factory = request.app.state.session_factory
    db = factory()
    try:
        yield db
    finally:
        db.close()


def _check_cookie_csrf(request: Request) -> None:
    """Reject a cookie-authenticated state change from a foreign origin."""
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    origin = request.headers.get("Origin")
    if not origin:
        # No Origin header (same-origin form posts, non-browser clients):
        # the SameSite cookie attribute is the protection here.
        return
    allowed = set(get_settings().allowed_origins)
    if origin.rstrip("/") not in {o.rstrip("/") for o in allowed}:
        raise ForbiddenError("The request origin is not allowed.")


def get_current_user(
    request: Request, db: DbSession = Depends(get_db)
) -> User:
    # Explicit credential first: a Bearer token wins over the ambient
    # cookie, so an API client is never accidentally authenticated as
    # whoever the browser last signed in as.
    token = None
    method = "bearer"
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):].strip()
    if not token:
        token = request.cookies.get(SESSION_COOKIE_NAME)
        method = "cookie"
    if not token:
        raise UnauthenticatedError("Missing or invalid authorization.")
    if method == "cookie":
        _check_cookie_csrf(request)
    user = get_user_from_token(db, token)
    if user is None:
        raise UnauthenticatedError("The session is invalid or has expired.")
    request.state.session_token = token
    request.state.auth_method = method
    return user


def get_rate_limited_user(
    user: User = Depends(get_current_user),
) -> User:
    """Current user plus the per-user analysis rate limit (30/min).

    Used by POST /api/v1/analyses. It runs after authentication, so an
    unauthenticated request gets 401, never 429.
    """
    enforce_analysis_rate_limit(user.id, get_settings().analysis_rate_limit_per_minute)
    return user
