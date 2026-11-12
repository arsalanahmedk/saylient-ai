"""Analysis service: create / list / read / delete analyses.

Ownership is checked on every access: a resource that does not exist or
belongs to another user is reported as NOT_FOUND (never as FORBIDDEN),
so callers cannot probe for other users' data (see 06-api/API_SPEC.md).

The analysis engine itself lives in app/services/analysis_engine.py and
is deliberately provider-free (rule-based baseline, model_version
"prototype-0.1"). A real LLM provider adapter belongs behind the same
``analyze`` call site, per 07-engineering/BACKEND_GUIDE.md.
"""

from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.core.errors import NotFoundError
from app.models import Analysis, AnalysisContext, User
from app.schemas import ContextFactors
from app.services.analysis_engine import analyze


def _analysis_to_dict(analysis: Analysis) -> dict:
    contexts = sorted(analysis.contexts, key=lambda c: c.position)
    return {
        "id": analysis.id,
        "user_id": analysis.user_id,
        "created_at": analysis.created_at,
        "goal": analysis.goal,
        "message": analysis.input_text,
        "conversation_context": [
            {"role": c.role, "text": c.text} for c in contexts
        ],
        "context_factors": ContextFactors(
            power=analysis.context_power,
            social_distance=analysis.context_social_distance,
            imposition=analysis.context_imposition,
        ),
        "intent": {
            "label": analysis.intent_label,
            "confidence": analysis.intent_confidence,
        },
        "tone": {
            "label": analysis.tone_label,
            "confidence": analysis.tone_confidence,
        },
        "fta": {
            "detected": analysis.fta_detected,
            "description": analysis.fta_description,
        },
        "face_concern": list(analysis.face_concern or []),
        "strategy": {"label": analysis.strategy_label, "rationale": analysis.rationale},
        "draft": analysis.draft,
        "limitations": list(analysis.limitations or []),
        "model_version": analysis.model_version,
    }


def create_analysis(
    db: DbSession,
    *,
    user: User,
    message: str,
    conversation_context: list[dict],
    goal: str,
    context: ContextFactors,
) -> dict:
    result = analyze(
        message,
        goal,
        {
            "power": context.power,
            "social_distance": context.social_distance,
            "imposition": context.imposition,
        },
    )
    analysis = Analysis(
        user_id=user.id,
        input_text=message,
        context_text=(
            "\n".join(item["text"] for item in conversation_context)
            if conversation_context
            else None
        ),
        goal=goal,
        context_power=context.power,
        context_social_distance=context.social_distance,
        context_imposition=context.imposition,
        intent_label=result["intent"]["label"],
        intent_confidence=result["intent"]["confidence"],
        tone_label=result["tone"]["label"],
        tone_confidence=result["tone"]["confidence"],
        fta_detected=result["fta"]["detected"],
        fta_description=result["fta"]["description"],
        face_concern=result["face_concern"],
        strategy_label=result["strategy"]["label"],
        rationale=result["strategy"]["rationale"],
        draft=result["draft"],
        limitations=result["limitations"],
        model_version=result["model_version"],
    )
    db.add(analysis)
    db.flush()
    for position, item in enumerate(conversation_context):
        db.add(
            AnalysisContext(
                analysis_id=analysis.id,
                role=item.get("role", "prior"),
                text=item["text"],
                position=position,
            )
        )
    db.commit()
    db.refresh(analysis)
    return _analysis_to_dict(analysis)


def _get_owned_analysis(db: DbSession, *, user: User, analysis_id: str) -> Analysis:
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if analysis is None or analysis.user_id != user.id:
        raise NotFoundError("The requested analysis was not found.")
    return analysis


def get_analysis(db: DbSession, *, user: User, analysis_id: str) -> dict:
    return _analysis_to_dict(_get_owned_analysis(db, user=user, analysis_id=analysis_id))


def list_analyses(
    db: DbSession, *, user: User, limit: int, offset: int
) -> tuple[list[dict], int]:
    query = (
        db.query(Analysis)
        .filter(Analysis.user_id == user.id)
        .order_by(Analysis.created_at.desc())
    )
    total = query.count()
    rows = query.limit(limit).offset(offset).all()
    return [_analysis_to_dict(row) for row in rows], total


def delete_analysis(db: DbSession, *, user: User, analysis_id: str) -> None:
    analysis = _get_owned_analysis(db, user=user, analysis_id=analysis_id)
    # Drafts and context rows cascade (see app/models.py).
    db.delete(analysis)
    db.commit()
