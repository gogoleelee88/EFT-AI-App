from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from services.auth_service import AuthService
from config.settings import get_settings
from backend.spec_loop.behavior.schemas import (
    ActivityCandidateIn,
    ActivityCandidateOut,
    ClarificationAnswerIn,
    ClarificationAnswerOut,
    ClarificationQuestionCreateIn,
    ClarificationQuestionOut,
    ClarificationQuestionTransitionOut,
    TimelineSegmentListOut,
    TimelineSegmentOut,
    TimelineSegmentPatchIn,
)
from backend.spec_loop.behavior.service import (
    answer_question,
    create_question_if_needed,
    create_question_from_candidate,
    dismiss_question,
    expire_overdue_questions,
    ingest_candidate,
    list_pending_questions,
    list_timeline_segments,
    patch_timeline_segment_label,
)

router = APIRouter(prefix="/behavior", tags=["behavior"])
auth_service = AuthService()


def _resolve_recovery_url(path: str = "/signal-inbox") -> str:
    settings = get_settings()
    dashboard_url = (settings.FRONTEND_DASHBOARD_URL or "").strip()
    if not dashboard_url:
        return ""

    base = dashboard_url.rstrip("/")
    if base.endswith("/dashboard"):
        base = base[:-len("/dashboard")]
    if not base:
        return ""

    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{base}{normalized_path}"


def _decode_user_id_from_cookie(access_token: Optional[str]) -> Optional[str]:
    if not access_token:
        return None
    try:
        payload = auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            return None
        sub = payload.get("sub")
        return sub if isinstance(sub, str) and sub.strip() else None
    except Exception:
        return None


def _resolve_user_id(explicit_user_id: Optional[str], access_token: Optional[str]) -> Optional[str]:
    cookie_user_id = _decode_user_id_from_cookie(access_token)
    if explicit_user_id and cookie_user_id and explicit_user_id != cookie_user_id:
        raise HTTPException(status_code=403, detail="user_id mismatch")
    return explicit_user_id or cookie_user_id


@router.post("/candidates", response_model=ActivityCandidateOut)
def post_candidate(
    body: ActivityCandidateIn,
    user_id: Optional[str] = Query(None),
    auto_ask: bool = Query(True),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> ActivityCandidateOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    row, dedupe_hit = ingest_candidate(db, body, user_id=resolved_user_id)
    auto_question_id: Optional[int] = None
    auto_question_created = False
    if auto_ask:
        question, created = create_question_from_candidate(db, row, user_id=resolved_user_id)
        if question:
            auto_question_id = question.question_id
            auto_question_created = not created
    return ActivityCandidateOut(
        candidate_id=row.candidate_id,
        dedupe_hit=dedupe_hit,
        user_id=row.user_id,
        day_id=row.day_id,
        focus_session_id=row.focus_session_id,
        schedule_id=row.schedule_id,
        schedule_type=row.schedule_type,
        ts_start=row.ts_start,
        ts_end=row.ts_end,
        top1=row.top1,
        confidence=row.confidence,
        margin_top1_top2=row.margin_top1_top2,
        mismatch_score=row.mismatch_score,
        auto_question_id=auto_question_id,
        auto_question_created=auto_question_created,
        created_at=row.created_at,
    )


@router.post("/questions", response_model=ClarificationQuestionOut)
def post_question(
    body: ClarificationQuestionCreateIn,
    user_id: Optional[str] = Query(None),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> ClarificationQuestionOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    row, cooldown_skipped = create_question_if_needed(db, body, user_id=resolved_user_id)
    return ClarificationQuestionOut(
        question_id=row.question_id,
        user_id=row.user_id,
        candidate_id=row.candidate_id,
        focus_session_id=getattr(row, "focus_session_id", None),
        schedule_id=getattr(row, "schedule_id", None),
        schedule_type=getattr(row, "schedule_type", None),
        status=row.status,
        question_text=row.question_text,
        trigger_reasons=list(row.trigger_reasons or []),
        recovery_url=_resolve_recovery_url(),
        cooldown_key=row.cooldown_key,
        asked_at=row.asked_at,
        expires_at=row.expires_at,
        cooldown_skipped=cooldown_skipped,
    )


@router.post("/questions/{question_id}/answer", response_model=ClarificationAnswerOut)
def post_question_answer(
    question_id: int,
    body: ClarificationAnswerIn,
    user_id: Optional[str] = Query(None),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> ClarificationAnswerOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    question, label_row, segment = answer_question(db, question_id, body, user_id=resolved_user_id)
    return ClarificationAnswerOut(
        question_id=question.question_id,
        status=question.status,
        label_id=label_row.label_id,
        timeline_segment_id=segment.segment_id,
        final_label=segment.final_label,
    )


@router.post("/questions/{question_id}/dismiss", response_model=ClarificationQuestionTransitionOut)
def post_question_dismiss(
    question_id: int,
    user_id: Optional[str] = Query(None),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> ClarificationQuestionTransitionOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    row = dismiss_question(db, question_id=question_id, user_id=resolved_user_id)
    return ClarificationQuestionTransitionOut(question_id=row.question_id, status=row.status)


@router.post("/questions/expire", response_model=dict)
def post_expire_questions(
    user_id: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> dict:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    expired = expire_overdue_questions(db, user_id=resolved_user_id, limit=limit)
    return {"expired_count": expired}


@router.get("/questions/pending", response_model=list[ClarificationQuestionOut])
def get_pending_questions(
    user_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> list[ClarificationQuestionOut]:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    if not resolved_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    rows = list_pending_questions(db, user_id=resolved_user_id, limit=limit)
    return [
        ClarificationQuestionOut(
            question_id=row.question_id,
            user_id=row.user_id,
            candidate_id=row.candidate_id,
            focus_session_id=getattr(row, "focus_session_id", None),
            schedule_id=getattr(row, "schedule_id", None),
            schedule_type=getattr(row, "schedule_type", None),
            status=row.status,
            question_text=row.question_text,
            trigger_reasons=list(row.trigger_reasons or []),
            recovery_url=_resolve_recovery_url(),
            cooldown_key=row.cooldown_key,
            asked_at=row.asked_at,
            expires_at=row.expires_at,
            cooldown_skipped=False,
        )
        for row in rows
    ]


@router.get("/timeline", response_model=TimelineSegmentListOut)
def get_timeline(
    user_id: Optional[str] = Query(None, min_length=1),
    from_ts: Optional[datetime] = Query(None),
    to_ts: Optional[datetime] = Query(None),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> TimelineSegmentListOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    if not resolved_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    rows = list_timeline_segments(db, user_id=resolved_user_id, from_ts=from_ts, to_ts=to_ts)
    return TimelineSegmentListOut(items=[TimelineSegmentOut.model_validate(row) for row in rows])


@router.patch("/timeline/{segment_id}", response_model=TimelineSegmentOut)
def patch_timeline(
    segment_id: int,
    body: TimelineSegmentPatchIn,
    user_id: Optional[str] = Query(None),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> TimelineSegmentOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    row = patch_timeline_segment_label(db, segment_id, body, user_id=resolved_user_id)
    return TimelineSegmentOut.model_validate(row)



