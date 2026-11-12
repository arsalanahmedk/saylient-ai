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

from datetime import datetime, timedelta

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
    tone: str = "Diplomatic",
    directness: str = "balanced",
) -> dict:
    result = analyze(
        message,
        goal,
        {
            "power": context.power,
            "social_distance": context.social_distance,
            "imposition": context.imposition,
        },
        draft_tone=tone,
        draft_directness=directness,
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


def regenerate_analysis(
    db: DbSession,
    *,
    user: User,
    analysis_id: str,
    tone: str | None = None,
    directness: str | None = None,
) -> dict:
    """Re-run the engine on an existing analysis, in place.

    Regenerate updates the stored row (intent, tone, FTA, strategy,
    draft, limitations, model version) and returns it. It never creates
    a new analysis, so history does not gain a duplicate row. Tone and
    directness only restyle the draft; the analysis inputs (message,
    goal, context) are unchanged.
    """
    analysis = _get_owned_analysis(db, user=user, analysis_id=analysis_id)
    result = analyze(
        analysis.input_text,
        analysis.goal,
        {
            "power": analysis.context_power,
            "social_distance": analysis.context_social_distance,
            "imposition": analysis.context_imposition,
        },
        draft_tone=tone or "Diplomatic",
        draft_directness=directness or "balanced",
    )
    analysis.intent_label = result["intent"]["label"]
    analysis.intent_confidence = result["intent"]["confidence"]
    analysis.tone_label = result["tone"]["label"]
    analysis.tone_confidence = result["tone"]["confidence"]
    analysis.fta_detected = result["fta"]["detected"]
    analysis.fta_description = result["fta"]["description"]
    analysis.face_concern = result["face_concern"]
    analysis.strategy_label = result["strategy"]["label"]
    analysis.rationale = result["strategy"]["rationale"]
    analysis.draft = result["draft"]
    analysis.limitations = result["limitations"]
    analysis.model_version = result["model_version"]
    db.commit()
    db.refresh(analysis)
    return _analysis_to_dict(analysis)


def get_analysis_stats(db: DbSession, *, user: User) -> dict:
    """Dashboard aggregates, computed server-side (FR-10 / PRD dashboard).

    Buckets are the 30-day activity in 5 buckets of 6 days, oldest
    first — the same shape the dashboard chart already draws.
    """
    from sqlalchemy import func

    from app.core.security import utcnow

    now = utcnow()
    week_ago = now - timedelta(days=7)
    rows = (
        db.query(Analysis)
        .filter(Analysis.user_id == user.id)
        .order_by(Analysis.created_at.desc())
        .all()
    )
    total = len(rows)
    this_week = sum(
        1 for row in rows if row.created_at and _aware(row.created_at) >= week_ago
    )
    confidences = [
        row.intent_confidence
        for row in rows
        if row.intent_confidence is not None
    ]
    avg_confidence = (
        round(sum(confidences) / len(confidences), 2) if confidences else None
    )
    fta_count = sum(1 for row in rows if row.fta_detected)

    def _top(field: str) -> str | None:
        query = (
            db.query(getattr(Analysis, field), func.count(Analysis.id))
            .filter(Analysis.user_id == user.id)
            .group_by(getattr(Analysis, field))
            .order_by(func.count(Analysis.id).desc())
            .first()
        )
        return query[0] if query else None

    buckets = [0, 0, 0, 0, 0]
    for row in rows:
        if not row.created_at:
            continue
        days = (now - _aware(row.created_at)).days
        if 0 <= days < 30:
            buckets[4 - days // 6] += 1
    return {
        "total": total,
        "this_week": this_week,
        "avg_intent_confidence": avg_confidence,
        "fta_count": fta_count,
        "top_intent": _top("intent_label"),
        "top_strategy": _top("strategy_label"),
        "buckets_30d": buckets,
    }


def _aware(value) -> "datetime":
    """SQLite can hand back naive datetimes; compare safely in UTC."""
    from app.core.security import ensure_aware

    return ensure_aware(value)


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
