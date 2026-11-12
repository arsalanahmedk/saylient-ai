"""Draft service: create / update / delete drafts (FR-09).

Drafts belong to an analysis and to the user who owns that analysis.
Ownership is checked on every access; absent or foreign resources are
reported as NOT_FOUND so callers cannot probe for other users' data.
"""

from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.core.errors import NotFoundError
from app.models import Draft, User
from app.services.analyses import _get_owned_analysis


def _draft_to_dict(draft: Draft) -> dict:
    return {
        "id": draft.id,
        "analysis_id": draft.analysis_id,
        "user_id": draft.user_id,
        "draft_text": draft.draft_text,
        "tone_setting": draft.tone_setting,
        "directness_setting": draft.directness_setting,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


def list_drafts(db: DbSession, *, user: User, analysis_id: str) -> list[dict]:
    """All saved drafts for one analysis the user owns, newest first."""
    _get_owned_analysis(db, user=user, analysis_id=analysis_id)
    rows = (
        db.query(Draft)
        .filter(Draft.analysis_id == analysis_id, Draft.user_id == user.id)
        .order_by(Draft.updated_at.desc())
        .all()
    )
    return [_draft_to_dict(draft) for draft in rows]


def create_draft(
    db: DbSession,
    *,
    user: User,
    analysis_id: str,
    draft_text: str,
    tone_setting: str | None,
    directness_setting: str | None,
) -> dict:
    _get_owned_analysis(db, user=user, analysis_id=analysis_id)
    draft = Draft(
        analysis_id=analysis_id,
        user_id=user.id,
        draft_text=draft_text,
        tone_setting=tone_setting,
        directness_setting=directness_setting,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return _draft_to_dict(draft)


def _get_owned_draft(db: DbSession, *, user: User, draft_id: str) -> Draft:
    draft = db.query(Draft).filter(Draft.id == draft_id).first()
    if draft is None or draft.user_id != user.id:
        raise NotFoundError("The requested draft was not found.")
    return draft


def update_draft(
    db: DbSession,
    *,
    user: User,
    draft_id: str,
    draft_text: str | None,
    tone_setting: str | None,
    directness_setting: str | None,
) -> dict:
    draft = _get_owned_draft(db, user=user, draft_id=draft_id)
    if draft_text is not None:
        draft.draft_text = draft_text
    if tone_setting is not None:
        draft.tone_setting = tone_setting
    if directness_setting is not None:
        draft.directness_setting = directness_setting
    db.commit()
    db.refresh(draft)
    return _draft_to_dict(draft)


def delete_draft(db: DbSession, *, user: User, draft_id: str) -> None:
    draft = _get_owned_draft(db, user=user, draft_id=draft_id)
    db.delete(draft)
    db.commit()
