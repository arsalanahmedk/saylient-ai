"""Auth routes (06-api/API_SPEC.md): register, login, logout, forgot,
reset, me. Handlers stay thin; logic lives in app/services/auth.py.

Sessions are issued two ways at once:
- an HttpOnly session cookie (``saylient_session``) for the web app —
  the browser stores it and the API reads it, so JavaScript never sees
  the token (SECURITY_ARCHITECTURE §3); and
- the ``token`` field in the JSON body, for Bearer clients that cannot
  use cross-site cookies (the browser extension).

Both carry the same opaque session token; only its SHA-256 hash is
stored server-side.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session as DbSession

from app.api.v1.deps import SESSION_COOKIE_NAME, get_current_user, get_db
from app.core.config import get_settings
from app.core.errors import AppError, UnauthenticatedError
from app.models import User
from app.schemas import (
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GenericMessageResponse,
    LoginRequest,
    ProfilePatchRequest,
    ProvidersResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
)
from app.services.auth import (
    authenticate_user,
    register_user,
    request_password_reset,
    reset_password,
    revoke_token,
    update_profile,
)
from app.services.email import build_reset_email, get_email_provider
from app.services.oauth import (
    OAuthError,
    build_authorization_url,
    complete_google_login,
    fetch_google_profile,
    google_enabled,
    new_state,
    verify_state,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_OAUTH_STATE_COOKIE = "saylient_oauth_state"


class _NotConfiguredError(AppError):
    status_code = 503
    code = "NOT_CONFIGURED"
    message = "Google sign-in is not set up on this deployment yet."

_FORGOT_MESSAGE = (
    "If an account exists for that email, a password reset link has been sent."
)
# Returned when no email provider is configured in production: honest
# about the missing setup, identical for registered and unregistered
# emails so nothing leaks about account existence.
_FORGOT_NO_EMAIL_MESSAGE = (
    "Password reset by email is not set up on this deployment yet, so no "
    "reset link was sent. Please sign in with your current password, or "
    "contact support."
)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _session_token(request: Request) -> str | None:
    return getattr(request.state, "session_token", None)


def _set_session_cookie(response: Response, token: str, ttl_days: int) -> None:
    """Set the HttpOnly session cookie.

    SameSite/Secure come from config: local dev uses lax + insecure;
    the deployed frontend (Vercel) calls the API (Render) cross-site,
    which needs SameSite=None + Secure (see backend/README.md).
    """
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path="/api/v1",
        max_age=ttl_days * 24 * 3600,
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: DbSession = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    user, token = register_user(
        db,
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
        ttl_days=settings.session_ttl_days,
        request_id=_request_id(request),
    )
    _set_session_cookie(response, token, settings.session_ttl_days)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DbSession = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    user, token = authenticate_user(
        db,
        email=payload.email,
        password=payload.password,
        ttl_days=settings.session_ttl_days,
        request_id=_request_id(request),
        lockout_attempts=settings.login_lockout_attempts,
        lockout_window_minutes=settings.login_lockout_window_minutes,
    )
    _set_session_cookie(response, token, settings.session_ttl_days)
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.get("/providers", response_model=ProvidersResponse)
def providers() -> ProvidersResponse:
    """Which external sign-in providers are configured. The web app hides
    the Google button when the list is empty, so a visitor never sees a
    sign-in option that cannot work."""
    settings = get_settings()
    return ProvidersResponse(providers=["google"] if google_enabled(settings) else [])


@router.get("/google/login")
def google_login():
    """Start Google sign-in: redirect to accounts.google.com.

    A random ``state`` is stored in a short-lived HttpOnly cookie so the
    callback can verify the redirect came from this login start. The
    cookie is SameSite=lax: the Google redirect back is a top-level
    navigation, which carries lax cookies.
    """
    settings = get_settings()
    if not google_enabled(settings):
        raise _NotConfiguredError()
    state = new_state()
    redirect = RedirectResponse(
        url=build_authorization_url(settings, state), status_code=302
    )
    redirect.set_cookie(
        key=_OAUTH_STATE_COOKIE,
        value=state,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api/v1/auth/google",
        max_age=600,
    )
    return redirect


@router.get("/google/callback")
def google_callback(request: Request, db: DbSession = Depends(get_db)):
    """Google redirects here with ?code=...&state=... .

    Any failure (disabled provider, bad state, denied consent, Google
    error, already-linked account) redirects to the sign-in page with no
    detail — the reason is logged server-side, never shown to the
    visitor. Success sets the same HttpOnly session cookie as password
    login and lands the user in the workspace.
    """
    settings = get_settings()
    login_url = f"{settings.app_origin}/#login"
    overview_url = f"{settings.app_origin}/#overview"

    def _fail():
        failed = RedirectResponse(url=login_url, status_code=302)
        failed.delete_cookie(key=_OAUTH_STATE_COOKIE, path="/api/v1/auth/google")
        return failed

    if not google_enabled(settings):
        return _fail()
    code = request.query_params.get("code")
    if not code or not verify_state(
        request.query_params.get("state"),
        request.cookies.get(_OAUTH_STATE_COOKIE),
    ):
        return _fail()
    try:
        profile = fetch_google_profile(code, settings)
        _, token = complete_google_login(
            db,
            profile=profile,
            ttl_days=settings.session_ttl_days,
            request_id=_request_id(request),
        )
    except (OAuthError, UnauthenticatedError):
        return _fail()
    redirect = RedirectResponse(url=overview_url, status_code=302)
    redirect.delete_cookie(key=_OAUTH_STATE_COOKIE, path="/api/v1/auth/google")
    _set_session_cookie(redirect, token, settings.session_ttl_days)
    return redirect


@router.post("/logout", response_model=GenericMessageResponse)
def logout(
    request: Request,
    response: Response,
    db: DbSession = Depends(get_db),
) -> GenericMessageResponse:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):].strip()
    if token:
        revoke_token(db, token)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/api/v1")
    return GenericMessageResponse(message="Signed out.")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: DbSession = Depends(get_db),
) -> ForgotPasswordResponse:
    """Always the same generic message when email is configured.

    The reset token is returned ONLY in development, so the flow is
    testable without an email provider. In production the token is
    delivered by email (SMTP_* config) and never appears in a response;
    when no email provider is configured, the response says so honestly
    instead of claiming a link was sent."""
    settings = get_settings()
    token = request_password_reset(
        db,
        email=payload.email,
        ttl_minutes=settings.reset_token_ttl_minutes,
        request_id=_request_id(request),
    )
    provider = get_email_provider(settings)
    if token is not None and provider is not None:
        subject, body = build_reset_email(
            app_origin=settings.app_origin, token=token
        )
        provider.send(to=payload.email, subject=subject, text_body=body)
        return ForgotPasswordResponse(message=_FORGOT_MESSAGE)
    if settings.app_env == "development":
        return ForgotPasswordResponse(message=_FORGOT_MESSAGE, reset_token=token)
    if provider is None:
        # No provider configured: never claim a link was sent.
        return ForgotPasswordResponse(message=_FORGOT_NO_EMAIL_MESSAGE)
    return ForgotPasswordResponse(message=_FORGOT_MESSAGE)


@router.post("/reset-password", response_model=GenericMessageResponse)
def reset(
    payload: ResetPasswordRequest,
    request: Request,
    db: DbSession = Depends(get_db),
) -> GenericMessageResponse:
    reset_password(
        db,
        token=payload.token,
        new_password=payload.new_password,
        request_id=_request_id(request),
    )
    return GenericMessageResponse(message="Your password has been reset. Please sign in.")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def patch_me(
    payload: ProfilePatchRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> UserOut:
    """Update the display name and/or change the password (FR-01).

    A password change needs the current password and revokes every
    other session; the session used for this request keeps working.
    """
    updated = update_profile(
        db,
        user=user,
        display_name=payload.display_name,
        current_password=payload.current_password,
        new_password=payload.new_password,
        except_token=_session_token(request),
        request_id=_request_id(request),
    )
    return UserOut.model_validate(updated)
