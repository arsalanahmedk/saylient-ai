"""Analysis and draft routes (06-api/API_SPEC.md, FR-02..FR-10)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DbSession

from app.api.v1.deps import get_current_user, get_db, get_rate_limited_user
from app.models import User
from app.schemas import (
    AnalysisCreateRequest,
    AnalysisListResponse,
    AnalysisOut,
    AnalysisStatsOut,
    DraftCreateRequest,
    DraftListResponse,
    DraftOut,
    DraftPatchRequest,
    GenericMessageResponse,
    RegenerateRequest,
)
from app.services.analyses import (
    create_analysis,
    delete_analysis,
    get_analysis,
    get_analysis_stats,
    list_analyses,
    regenerate_analysis,
)
from app.services.drafts import create_draft, delete_draft, list_drafts, update_draft

router = APIRouter(tags=["analyses"])


@router.post("/analyses", response_model=AnalysisOut, status_code=201)
def create(
    payload: AnalysisCreateRequest,
    user: User = Depends(get_rate_limited_user),
    db: DbSession = Depends(get_db),
) -> AnalysisOut:
    result = create_analysis(
        db,
        user=user,
        message=payload.message,
        conversation_context=[
            item.model_dump() for item in payload.conversation_context
        ],
        goal=payload.goal.value,
        context=payload.context,
        tone=payload.tone,
        directness=payload.directness,
    )
    return AnalysisOut.model_validate(result)


@router.get("/analyses/stats", response_model=AnalysisStatsOut)
def stats(
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> AnalysisStatsOut:
    """Dashboard aggregates (total, this-week, avg confidence, FTA count,
    top intent/strategy, 30-day buckets), computed server-side.

    Registered before /analyses/{analysis_id} so "stats" is not matched
    as an analysis id.
    """
    return AnalysisStatsOut.model_validate(get_analysis_stats(db, user=user))


@router.get("/analyses", response_model=AnalysisListResponse)
def list_(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> AnalysisListResponse:
    items, total = list_analyses(db, user=user, limit=limit, offset=offset)
    return AnalysisListResponse(
        items=[AnalysisOut.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
def read(
    analysis_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> AnalysisOut:
    return AnalysisOut.model_validate(
        get_analysis(db, user=user, analysis_id=analysis_id)
    )


@router.post("/analyses/{analysis_id}/regenerate", response_model=AnalysisOut)
def regenerate(
    analysis_id: str,
    payload: RegenerateRequest,
    user: User = Depends(get_rate_limited_user),
    db: DbSession = Depends(get_db),
) -> AnalysisOut:
    """Re-run the engine on an existing analysis, in place (FR-09).

    Updates the stored row and returns it; no new analysis is created,
    so history does not gain a duplicate row. Tone/directness only
    restyle the draft.
    """
    return AnalysisOut.model_validate(
        regenerate_analysis(
            db,
            user=user,
            analysis_id=analysis_id,
            tone=payload.tone,
            directness=payload.directness,
        )
    )


@router.delete("/analyses/{analysis_id}", response_model=GenericMessageResponse)
def delete(
    analysis_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> GenericMessageResponse:
    delete_analysis(db, user=user, analysis_id=analysis_id)
    return GenericMessageResponse(message="Analysis deleted.")


@router.get(
    "/analyses/{analysis_id}/drafts", response_model=DraftListResponse
)
def list_drafts_for_analysis(
    analysis_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> DraftListResponse:
    items = list_drafts(db, user=user, analysis_id=analysis_id)
    return DraftListResponse(
        items=[DraftOut.model_validate(item) for item in items],
        total=len(items),
    )


@router.post(
    "/analyses/{analysis_id}/drafts", response_model=DraftOut, status_code=201
)
def create_draft_for_analysis(
    analysis_id: str,
    payload: DraftCreateRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> DraftOut:
    return DraftOut.model_validate(
        create_draft(
            db,
            user=user,
            analysis_id=analysis_id,
            draft_text=payload.draft_text,
            tone_setting=payload.tone_setting,
            directness_setting=payload.directness_setting,
        )
    )


@router.patch("/drafts/{draft_id}", response_model=DraftOut)
def patch_draft(
    draft_id: str,
    payload: DraftPatchRequest,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> DraftOut:
    return DraftOut.model_validate(
        update_draft(
            db,
            user=user,
            draft_id=draft_id,
            draft_text=payload.draft_text,
            tone_setting=payload.tone_setting,
            directness_setting=payload.directness_setting,
        )
    )


@router.delete("/drafts/{draft_id}", response_model=GenericMessageResponse)
def delete_draft_route(
    draft_id: str,
    user: User = Depends(get_current_user),
    db: DbSession = Depends(get_db),
) -> GenericMessageResponse:
    delete_draft(db, user=user, draft_id=draft_id)
    return GenericMessageResponse(message="Draft deleted.")
