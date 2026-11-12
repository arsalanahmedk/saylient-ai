"""Template service: CRUD for saved message templates (FR-11).

Templates are per-user; ownership is checked on every access. Template
titles are unique per user so the UI can address them by title safely.
"""

from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.core.errors import ConflictError, NotFoundError
from app.models import Template, User


def _template_to_dict(template: Template) -> dict:
    return {
        "id": template.id,
        "user_id": template.user_id,
        "title": template.title,
        "category": template.category,
        "body": template.body,
        "created_at": template.created_at,
        "updated_at": template.updated_at,
    }


def create_template(
    db: DbSession, *, user: User, title: str, category: str, body: str
) -> dict:
    existing = (
        db.query(Template)
        .filter(Template.user_id == user.id, Template.title == title)
        .first()
    )
    if existing is not None:
        raise ConflictError(f"A template named {title!r} already exists.")
    template = Template(user_id=user.id, title=title, category=category, body=body)
    db.add(template)
    db.commit()
    db.refresh(template)
    return _template_to_dict(template)


def _get_owned_template(db: DbSession, *, user: User, template_id: str) -> Template:
    template = db.query(Template).filter(Template.id == template_id).first()
    if template is None or template.user_id != user.id:
        raise NotFoundError("The requested template was not found.")
    return template


def get_template(db: DbSession, *, user: User, template_id: str) -> dict:
    return _template_to_dict(_get_owned_template(db, user=user, template_id=template_id))


def list_templates(
    db: DbSession, *, user: User, limit: int, offset: int
) -> tuple[list[dict], int]:
    query = (
        db.query(Template)
        .filter(Template.user_id == user.id)
        .order_by(Template.updated_at.desc())
    )
    total = query.count()
    rows = query.limit(limit).offset(offset).all()
    return [_template_to_dict(row) for row in rows], total


def update_template(
    db: DbSession,
    *,
    user: User,
    template_id: str,
    title: str | None,
    category: str | None,
    body: str | None,
) -> dict:
    template = _get_owned_template(db, user=user, template_id=template_id)
    if title is not None and title != template.title:
        clash = (
            db.query(Template)
            .filter(
                Template.user_id == user.id,
                Template.title == title,
                Template.id != template.id,
            )
            .first()
        )
        if clash is not None:
            raise ConflictError(f"A template named {title!r} already exists.")
        template.title = title
    if category is not None:
        template.category = category
    if body is not None:
        template.body = body
    db.commit()
    db.refresh(template)
    return _template_to_dict(template)


def delete_template(db: DbSession, *, user: User, template_id: str) -> None:
    template = _get_owned_template(db, user=user, template_id=template_id)
    db.delete(template)
    db.commit()
