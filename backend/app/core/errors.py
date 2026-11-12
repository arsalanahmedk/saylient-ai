"""Application errors, all rendered through the single error envelope.

Envelope (see 06-api/ERROR_CONVENTIONS.md):
    {"error": {"code": ..., "message": ..., "request_id": ..., "details": []}}

Client-facing messages never contain stack traces, SQL, secrets, or raw
user message text.
"""

from __future__ import annotations


class AppError(Exception):
    """Base error carrying an HTTP status and a stable error code."""

    status_code: int = 500
    code: str = "INTERNAL"
    message: str = "Something went wrong. Please try again later."

    def __init__(
        self,
        message: str | None = None,
        details: list | None = None,
    ) -> None:
        super().__init__(message or self.message)
        if message is not None:
            self.message = message
        self.details: list = details or []


class ValidationAppError(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"
    message = "Please review the submitted fields."


class UnauthenticatedError(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"
    message = "Please sign in to continue."


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to do that."


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "The requested item was not found."


class ConflictError(AppError):
    status_code = 409
    code = "CONFLICT"
    message = "An item with these details already exists."


class TooLargeError(AppError):
    status_code = 413
    code = "TOO_LARGE"
    message = "The request body is too large."


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    message = "Too many requests. Please slow down and try again shortly."


class InternalError(AppError):
    status_code = 500
    code = "INTERNAL"
    message = "Something went wrong. Please try again later."
