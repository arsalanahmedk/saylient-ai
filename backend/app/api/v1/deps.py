"""Request dependencies: database session, current user, rate limits.

``get_current_user`` reads the ``Authorization: Bearer <token>`` header
and resolves it to a user via the stored session hash. No token, an
unknown token, a revoked token or an expired token all become 401
(UNAUTHENTICATED) — never 403, and never a hint about which part failed.
"""

from __future__ import annotations

from typing import Generator

from fastapi import Depends, Request
from sqlalchemy.orm import Session as DbSession

from app.core.errors import UnauthenticatedError
from app.core.rate_limit import enforce_analysis_rate_limit
from app.core.config import get_settings
from app.models import User
from app.services.auth import get_user_from_token


def get_db(request: Request) -> Generator[DbSession, None, None]:
    """Yield a request-scoped session from the factory stored on the app."""
    factory = request.app.state.session_factory
    db = factory()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    request: Request, db: DbSession = Depends(get_db)
) -> User:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise UnauthenticatedError("Missing or invalid authorization header.")
    token = auth_header[len("Bearer "):].strip()
    if not token:
        raise UnauthenticatedError("Missing or invalid authorization header.")
    user = get_user_from_token(db, token)
    if user is None:
        raise UnauthenticatedError("The session is invalid or has expired.")
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
