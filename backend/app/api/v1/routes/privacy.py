"""Privacy routes (FR-12): data export and account deletion."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DbSession

from app.api.v1.deps import get_current_user, get_db
from app.models import User
from app.schemas import DeleteAccountRequest, GenericMessageResponse, PrivacyExportResponse
from app.services.privacy import delete_account, export_user_data

router = APIRouter(tags=["privacy"])


@router.get("/privacy/export", response_model=PrivacyExportResponse)
def export(
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> PrivacyExportResponse:
    return PrivacyExportResponse.model_validate(export_user_data(db, user=user))


@router.post("/privacy/delete-account", response_model=GenericMessageResponse)
def delete(
    payload: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> GenericMessageResponse:
    delete_account(db, user=user, password=payload.password)
    return GenericMessageResponse(message="Your account and data have been deleted.")
