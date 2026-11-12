"""Application configuration, validated at startup.

Variable names follow freelancer_communication_assistant_docs/07-engineering/
DEPLOYMENT.md. No secret is ever committed; put real values in a local `.env`
file (not in this repository) or in the deployment environment.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache

DEFAULT_DEV_SECRET = "dev-only-insecure-secret-change-me"


@dataclass(frozen=True)
class Settings:
    app_env: str = "development"
    app_secret_key: str = ""
    database_url: str = "sqlite:///./saylient.db"
    allowed_origins: tuple[str, ...] = ("http://localhost:5173",)
    session_cookie_secure: bool = False
    session_cookie_samesite: str = "lax"
    ai_provider: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    # Prototype limits (see 06-api/API_SPEC.md and 01-product/SRS.md).
    max_body_bytes: int = 1_048_576  # 1 MB JSON body cap -> 413 above it.
    auth_rate_limit_per_minute: int = 60  # per IP on /api/v1/auth/*
    analysis_rate_limit_per_minute: int = 30  # per user on POST /api/v1/analyses
    session_ttl_days: int = 7
    reset_token_ttl_minutes: int = 60

    def validate(self) -> None:
        """Fail fast on unsafe configuration unless this is local development."""
        if self.app_env != "development":
            if not self.app_secret_key:
                raise RuntimeError(
                    "APP_SECRET_KEY is required when APP_ENV is not 'development'."
                )
            if self.app_secret_key == DEFAULT_DEV_SECRET:
                raise RuntimeError(
                    "APP_SECRET_KEY must not be the development placeholder "
                    "outside APP_ENV=development."
                )
        if self.session_cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError(
                "SESSION_COOKIE_SAMESITE must be 'lax', 'strict' or 'none'."
            )
        if self.database_url.startswith("postgresql://"):
            pass  # supported by SQLAlchemy; keep the check permissive.
        elif not self.database_url.startswith("sqlite:///"):
            raise ValueError(
                "DATABASE_URL must start with 'sqlite:///' or 'postgresql://'."
            )


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _origins_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return tuple(o.strip() for o in raw.split(",") if o.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Read configuration from the environment and validate it."""
    secret = os.environ.get("APP_SECRET_KEY", "")
    app_env = os.environ.get("APP_ENV", "development").strip().lower() or "development"
    if app_env == "development" and not secret:
        # Development-only fallback so a local prototype run is one command.
        # Production/staging refuse to start without a real secret (see
        # Settings.validate). This value is NEVER used outside development.
        secret = DEFAULT_DEV_SECRET
    settings = Settings(
        app_env=app_env,
        app_secret_key=secret,
        database_url=os.environ.get("DATABASE_URL", "sqlite:///./saylient.db"),
        allowed_origins=_origins_env("ALLOWED_ORIGINS", ("http://localhost:5173",)),
        session_cookie_secure=_bool_env("SESSION_COOKIE_SECURE", False),
        session_cookie_samesite=os.environ.get(
            "SESSION_COOKIE_SAMESITE", "lax"
        ).strip().lower()
        or "lax",
        ai_provider=os.environ.get("AI_PROVIDER", "").strip(),
        ai_api_key=os.environ.get("AI_API_KEY", "").strip(),
        ai_model=os.environ.get("AI_MODEL", "").strip(),
    )
    settings.validate()
    return settings
