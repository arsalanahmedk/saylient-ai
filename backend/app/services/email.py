"""Password-reset email delivery (SMTP).

Interface + stdlib implementation (07-engineering/BACKEND_GUIDE.md: the
provider adapter lives behind a small interface so a transactional
provider can replace SMTP without touching the auth service).

- ``get_email_provider(settings)`` returns None when SMTP is not
  configured (``SMTP_HOST`` empty). Callers must then be honest: the
  forgot-password flow must NOT claim "instructions were sent" when
  nothing was sent (see app/api/v1/routes/auth.py).
- ``SMTPEmailProvider.send`` never raises for delivery failures: it logs
  (no message text, no token) and returns False, so a mail outage can
  never leak account existence or break the generic response.
- No credentials are read from anywhere except the environment (see
  app/core/config.py); this module holds no secrets.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger("saylient.email")


class EmailProvider(Protocol):
    """Minimal email interface: send one message, report success."""

    def send(self, *, to: str, subject: str, text_body: str) -> bool:
        ...


class SMTPEmailProvider:
    """SMTP delivery with STARTTLS (when ``smtp_use_tls``) and optional
    login (only when a username is set). Standard library only."""

    def __init__(self, settings: Settings) -> None:
        self.host = settings.smtp_host
        self.port = settings.smtp_port
        self.username = settings.smtp_username
        self.password = settings.smtp_password
        self.from_addr = settings.smtp_from
        self.use_tls = settings.smtp_use_tls

    def send(self, *, to: str, subject: str, text_body: str) -> bool:
        message = EmailMessage()
        message["From"] = self.from_addr
        message["To"] = to
        message["Subject"] = subject
        message.set_content(text_body)
        try:
            with smtplib.SMTP(self.host, self.port, timeout=15) as server:
                if self.use_tls:
                    server.starttls()
                if self.username:
                    server.login(self.username, self.password)
                server.send_message(message)
        except (smtplib.SMTPException, OSError) as exc:
            # Log the failure class only — never the recipient's token or
            # the message body.
            logger.warning("password-reset email failed: %s", type(exc).__name__)
            return False
        return True


def get_email_provider(settings: Settings) -> EmailProvider | None:
    """Return the configured provider, or None when SMTP is not set up."""
    if not settings.smtp_host:
        return None
    return SMTPEmailProvider(settings)


def build_reset_email(*, app_origin: str, token: str) -> tuple[str, str]:
    """Subject + plain-text body for a password-reset email.

    The link opens the web app's reset page (hash route) with the token.
    The token is single-use and expires (see
    app/services/auth.py ``reset_token_ttl_minutes``).
    """
    origin = app_origin.rstrip("/")
    link = f"{origin}/#reset-password?token={token}"
    subject = "Reset your Saylient AI password"
    body = (
        "You asked to reset your Saylient AI password.\n\n"
        f"Open this link to choose a new password:\n{link}\n\n"
        "The link works once and expires after 60 minutes. "
        "If you did not ask for this, you can ignore this email — "
        "your password will not change.\n\n"
        "— Saylient AI\n"
    )
    return subject, body
