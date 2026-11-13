"""Database models.

Field inventory follows 04-data/DATA_DICTIONARY.md; relationships and
indexes follow 04-data/DATABASE_DESIGN.md.

- IDs are UUIDs stored as strings (portable across SQLite/PostgreSQL).
- All timestamps are UTC.
- Ownership is enforced at the service layer on every resource endpoint;
  UUIDs alone never authorise access.
- Deletion: deleting a user removes their analyses, drafts, templates,
  sessions and consent records (ORM cascade + DB foreign keys). Security
  events keep their row but lose the actor reference (``user_id`` is
  nullable and set to NULL), so the audit trail survives account deletion
  without identifying the deleted account.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.security import utcnow
from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    # Normalised (lower-cased, trimmed) at registration; unique.
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # Nullable for external identity providers (see DATA_DICTIONARY.md).
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Google account this user signed in with (the OAuth "sub" claim).
    # NULL for password-only accounts; unique so one Google account links
    # to exactly one Saylient account.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    reset_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )
    analyses: Mapped[list["Analysis"]] = relationship(
        "Analysis", back_populates="user", cascade="all, delete-orphan"
    )
    drafts: Mapped[list["Draft"]] = relationship(
        "Draft", back_populates="user", cascade="all, delete-orphan"
    )
    templates: Mapped[list["Template"]] = relationship(
        "Template", back_populates="user", cascade="all, delete-orphan"
    )
    consent_records: Mapped[list["ConsentRecord"]] = relationship(
        "ConsentRecord", back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    """Server-managed session. Only the SHA-256 hash of the bearer token is
    stored; the raw token is returned once, at login/registration."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped["User"] = relationship("User", back_populates="sessions")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    input_text: Mapped[str] = mapped_column(Text, nullable=False)
    context_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal: Mapped[str] = mapped_column(String(40), nullable=False)
    # Context factors (P/D/R). One column each; values are
    # unknown/low/medium/high. Unknown is a real value, never a guess.
    context_power: Mapped[str] = mapped_column(String(10), nullable=False, default="unknown")
    context_social_distance: Mapped[str] = mapped_column(
        String(10), nullable=False, default="unknown"
    )
    context_imposition: Mapped[str] = mapped_column(String(10), nullable=False, default="unknown")
    intent_label: Mapped[str] = mapped_column(String(40), nullable=False)
    intent_confidence: Mapped[float | None] = mapped_column(nullable=True)
    tone_label: Mapped[str] = mapped_column(String(40), nullable=False)
    tone_confidence: Mapped[float | None] = mapped_column(nullable=True)
    fta_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fta_description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # JSON lists (face concerns, limitations) — SQLite stores them as JSON.
    face_concern: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    strategy_label: Mapped[str] = mapped_column(String(40), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")
    draft: Mapped[str] = mapped_column(Text, nullable=False, default="")
    limitations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    model_version: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="analyses")
    contexts: Mapped[list["AnalysisContext"]] = relationship(
        "AnalysisContext", back_populates="analysis", cascade="all, delete-orphan"
    )
    drafts: Mapped[list["Draft"]] = relationship(
        "Draft", back_populates="analysis", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_analyses_user_created", "user_id", "created_at"),)


class AnalysisContext(Base):
    """One row per entry of the optional ``conversation_context`` list."""

    __tablename__ = "analysis_context"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    analysis_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="prior")
    text: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    analysis: Mapped["Analysis"] = relationship("Analysis", back_populates="contexts")


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    analysis_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    draft_text: Mapped[str] = mapped_column(Text, nullable=False)
    tone_setting: Mapped[str | None] = mapped_column(String(40), nullable=True)
    directness_setting: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    analysis: Mapped["Analysis"] = relationship("Analysis", back_populates="drafts")
    user: Mapped["User"] = relationship("User", back_populates="drafts")

    __table_args__ = (
        Index("ix_drafts_user_updated", "user_id", "updated_at"),
    )


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="templates")

    __table_args__ = (
        Index("ix_templates_user_updated", "user_id", "updated_at"),
        UniqueConstraint("user_id", "title", name="uq_templates_user_title"),
    )


class SecurityEvent(Base):
    """Audit row. Never stores raw message text, passwords or tokens
    (see 04-data/DATABASE_DESIGN.md)."""

    __tablename__ = "security_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class ConsentRecord(Base):
    """Versioned, timestamped consent (e.g. optional research/training
    consent). No consent endpoint exists yet; records are created only when
    the feature is added."""

    __tablename__ = "consent_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    consent_type: Mapped[str] = mapped_column(String(60), nullable=False)
    version: Mapped[str] = mapped_column(String(20), nullable=False)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="consent_records")
