"""Privacy service: data export and account deletion (FR-12).

Export returns everything the account owns: profile, analyses (with
their results), drafts, templates and consent records. Security events
are deliberately NOT exported — they are an internal audit trail.

Account deletion removes the user row; analyses, drafts, templates,
sessions and consent records cascade (see app/models.py). Security events
keep their rows with ``user_id`` set to NULL so the audit trail survives
without identifying the deleted account.
"""

from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.core.errors import UnauthenticatedError
from app.core.security import verify_password
from app.models import User
from app.services.analyses import _analysis_to_dict
from app.services.drafts import _draft_to_dict
from app.services.templates import _template_to_dict


def export_user_data(db: DbSession, *, user: User) -> dict:
    analyses = sorted(user.analyses, key=lambda a: a.created_at, reverse=True)
    drafts = sorted(user.drafts, key=lambda d: d.updated_at, reverse=True)
    templates = sorted(user.templates, key=lambda t: t.updated_at, reverse=True)
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "status": user.status,
            "created_at": user.created_at,
        },
        "analyses": [_analysis_to_dict(a) for a in analyses],
        "drafts": [_draft_to_dict(d) for d in drafts],
        "templates": [_template_to_dict(t) for t in templates],
        "consent_records": [
            {
                "id": c.id,
                "consent_type": c.consent_type,
                "version": c.version,
                "granted": c.granted,
                "created_at": c.created_at,
            }
            for c in user.consent_records
        ],
    }


def delete_account(db: DbSession, *, user: User, password: str) -> None:
    if not verify_password(password, user.password_hash):
        raise UnauthenticatedError("The password is incorrect.")
    db.delete(user)
    db.commit()
