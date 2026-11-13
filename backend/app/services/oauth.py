"""Google sign-in (OAuth 2.0 / OpenID Connect).

Flow (authorization-code, server-side — the client secret never leaves
the server):
1. GET /auth/google/login -> 302 to accounts.google.com with a random
   ``state``; the state is stored in a short-lived HttpOnly cookie so the
   callback can verify the redirect came from our own login start.
2. Google redirects to GET /auth/google/callback?code=...&state=... .
3. The code is exchanged for tokens at oauth2.googleapis.com, then the
   access token fetches the profile at
   openidconnect.googleapis.com/v1/userinfo. Only a profile with
   ``email_verified`` true is accepted.
4. The Google account links to the Saylient account with the same
   verified email (or a new account is created with no password). The
   Google "sub" is stored so the link is pinned to that Google account.

Google sign-in is disabled unless GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
and GOOGLE_REDIRECT_URI are all configured (see app/core/config.py).
"""

from __future__ import annotations

import hmac
import logging
import secrets
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session as DbSession

from app.core.config import Settings
from app.core.errors import UnauthenticatedError
from app.models import User
from app.services.auth import _create_session, _record_event

logger = logging.getLogger("saylient")

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
_OAUTH_SCOPE = "openid email profile"


class OAuthError(Exception):
    """Google sign-in failed. The message is safe to show the user."""


def google_enabled(settings: Settings) -> bool:
    return bool(
        settings.google_client_id
        and settings.google_client_secret
        and settings.google_redirect_uri
    )


def new_state() -> str:
    """Random state for one login attempt (double-submit via cookie)."""
    return secrets.token_urlsafe(24)


def build_authorization_url(settings: Settings, state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": _OAUTH_SCOPE,
        "state": state,
        # Let users with several Google accounts pick the right one.
        "prompt": "select_account",
    }
    return f"{_GOOGLE_AUTH_URL}?{urlencode(params)}"


def verify_state(returned: str | None, stored: str | None) -> bool:
    """Constant-time comparison; either side missing fails closed."""
    if not returned or not stored:
        return False
    return hmac.compare_digest(returned, stored)


def fetch_google_profile(
    code: str, settings: Settings, client: httpx.Client | None = None
) -> dict:
    """Exchange the authorization code for the Google profile.

    ``client`` is injectable so tests can pass a MockTransport; the live
    path builds a real client. Only the profile is returned — tokens are
    never stored (we mint our own session instead).
    """
    own_client = client is None
    client = client or httpx.Client(timeout=15.0)
    try:
        token_res = client.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        if token_res.status_code != 200:
            logger.info("google token exchange failed: %s", token_res.status_code)
            raise OAuthError("Google sign-in did not complete. Please try again.")
        access_token = token_res.json().get("access_token")
        if not access_token:
            raise OAuthError("Google sign-in did not complete. Please try again.")
        info_res = client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if info_res.status_code != 200:
            logger.info("google userinfo failed: %s", info_res.status_code)
            raise OAuthError("Google sign-in did not complete. Please try again.")
        profile = info_res.json()
    except httpx.HTTPError:
        logger.info("google token exchange transport error")
        raise OAuthError("Google could not be reached. Please try again.") from None
    finally:
        if own_client:
            client.close()
    if not profile.get("email_verified"):
        raise OAuthError("Google did not confirm this email address.")
    if not profile.get("email") or not profile.get("sub"):
        raise OAuthError("Google did not return an email address.")
    return profile


def complete_google_login(
    db: DbSession,
    *,
    profile: dict,
    ttl_days: int,
    request_id: str | None,
) -> tuple[User, str]:
    """Link the Google profile to an account (or create one) and sign in.

    Linking is by verified email: Google only returns the email when the
    Google account owns it. The Google "sub" is pinned to the account so a
    different Google account can never take it over.
    """
    email = str(profile["email"]).strip().lower()
    google_sub = str(profile["sub"])
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        linked = db.query(User).filter(User.google_sub == google_sub).first()
        if linked is not None:
            raise OAuthError(
                "This Google account is already linked to another account."
            )
        display_name = str(profile.get("name") or email.split("@")[0])[:100]
        user = User(
            email=email,
            password_hash=None,
            display_name=display_name,
            status="active",
            google_sub=google_sub,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        _record_event(
            db,
            user_id=user.id,
            event_type="oauth_register",
            result="success",
            request_id=request_id,
        )
        db.commit()
    else:
        if user.status != "active":
            raise UnauthenticatedError("This account is not active.")
        if user.google_sub is None:
            user.google_sub = google_sub
            _record_event(
                db,
                user_id=user.id,
                event_type="oauth_link",
                result="success",
                request_id=request_id,
            )
        elif user.google_sub != google_sub:
            raise OAuthError(
                "This email is already linked to a different Google account."
            )
        db.commit()
    _record_event(
        db,
        user_id=user.id,
        event_type="oauth_login",
        result="success",
        request_id=request_id,
    )
    db.commit()
    token = _create_session(db, user, ttl_days=ttl_days)
    return user, token
