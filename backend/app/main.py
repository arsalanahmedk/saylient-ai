"""Application factory.

Wiring (see 07-engineering/BACKEND_GUIDE.md):
- typed routes under /api/v1, thin handlers, logic in services;
- env config validated at startup;
- request IDs on every request and in every error envelope;
- 1 MB JSON body cap (413 above it);
- rate limits (60/min per IP on auth routes, 30/min per user on analyses);
- CORS from ALLOWED_ORIGINS;
- structured, redacted logs (method, path, status, request_id only — never
  message bodies, passwords or tokens);
- one error envelope for every failure (see 06-api/ERROR_CONVENTIONS.md);
- tables created with ``create_all`` at startup — the prototype equivalent
  of migrations (see app/db.py and backend/README.md).
"""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.routes import analyses as analyses_routes
from app.api.v1.routes import auth as auth_routes
from app.api.v1.routes import privacy as privacy_routes
from app.api.v1.routes import templates as templates_routes
from app.core.config import get_settings
from app.core.errors import AppError, InternalError
from app.core.rate_limit import (
    auth_limiter,
    enforce_auth_rate_limit,
    reset_all_limiters,
)
from app.db import create_engine_for, create_session_factory, init_db

logger = logging.getLogger("saylient")


def _error_response(
    request: Request, *, status: int, code: str, message: str, details: list | None = None
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    body = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "details": details or [],
        }
    }
    return JSONResponse(status_code=status, content=body, headers={"X-Request-Id": request_id})


_HTTP_STATUS_TO_CODE = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "VALIDATION_ERROR",
    409: "CONFLICT",
    413: "TOO_LARGE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL",
}


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign a uuid4 request ID, echo it in the X-Request-Id header, and
    write one structured log line per request (method/path/status only)."""

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001, ANN201
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        logger.info(
            json.dumps(
                {
                    "level": "info",
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "request_id": request_id,
                }
            )
        )
        return response


class BodySizeMiddleware(BaseHTTPMiddleware):
    """Reject request bodies above the configured cap (413, error envelope)."""

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001, ANN201
        settings = get_settings()
        body = await request.body()
        if len(body) > settings.max_body_bytes:
            return _error_response(
                request,
                status=413,
                code="TOO_LARGE",
                message="The request body is too large.",
            )
        return await call_next(request)


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    """60 requests/minute per IP on /api/v1/auth/* (60/min per spec)."""

    async def dispatch(self, request: Request, call_next):  # noqa: ANN001, ANN201
        if request.url.path.startswith("/api/v1/auth"):
            settings = get_settings()
            client = request.client.host if request.client else "unknown"
            if not auth_limiter.check(
                f"auth:{client}", settings.auth_rate_limit_per_minute
            ):
                return _error_response(
                    request,
                    status=429,
                    code="RATE_LIMITED",
                    message="Too many sign-in attempts. Please try again shortly.",
                )
        return await call_next(request)


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    app = FastAPI(
        title="Saylient AI API",
        description="AI-based freelancer communication assistant (prototype).",
        version="0.1.0",
    )

    engine = create_engine_for(settings.database_url)
    init_db(engine)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)

    # Middleware: added last runs first. Desired execution order is
    # RequestId -> BodySize -> AuthRateLimit -> CORS -> routes.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
    )
    app.add_middleware(AuthRateLimitMiddleware)
    app.add_middleware(BodySizeMiddleware)
    app.add_middleware(RequestIdMiddleware)

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return _error_response(
            request,
            status=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.details,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Strip "input"/"ctx" from Pydantic details: they can contain the
        # user's raw message text, which must never leak into errors.
        details = [
            {"loc": list(err.get("loc", [])), "msg": err.get("msg", "")}
            for err in exc.errors()
        ]
        return _error_response(
            request,
            status=422,
            code="VALIDATION_ERROR",
            message="Please review the submitted fields.",
            details=details,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code = _HTTP_STATUS_TO_CODE.get(exc.status_code, "INTERNAL")
        message = exc.detail if isinstance(exc.detail, str) else "Not found."
        return _error_response(
            request, status=exc.status_code, code=code, message=message
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            json.dumps(
                {
                    "level": "error",
                    "path": request.url.path,
                    "request_id": getattr(request.state, "request_id", None),
                    "error": type(exc).__name__,
                }
            )
        )
        return _error_response(
            request,
            status=500,
            code="INTERNAL",
            message=InternalError.message,
        )

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(auth_routes.router, prefix="/api/v1")
    app.include_router(analyses_routes.router, prefix="/api/v1")
    app.include_router(templates_routes.router, prefix="/api/v1")
    app.include_router(privacy_routes.router, prefix="/api/v1")

    return app


app = create_app()


__all__ = ["app", "create_app", "reset_all_limiters"]
