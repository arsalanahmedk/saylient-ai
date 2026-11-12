"""In-memory sliding-window rate limiter.

Prototype-grade but correct: per key, keep the timestamps of requests inside
the window and refuse when the count reaches the limit. Counts live only in
this process, so a multi-worker deployment would need a shared store (Redis)
before production use — see backend/README.md.

Limits (see 01-product/SRS.md and 06-api/API_SPEC.md):
- 60 requests/minute per IP on auth routes.
- 30 requests/minute per user on analysis creation.
Exceeding a limit raises ``RateLimitedError`` (HTTP 429, error envelope).
"""

from __future__ import annotations

import threading
import time
from collections import deque

from app.core.errors import RateLimitedError


class SlidingWindowLimiter:
    """Sliding-window counter keyed by an arbitrary string."""

    def __init__(self, window_seconds: float = 60.0) -> None:
        self._window = window_seconds
        self._buckets: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, limit: int) -> bool:
        """Return True and record the request when inside the limit."""
        now = time.monotonic()
        with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            cutoff = now - self._window
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True

    def reset(self) -> None:
        """Clear all counters (used by the test suite)."""
        with self._lock:
            self._buckets.clear()


# Module-level limiters shared by the middleware and the route dependencies.
auth_limiter = SlidingWindowLimiter(window_seconds=60.0)
analysis_limiter = SlidingWindowLimiter(window_seconds=60.0)


def reset_all_limiters() -> None:
    auth_limiter.reset()
    analysis_limiter.reset()


def enforce_auth_rate_limit(client_key: str, limit: int) -> None:
    if not auth_limiter.check(f"auth:{client_key}", limit):
        raise RateLimitedError("Too many sign-in attempts. Please try again shortly.")


def enforce_analysis_rate_limit(user_id: str, limit: int) -> None:
    if not analysis_limiter.check(f"analysis:{user_id}", limit):
        raise RateLimitedError(
            "Too many analyses. Please wait a moment and try again."
        )
