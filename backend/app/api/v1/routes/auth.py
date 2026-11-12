"""Auth routes (06-api/API_SPEC.md): register, login, logout, forgot,
reset, me. Handlers stay thin; logic lives in app/services/auth.py."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session as DbSession

from app.api.v1.deps import get_current_user, get_db
from app.core.config import get_settings
from app.models import User
from app.schemas import (
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GenericMessageResponse,
    LoginRequest,
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
)

router = APIRouter(prefix="/auth", tags=["auth"])

_FORGOT_MESSAGE = (
    "If an account exists for that email, a password reset link has been sent."
)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(
    payload: RegisterRequest,
    request: Request,
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
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: DbSession = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    user, token = authenticate_user(
        db,
        email=payload.email,
        password=payload.password,
        ttl_days=settings.session_ttl_days,
        request_id=_request_id(request),
    )
    return AuthResponse(token=token, user=UserOut.model_validate(user))


@router.post("/logout", response_model=GenericMessageResponse)
def logout(request: Request, db: DbSession = Depends(get_db)) -> GenericMessageResponse:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        revoke_token(db, auth_header[len("Bearer "):].strip())
    return GenericMessageResponse(message="Signed out.")


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: DbSession = Depends(get_db),
) -> ForgotPasswordResponse:
    """Always the same generic message. The reset token is returned ONLY
    in development, so the flow is testable without an email provider.
    Production must send the token by email and never include it here."""
    settings = get_settings()
    token = request_password_reset(
        db,
        email=payload.email,
        ttl_minutes=settings.reset_token_ttl_minutes,
        request_id=_request_id(request),
    )
    if settings.app_env == "development":
        return ForgotPasswordResponse(message=_FORGOT_MESSAGE, reset_token=token)
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
