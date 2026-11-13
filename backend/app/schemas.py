"""Typed request/response schemas for every endpoint (FastAPI + Pydantic v2).

Validation is authoritative on the server (01-product/SRS.md §4):
- message 1-2000 chars; goal must be one of the 7 intents;
- P/D/R values from {unknown, low, medium, high};
- email must look like an email address; passwords are 8-128 chars.
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

ContextLevel = Literal["unknown", "low", "medium", "high"]


class Goal(str, Enum):
    """The 7 intents (see 05-ai-ml/AI_ML_ARCHITECTURE.md strategy set and the
    analysis engine)."""

    SET_BOUNDARY = "set_boundary"
    REQUEST_PAYMENT = "request_payment"
    NEGOTIATE_DEADLINE = "negotiate_deadline"
    CLARIFY_REQUIREMENTS = "clarify_requirements"
    RESPOND_TO_CRITICISM = "respond_to_criticism"
    NEGOTIATE_BUDGET = "negotiate_budget"
    RESOLVE_DISAGREEMENT = "resolve_disagreement"


# ---------------------------------------------------------------- auth


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=100)

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_RE.match(value):
            raise ValueError("Enter a valid email address.")
        return value


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return value.strip().lower()


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return value.strip().lower()


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)
    new_password: str = Field(..., min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str
    status: str
    created_at: datetime
    # Populated from the ORM row but never serialised: lets the computed
    # fields below read them without exposing a password hash.
    password_hash: str | None = Field(default=None, exclude=True)
    google_sub: str | None = Field(default=None, exclude=True)

    @computed_field
    @property
    def has_password(self) -> bool:
        """False for accounts created with Google sign-in (no password set)."""
        return self.password_hash is not None

    @computed_field
    @property
    def google_linked(self) -> bool:
        """True when a Google account is linked to this account."""
        return self.google_sub is not None


class AuthResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: UserOut


class ForgotPasswordResponse(BaseModel):
    message: str
    # Returned ONLY in development (see services/auth.py). Production must
    # deliver the token by email and never put it in a response.
    reset_token: str | None = None


class ProvidersResponse(BaseModel):
    """GET /auth/providers: which external sign-in providers are configured
    (empty when none are — the frontend hides the buttons then)."""

    providers: list[str] = []


class ProfilePatchRequest(BaseModel):
    """PATCH /auth/me: display name and/or password change.

    Changing the password requires the current password, except for
    accounts created with Google sign-in, which have no password yet —
    the service enforces that per account (see services/auth.py
    ``update_profile``), so this schema only rejects empty updates.
    """

    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    current_password: str | None = Field(default=None, min_length=1, max_length=128)
    new_password: str | None = Field(default=None, min_length=8, max_length=128)

    @model_validator(mode="after")
    def check_password_change(self) -> "ProfilePatchRequest":
        if (
            self.current_password is not None
            and self.new_password is None
            and self.display_name is None
        ):
            raise ValueError("Nothing to update.")
        return self


class GenericMessageResponse(BaseModel):
    message: str


# ---------------------------------------------------------------- analyses


class ContextMessage(BaseModel):
    role: str = Field(default="prior", max_length=20)
    text: str = Field(..., min_length=1, max_length=2000)


class ContextFactors(BaseModel):
    power: ContextLevel = "unknown"
    social_distance: ContextLevel = "unknown"
    imposition: ContextLevel = "unknown"


TONE_OPTIONS = ("Professional", "Friendly", "Diplomatic", "Assertive", "Empathetic")
DIRECTNESS_OPTIONS = ("direct", "balanced", "gentle")


class AnalysisCreateRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_context: list[Union[str, ContextMessage]] = Field(default_factory=list)
    goal: Goal
    context: ContextFactors = Field(default_factory=ContextFactors)
    # Draft styling (FR-09): tone + directness change the draft text the
    # engine returns; they never change intent/tone/strategy.
    tone: str = "Diplomatic"
    directness: str = "balanced"

    @field_validator("tone")
    @classmethod
    def check_tone(cls, value: str) -> str:
        if value not in TONE_OPTIONS:
            raise ValueError(f"tone must be one of {', '.join(TONE_OPTIONS)}.")
        return value

    @field_validator("directness")
    @classmethod
    def check_directness(cls, value: str) -> str:
        if value not in DIRECTNESS_OPTIONS:
            raise ValueError(
                f"directness must be one of {', '.join(DIRECTNESS_OPTIONS)}."
            )
        return value

    @model_validator(mode="before")
    @classmethod
    def normalise_context(cls, data: Any) -> Any:
        """Accept plain strings in ``conversation_context`` and normalise
        every item to {"role": ..., "text": ...}."""
        if isinstance(data, dict):
            items = data.get("conversation_context")
            if isinstance(items, list):
                normalised = []
                for item in items:
                    if isinstance(item, str):
                        normalised.append({"role": "prior", "text": item})
                    else:
                        normalised.append(item)
                data = {**data, "conversation_context": normalised}
        return data


class IntentOut(BaseModel):
    label: str
    confidence: float


class ToneOut(BaseModel):
    label: str
    confidence: float


class FtaOut(BaseModel):
    detected: bool
    description: str


class StrategyOut(BaseModel):
    label: str
    rationale: str


class ContextMessageOut(BaseModel):
    role: str
    text: str


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    created_at: datetime
    goal: str
    message: str
    conversation_context: list[ContextMessageOut] = []
    context_factors: ContextFactors
    intent: IntentOut
    tone: ToneOut
    fta: FtaOut
    face_concern: list[str]
    strategy: StrategyOut
    draft: str
    limitations: list[str]
    model_version: str


class AnalysisListResponse(BaseModel):
    items: list[AnalysisOut]
    total: int
    limit: int
    offset: int


class AnalysisStatsOut(BaseModel):
    """GET /analyses/stats: dashboard aggregates, computed server-side
    so the dashboard is right beyond the first 100 analyses."""

    total: int
    this_week: int
    avg_intent_confidence: float | None
    fta_count: int
    top_intent: str | None
    top_strategy: str | None
    # 30-day activity in 5 buckets of 6 days, oldest first (matches the
    # dashboard chart).
    buckets_30d: list[int]


class RegenerateRequest(BaseModel):
    """POST /analyses/{id}/regenerate: re-run the engine on the same
    analysis with optional new tone/directness. Defaults keep the
    current styling."""

    tone: str | None = None
    directness: str | None = None

    @field_validator("tone")
    @classmethod
    def check_tone(cls, value: str | None) -> str | None:
        if value is not None and value not in TONE_OPTIONS:
            raise ValueError(f"tone must be one of {', '.join(TONE_OPTIONS)}.")
        return value

    @field_validator("directness")
    @classmethod
    def check_directness(cls, value: str | None) -> str | None:
        if value is not None and value not in DIRECTNESS_OPTIONS:
            raise ValueError(
                f"directness must be one of {', '.join(DIRECTNESS_OPTIONS)}."
            )
        return value


# ---------------------------------------------------------------- drafts


class DraftCreateRequest(BaseModel):
    draft_text: str = Field(..., min_length=1, max_length=2000)
    tone_setting: str | None = Field(default=None, max_length=40)
    directness_setting: str | None = Field(default=None, max_length=40)


class DraftPatchRequest(BaseModel):
    draft_text: str | None = Field(default=None, min_length=1, max_length=2000)
    tone_setting: str | None = Field(default=None, max_length=40)
    directness_setting: str | None = Field(default=None, max_length=40)


class DraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    analysis_id: str
    user_id: str
    draft_text: str
    tone_setting: str | None
    directness_setting: str | None
    created_at: datetime
    updated_at: datetime


class DraftListResponse(BaseModel):
    items: list[DraftOut]
    total: int


# ---------------------------------------------------------------- templates


class TemplateCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    category: str = Field(..., min_length=1, max_length=60)
    body: str = Field(..., min_length=1, max_length=2000)


class TemplatePatchRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, min_length=1, max_length=60)
    body: str | None = Field(default=None, min_length=1, max_length=2000)


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    title: str
    category: str
    body: str
    created_at: datetime
    updated_at: datetime


class TemplateListResponse(BaseModel):
    items: list[TemplateOut]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------- privacy


class ConsentRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    consent_type: str
    version: str
    granted: bool
    created_at: datetime


class PrivacyExportResponse(BaseModel):
    user: UserOut
    analyses: list[AnalysisOut]
    drafts: list[DraftOut]
    templates: list[TemplateOut]
    consent_records: list[ConsentRecordOut]


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=128)
