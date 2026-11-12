"""Template routes (FR-11): full CRUD under /api/v1/templates."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from app.api.v1.deps import get_current_user, get_db
from app.models import User
from app.schemas import (
    GenericMessageResponse,
    TemplateCreateRequest,
    TemplateListResponse,
    TemplateOut,
    TemplatePatchRequest,
)
from app.services.templates import (
    create_template,
    delete_template,
    get_template,
    list_templates,
    update_template,
)

router = APIRouter(tags=["templates"])


@router.post("/templates", response_model=TemplateOut, status_code=201)
def create(
    payload: TemplateCreateRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> TemplateOut:
    return TemplateOut.model_validate(
        create_template(
            db, user=user, title=payload.title, category=payload.category, body=payload.body
        )
    )


@router.get("/templates", response_model=TemplateListResponse)
def list_(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> TemplateListResponse:
    items, total = list_templates(db, user=user, limit=limit, offset=offset)
    return TemplateListResponse(
        items=[TemplateOut.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/templates/{template_id}", response_model=TemplateOut)
def read(
    template_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> TemplateOut:
    return TemplateOut.model_validate(
        get_template(db, user=user, template_id=template_id)
    )


@router.patch("/templates/{template_id}", response_model=TemplateOut)
def patch(
    template_id: str,
    payload: TemplatePatchRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> TemplateOut:
    return TemplateOut.model_validate(
        update_template(
            db,
            user=user,
            template_id=template_id,
            title=payload.title,
            category=payload.category,
            body=payload.body,
        )
    )


@router.delete("/templates/{template_id}", response_model=GenericMessageResponse)
def delete(
    template_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> GenericMessageResponse:
    delete_template(db, user=user, template_id=template_id)
    return GenericMessageResponse(message="Template deleted.")
