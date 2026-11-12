"""Authentication primitives.

- Passwords: PBKDF2-HMAC-SHA256 with a random 16-byte salt, stdlib only
  (``hashlib.pbkdf2_hmac``). Stored format:
  ``pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>``.
- Sessions: opaque bearer tokens (``secrets.token_urlsafe``). Only the
  SHA-256 hash of a token is stored in the database, so a database leak does
  not hand out usable session tokens.
- Password-reset tokens use the same hash-before-store rule.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone

_PBKDF2_ITERATIONS = 600_000
_SALT_BYTES = 16
_HASH_NAME = "sha256"


def utcnow() -> datetime:
    """Timezone-aware UTC now (all timestamps in the API are UTC)."""
    return datetime.now(timezone.utc)


def ensure_aware(value: datetime) -> datetime:
    """SQLite can hand back naive datetimes; make comparisons safe."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        _HASH_NAME, password.encode("utf-8"), salt, _PBKDF2_ITERATIONS
    )
    return (
        f"pbkdf2_sha256${_PBKDF2_ITERATIONS}$"
        f"{salt.hex()}${digest.hex()}"
    )


def verify_password(password: str, stored: str | None) -> bool:
    """Constant-time comparison. A missing hash verifies against a dummy
    value so the timing does not reveal whether the account exists."""
    if not stored:
        # Dummy verification to keep timing uniform for unknown accounts.
        dummy = hashlib.pbkdf2_hmac(
            _HASH_NAME, b"dummy", b"0" * _SALT_BYTES, _PBKDF2_ITERATIONS
        )
        return hmac.compare_digest(dummy.hex(), "0" * len(dummy.hex()))
    try:
        _, iterations, salt_hex, hash_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            _HASH_NAME,
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), hash_hex)


def generate_token() -> str:
    """Opaque session/reset token. Never log or store the raw value."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 of a token; this is what is stored and looked up."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
