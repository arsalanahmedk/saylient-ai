"""Authentication service: register / login / logout / forgot / reset / me.

Sessions are opaque bearer tokens; only the SHA-256 hash is stored
(see app/core/security.py). Password-reset tokens are hashed the same way.
Forgot-password always returns the same generic message, and the reset
token is included in the response ONLY in development — production must
deliver it by email (see 07-engineering/DEPLOYMENT.md and
backend/README.md).

Security events are recorded for login success/failure, registration,
logout and password resets. They never contain message text, passwords
or tokens (see 04-data/DATA_DICTIONARY.md).
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session as DbSession

from app.core.errors import ConflictError, NotFoundError, UnauthenticatedError
from app.core.security import (
    ensure_aware,
    generate_token,
    hash_password,
    hash_token,
    utcnow,
    verify_password,
)
from app.models import SecurityEvent, Session as SessionModel, User


def _record_event(
    db: DbSession,
    *,
    user_id: str | None,
    event_type: str,
    result: str,
    request_id: str | None,
) -> None:
    db.add(
        SecurityEvent(
            user_id=user_id, event_type=event_type, result=result, request_id=request_id
        )
    )


def _create_session(db: DbSession, user: User, *, ttl_days: int) -> str:
    """Create a session row and return the raw bearer token (shown once)."""
    token = generate_token()
    db.add(
        SessionModel(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=utcnow() + timedelta(days=ttl_days),
        )
    )
    db.commit()
    return token


def register_user(
    db: DbSession,
    *,
    email: str,
    password: str,
    display_name: str,
    ttl_days: int,
    request_id: str | None,
) -> tuple[User, str]:
    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        # Generic on purpose: the response must not confirm that this
        # email is registered (see the security audit, register leak).
        raise ConflictError("An account with these details already exists.")
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name.strip(),
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _record_event(
        db, user_id=user.id, event_type="register", result="success", request_id=request_id
    )
    db.commit()
    token = _create_session(db, user, ttl_days=ttl_days)
    return user, token


def authenticate_user(
    db: DbSession,
    *,
    email: str,
    password: str,
    ttl_days: int,
    request_id: str | None,
) -> tuple[User, str]:
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(password, user.password_hash):
        _record_event(
            db,
            user_id=user.id if user else None,
            event_type="login",
            result="failure",
            request_id=request_id,
        )
        db.commit()
        # Same message whether the account or the password was wrong.
        raise UnauthenticatedError("Email or password is incorrect.")
    if user.status != "active":
        raise UnauthenticatedError("This account is not active.")
    _record_event(
        db, user_id=user.id, event_type="login", result="success", request_id=request_id
    )
    db.commit()
    # Login creates a new session; earlier sessions stay valid until they
    # expire or are revoked (logout, password change/reset). Revoking
    # other sessions on login would sign the user out of other devices.
    token = _create_session(db, user, ttl_days=ttl_days)
    return user, token


def get_user_from_token(db: DbSession, token: str) -> User | None:
    """Resolve a bearer token to its user, or None when it is missing,
    revoked or expired."""
    session = (
        db.query(SessionModel)
        .filter(SessionModel.token_hash == hash_token(token))
        .first()
    )
    if session is None or session.revoked_at is not None:
        return None
    if ensure_aware(session.expires_at) <= utcnow():
        return None
    return session.user


def revoke_token(db: DbSession, token: str) -> bool:
    session = (
        db.query(SessionModel)
        .filter(SessionModel.token_hash == hash_token(token))
        .first()
    )
    if session is None or session.revoked_at is not None:
        return False
    session.revoked_at = utcnow()
    db.commit()
    return True


def revoke_all_sessions(
    db: DbSession, user: User, *, except_token: str | None = None
) -> None:
    """Revoke every live session for the user, optionally keeping the
    session identified by its raw token (the current sign-in)."""
    now = utcnow()
    query = db.query(SessionModel).filter(
        SessionModel.user_id == user.id, SessionModel.revoked_at.is_(None)
    )
    if except_token:
        query = query.filter(SessionModel.token_hash != hash_token(except_token))
    for session in query:
        session.revoked_at = now
    db.commit()


def update_profile(
    db: DbSession,
    *,
    user: User,
    display_name: str | None = None,
    current_password: str | None = None,
    new_password: str | None = None,
    except_token: str | None = None,
    request_id: str | None = None,
) -> User:
    """Update the display name and/or change the password (FR-01).

    A password change requires the current password and revokes every
    other session, so a compromised session cannot survive the change.
    The current session (``except_token``) keeps working.
    """
    if display_name is not None:
        user.display_name = display_name.strip()[:100]
    if new_password is not None:
        if not current_password or not verify_password(
            current_password, user.password_hash
        ):
            raise UnauthenticatedError("Your current password is incorrect.")
        user.password_hash = hash_password(new_password)
        user.reset_token_hash = None
        user.reset_token_expires_at = None
        _record_event(
            db,
            user_id=user.id,
            event_type="password_change",
            result="success",
            request_id=request_id,
        )
    db.commit()
    if new_password is not None:
        revoke_all_sessions(db, user, except_token=except_token)
    db.refresh(user)
    return user


def request_password_reset(
    db: DbSession, *, email: str, ttl_minutes: int, request_id: str | None
) -> str | None:
    """Create a reset token for the account if it exists. Returns the raw
    token so the route can include it ONLY in development; the caller must
    still return the same generic message either way."""
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        # Do not reveal whether the email is registered.
        return None
    token = generate_token()
    user.reset_token_hash = hash_token(token)
    user.reset_token_expires_at = utcnow() + timedelta(minutes=ttl_minutes)
    _record_event(
        db,
        user_id=user.id,
        event_type="password_reset_request",
        result="success",
        request_id=request_id,
    )
    db.commit()
    return token


def reset_password(
    db: DbSession, *, token: str, new_password: str, request_id: str | None
) -> None:
    user = (
        db.query(User)
        .filter(User.reset_token_hash == hash_token(token))
        .first()
    )
    if (
        user is None
        or user.reset_token_expires_at is None
        or ensure_aware(user.reset_token_expires_at) <= utcnow()
    ):
        # Same generic outcome for an unknown or expired token.
        raise NotFoundError("The reset link is invalid or has expired.")
    user.password_hash = hash_password(new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    _record_event(
        db,
        user_id=user.id,
        event_type="password_reset",
        result="success",
        request_id=request_id,
    )
    db.commit()
    # A password change invalidates every existing session.
    revoke_all_sessions(db, user)
