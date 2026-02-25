from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha1
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.spec_loop.execution_log_service import log_execution
from backend.spec_loop.models import (
    ActivityCandidate,
    ClarificationQuestion,
    DayPlan,
    TimelineSegment,
    UserLabel,
)
from backend.spec_loop.focus_session.service import (
    get_active_focus_session,
    get_focus_session_by_id,
    mark_soft_nudge_issued,
    update_focus_session_from_candidate,
)
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType


DEFAULT_QUESTION_TEXT = "혹시 지금 하고 있는 활동이 맞나요?"
FOCUS_SOFT_NUDGE_QUESTION_TEXT = "자리에서 이동하셨어요. 괜찮으신가요?"
FOCUS_SOFT_NUDGE_EXPECTED_PREFIX = "AI 분류 결과"
FOCUS_SOFT_NUDGE_STATIONARY_TEXT = "운동 중인데 움직임이 줄었어요. 괜찮으신가요?"
FOCUS_SOFT_NUDGE_REASON = "focus_soft_nudge"
FOCUS_SOFT_NUDGE_COOLDOWN_KEY_PREFIX = "focus_soft_nudge"
CONFIDENCE_THRESHOLD = 0.62
MARGIN_THRESHOLD = 0.12
MISMATCH_THRESHOLD = 0.65
DEFAULT_DAILY_QUESTION_LIMIT = 8
DEFAULT_COOLDOWN_MINUTES = 20
TYPE_COOLDOWN_MINUTES: dict[str, int] = {
    "candidate:STILL+SCREEN_ON": 20,
    "candidate:STILL+NO_MOTION": 30,
    "candidate:CALL_POSTURE": 15,
    "candidate:LIE_POSTURE": 25,
}
DEFAULT_AUTO_DAYPLAN_MODE = 70
QUESTION_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "asked": {"answered", "dismissed", "expired"},
    "answered": set(),
    "dismissed": set(),
    "expired": set(),
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_utc(ts: datetime) -> datetime:
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def _ensure_user(body_user_id: Optional[str], user_id: Optional[str]) -> Optional[str]:
    if body_user_id and user_id and body_user_id != user_id:
        raise HTTPException(status_code=403, detail="user_id mismatch")
    return body_user_id or user_id


def _transition_question_status(question: ClarificationQuestion, next_status: str, now: datetime) -> None:
    if next_status not in QUESTION_ALLOWED_TRANSITIONS.get(question.status, set()):
        raise HTTPException(status_code=409, detail=f"question is not transitionable to {next_status}")
    question.status = next_status
    if next_status == "answered":
        question.answered_at = now
    elif next_status == "dismissed":
        question.dismissed_at = now


def _build_candidate_dedupe_key(
    user_id: Optional[str],
    ts_start: datetime,
    ts_end: datetime,
    top1: str,
) -> str:
    base = f"{user_id or 'anon'}|{_safe_utc(ts_start).isoformat()}|{_safe_utc(ts_end).isoformat()}|{top1}"
    return sha1(base.encode("utf-8")).hexdigest()


def _is_expired(expires_at: Optional[datetime], now: datetime) -> bool:
    if not expires_at:
        return False
    return _safe_utc(expires_at) <= now


def _day_window_utc(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _resolve_cooldown_minutes(cooldown_key: str, requested_minutes: Optional[int]) -> int:
    type_minutes = TYPE_COOLDOWN_MINUTES.get(cooldown_key, DEFAULT_COOLDOWN_MINUTES)
    if requested_minutes is None:
        return type_minutes
    return max(type_minutes, int(requested_minutes))


def _resolve_or_create_day_id(
    db: Session,
    *,
    user_id: Optional[str],
    requested_day_id: Optional[int],
    ts_start: datetime,
) -> Optional[int]:
    if requested_day_id is not None:
        plan = db.query(DayPlan).filter(DayPlan.day_id == int(requested_day_id)).first()
        if plan is None:
            raise HTTPException(status_code=404, detail="day_id not found")
        if user_id and plan.user_id and plan.user_id != user_id:
            raise HTTPException(status_code=403, detail="day_id user mismatch")
        if plan.deleted_at is not None:
            plan.deleted_at = None
            plan.version = int(plan.version or 1) + 1
            db.flush()
        return int(plan.day_id)

    if not user_id:
        return None

    plan_date = _safe_utc(ts_start).date()
    plan = db.query(DayPlan).filter(DayPlan.user_id == user_id, DayPlan.date == plan_date).first()
    if plan is not None:
        if plan.deleted_at is not None:
            plan.deleted_at = None
            plan.version = int(plan.version or 1) + 1
            db.flush()
        return int(plan.day_id)

    plan = DayPlan(
        user_id=user_id,
        date=plan_date,
        mode=DEFAULT_AUTO_DAYPLAN_MODE,
        items=[],
        version=1,
    )
    db.add(plan)
    db.flush()
    return int(plan.day_id)


def _resolve_focus_context_from_body(
    db: Session,
    *,
    user_id: Optional[str],
    body,
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[object]]:
    focus_session_id = getattr(body, "focus_session_id", None)
    schedule_id = getattr(body, "schedule_id", None)
    schedule_type = getattr(body, "schedule_type", None)
    session = None

    if focus_session_id:
        session = get_focus_session_by_id(db, focus_session_id=focus_session_id, user_id=user_id)
        if session is None:
            return None, schedule_id, schedule_type, None
        focus_session_id = session.focus_session_id
        schedule_id = schedule_id or session.schedule_id
        schedule_type = schedule_type or session.schedule_type
    elif user_id:
        session = get_active_focus_session(db, user_id=user_id)
        if session is not None:
            focus_session_id = session.focus_session_id
            schedule_id = schedule_id or session.schedule_id
            schedule_type = schedule_type or session.schedule_type

    return focus_session_id, schedule_id, schedule_type, session


def should_create_question(candidate: ActivityCandidate) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if candidate.confidence is not None and candidate.confidence < CONFIDENCE_THRESHOLD:
        reasons.append("low_confidence")
    if candidate.margin_top1_top2 is not None and candidate.margin_top1_top2 < MARGIN_THRESHOLD:
        reasons.append("small_margin")
    if candidate.mismatch_score is not None and candidate.mismatch_score >= MISMATCH_THRESHOLD:
        reasons.append("high_mismatch")
    return (len(reasons) > 0), reasons


def _compute_mismatch_score(body, ts_start: datetime, ts_end: datetime) -> float:
    """
    Minimal heuristic mismatch score using currently available inputs.
    Output range: 0.0 ~ 1.0
    """
    score = 0.0
    label = (body.top1 or "").strip().lower()
    screen_state = (body.screen_state or "").strip().lower()
    duration_sec = max(0.0, (ts_end - ts_start).total_seconds())

    # Movement label signal
    if label in {"move", "exercise"}:
        score += 0.35
    elif label in {"work", "rest"}:
        score -= 0.15

    # Duration contribution (cap at 180s)
    score += min(duration_sec, 180.0) / 180.0 * 0.35

    # Confidence/margin: low confidence lowers score (uncertain)
    if body.confidence is not None:
        if body.confidence < CONFIDENCE_THRESHOLD:
            score -= 0.1
        else:
            score += 0.05
    if body.margin_top1_top2 is not None and body.margin_top1_top2 < MARGIN_THRESHOLD:
        score -= 0.1

    # Screen state
    if screen_state in {"screen_off", "locked"}:
        score += 0.15
    elif screen_state in {"screen_on"}:
        score -= 0.05

    # Normalize
    return max(0.0, min(1.0, score))


def _upsert_inferred_segment_from_candidate(db: Session, candidate: ActivityCandidate) -> TimelineSegment:
    row = db.query(TimelineSegment).filter(TimelineSegment.candidate_id == candidate.candidate_id).first()
    if row is None:
        row = TimelineSegment(
            user_id=candidate.user_id,
            day_id=candidate.day_id,
            candidate_id=candidate.candidate_id,
            ts_start=candidate.ts_start,
            ts_end=candidate.ts_end,
            inferred_label=candidate.top1,
            final_label=None,
            label_source="inferred",
            mismatch_score_avg=candidate.mismatch_score,
            resume_hint_emitted=False,
            version=1,
        )
        db.add(row)
        db.flush()
        return row

    changed = False
    if row.user_id != candidate.user_id:
        row.user_id = candidate.user_id
        changed = True
    if row.day_id != candidate.day_id:
        row.day_id = candidate.day_id
        changed = True
    if row.ts_start != candidate.ts_start:
        row.ts_start = candidate.ts_start
        changed = True
    if row.ts_end != candidate.ts_end:
        row.ts_end = candidate.ts_end
        changed = True
    if row.inferred_label != candidate.top1:
        row.inferred_label = candidate.top1
        changed = True
    if row.mismatch_score_avg != candidate.mismatch_score:
        row.mismatch_score_avg = candidate.mismatch_score
        changed = True

    if changed:
        row.version = int(row.version or 1) + 1
        row.updated_at = _utc_now()
        db.flush()
    return row


def ingest_candidate(db: Session, body, user_id: Optional[str] = None):
    resolved_user_id = _ensure_user(body.user_id, user_id)
    ts_start = _safe_utc(body.ts_start)
    ts_end = _safe_utc(body.ts_end)
    if body.mismatch_score is None:
        body.mismatch_score = _compute_mismatch_score(body, ts_start, ts_end)
    try:
        resolved_day_id = _resolve_or_create_day_id(
            db,
            user_id=resolved_user_id,
            requested_day_id=body.day_id,
            ts_start=ts_start,
        )
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail="user_id not found") from exc
    dedupe_key = body.dedupe_key or _build_candidate_dedupe_key(resolved_user_id, ts_start, ts_end, body.top1)
    focus_session_id, schedule_id, schedule_type, _ = _resolve_focus_context_from_body(
        db,
        user_id=resolved_user_id,
        body=body,
    )

    existing = (
        db.query(ActivityCandidate)
        .filter(ActivityCandidate.user_id == resolved_user_id, ActivityCandidate.dedupe_key == dedupe_key)
        .first()
    )
    if existing:
        try:
            _upsert_inferred_segment_from_candidate(db, existing)
            if db.new or db.dirty:
                db.commit()
        except IntegrityError as exc:
            db.rollback()
            msg = str(getattr(exc, "orig", exc)).lower()
            if "day_id" in msg or "day_plans" in msg:
                raise HTTPException(status_code=404, detail="day_id not found") from exc
            if "user_id" in msg or "users" in msg:
                raise HTTPException(status_code=404, detail="user_id not found") from exc
            raise HTTPException(status_code=409, detail="timeline integrity error") from exc  # timeline integrity guard
        updated = False
        if focus_session_id and not existing.focus_session_id:
            existing.focus_session_id = focus_session_id
            updated = True
        if schedule_id and not existing.schedule_id:
            existing.schedule_id = schedule_id
            updated = True
        if schedule_type and not existing.schedule_type:
            existing.schedule_type = schedule_type
            updated = True
        if updated:
            db.add(existing)
            db.commit()
            db.refresh(existing)

        return existing, True

    row = ActivityCandidate(
        user_id=resolved_user_id,
        day_id=resolved_day_id,
        focus_session_id=focus_session_id,
        schedule_id=schedule_id,
        schedule_type=schedule_type,
        ts_start=ts_start,
        ts_end=ts_end,
        top1=body.top1,
        activity_topk=body.activity_topk,
        confidence=body.confidence,
        margin_top1_top2=body.margin_top1_top2,
        screen_state=body.screen_state,
        orientation=body.orientation,
        pickup_flag=body.pickup_flag,
        mismatch_score=body.mismatch_score,
        trigger_reasons=body.trigger_reasons,
        dedupe_key=dedupe_key,
    )
    db.add(row)
    try:
        db.flush()
        _upsert_inferred_segment_from_candidate(db, row)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        msg = str(getattr(exc, "orig", exc)).lower()
        if "user_id" in msg or "users" in msg:
            raise HTTPException(status_code=404, detail="user_id not found") from exc
        if "day_id" in msg or "day_plans" in msg:
            raise HTTPException(status_code=404, detail="day_id not found") from exc
        raise HTTPException(status_code=409, detail="candidate integrity error") from exc
    db.refresh(row)

    if row.day_id:
        log_execution(
            db,
            day_id=row.day_id,
            event_type=ExecutionLogEventType.BEHAVIOR_CANDIDATE,
            metrics={
                "confidence": row.confidence,
                "margin": row.margin_top1_top2,
                "mismatch_score": row.mismatch_score,
            },
            context={
                "candidate_id": row.candidate_id,
                "top1": row.top1,
                "screen_state": row.screen_state,
            },
        )
    return row, False


def create_question_if_needed(db: Session, body, user_id: Optional[str] = None):
    resolved_user_id = _ensure_user(body.user_id, user_id)
    candidate = db.query(ActivityCandidate).filter(ActivityCandidate.candidate_id == body.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="candidate not found")
    if resolved_user_id and candidate.user_id and candidate.user_id != resolved_user_id:
        raise HTTPException(status_code=403, detail="candidate user mismatch")

    body_map = body.__dict__ if hasattr(body, "__dict__") else {}
    focus_session_id = getattr(body, "focus_session_id", None)
    schedule_id = getattr(body, "schedule_id", None)
    schedule_type = getattr(body, "schedule_type", None)
    if isinstance(body_map, dict):
        body_map = dict(body_map)
    if focus_session_id is None and isinstance(body_map, dict):
        focus_session_id = body_map.get("focus_session_id")
    if schedule_id is None and isinstance(body_map, dict):
        schedule_id = body_map.get("schedule_id")
    if schedule_type is None and isinstance(body_map, dict):
        schedule_type = body_map.get("schedule_type")

    cooldown_key = body.cooldown_key or f"candidate:{candidate.top1}"
    now = _utc_now()
    cooldown_minutes = _resolve_cooldown_minutes(cooldown_key, getattr(body, "cooldown_minutes", None))
    cooldown_from = now - timedelta(minutes=cooldown_minutes)

    existing = (
        db.query(ClarificationQuestion)
        .filter(
            ClarificationQuestion.user_id == candidate.user_id,
            ClarificationQuestion.cooldown_key == cooldown_key,
            ClarificationQuestion.asked_at >= cooldown_from,
            ClarificationQuestion.status == "asked",
            or_(ClarificationQuestion.expires_at.is_(None), ClarificationQuestion.expires_at > now),
        )
        .order_by(ClarificationQuestion.asked_at.desc())
        .first()
    )
    if existing:
        updated = False
        if focus_session_id and hasattr(existing, "focus_session_id") and not existing.focus_session_id:
            existing.focus_session_id = focus_session_id
            updated = True
        if schedule_id and hasattr(existing, "schedule_id") and not existing.schedule_id:
            existing.schedule_id = schedule_id
            updated = True
        if schedule_type and hasattr(existing, "schedule_type") and not existing.schedule_type:
            existing.schedule_type = schedule_type
            updated = True
        if updated:
            db.add(existing)
            db.commit()
            db.refresh(existing)

        return existing, True

    if candidate.user_id:
        day_start, day_end = _day_window_utc(now)
        daily_limit = int(getattr(body, "max_daily_questions", DEFAULT_DAILY_QUESTION_LIMIT))
        created_today = (
            db.query(ClarificationQuestion)
            .filter(
                ClarificationQuestion.user_id == candidate.user_id,
                ClarificationQuestion.asked_at >= day_start,
                ClarificationQuestion.asked_at < day_end,
            )
            .count()
        )
        if created_today >= daily_limit:
            raise HTTPException(status_code=429, detail="daily question cap reached")

    row = ClarificationQuestion(
        user_id=candidate.user_id,
        candidate_id=candidate.candidate_id,
        status="asked",
        question_text=body.question_text or DEFAULT_QUESTION_TEXT,
        trigger_reasons=body.trigger_reasons,
        cooldown_key=cooldown_key,
        expires_at=now + timedelta(minutes=body.expires_minutes),
    )
    if hasattr(row, "focus_session_id") and focus_session_id:
        row.focus_session_id = focus_session_id
    if hasattr(row, "schedule_id") and schedule_id:
        row.schedule_id = schedule_id
    if hasattr(row, "schedule_type") and schedule_type:
        row.schedule_type = schedule_type
    db.add(row)
    db.commit()
    db.refresh(row)

    if candidate.day_id:
        log_execution(
            db,
            day_id=candidate.day_id,
            event_type=ExecutionLogEventType.CLARIFY_ASKED,
            context={
                "question_id": row.question_id,
                "candidate_id": candidate.candidate_id,
                "trigger_reasons": body.trigger_reasons,
            },
        )
    return row, False


def create_question_from_candidate(
    db: Session,
    candidate: ActivityCandidate,
    *,
    user_id: Optional[str] = None,
    cooldown_minutes: Optional[int] = None,
    expires_minutes: int = 30,
    max_daily_questions: int = DEFAULT_DAILY_QUESTION_LIMIT,
):
    should_ask, reasons = should_create_question(candidate)
    focus_override = False
    focus_session = None

    focus_user_id = user_id or candidate.user_id
    if candidate.focus_session_id:
        focus_session = get_focus_session_by_id(
            db,
            focus_session_id=candidate.focus_session_id,
            user_id=focus_user_id,
        )
    elif focus_user_id:
        focus_session = get_active_focus_session(db, user_id=focus_user_id)

    if focus_session:
        should_emit, focus_reasons = update_focus_session_from_candidate(db, focus_session, candidate)
        if should_emit:
            focus_override = True
            if FOCUS_SOFT_NUDGE_REASON not in reasons:
                reasons.append(FOCUS_SOFT_NUDGE_REASON)
            for reason in focus_reasons:
                if reason not in reasons:
                    reasons.append(reason)

    if not should_ask and not focus_override:
        return None, False

    question_text = None
    cooldown_key = f"candidate:{candidate.top1}"
    resolved_cooldown_minutes = cooldown_minutes
    if focus_override and focus_session:
        expected = (getattr(focus_session, "expected_motion", None) or "").strip() or "unknown"
        reasons.append(f"expected_motion:{expected}")
        if candidate.top1:
            reasons.append(f"sensor:{candidate.top1}")
        question_text = f"{FOCUS_SOFT_NUDGE_QUESTION_TEXT} ({FOCUS_SOFT_NUDGE_EXPECTED_PREFIX}: {expected})"
        cooldown_key = f"{FOCUS_SOFT_NUDGE_COOLDOWN_KEY_PREFIX}:{focus_session.focus_session_id}"
        resolved_cooldown_minutes = None
        mark_soft_nudge_issued(db, focus_session)

    class _Body:
        def __init__(self):
            self.user_id = user_id or candidate.user_id
            self.candidate_id = candidate.candidate_id
            self.focus_session_id = candidate.focus_session_id
            self.schedule_id = candidate.schedule_id
            self.schedule_type = candidate.schedule_type
            self.question_text = question_text
            self.trigger_reasons = reasons
            self.cooldown_key = cooldown_key
            self.cooldown_minutes = resolved_cooldown_minutes
            self.expires_minutes = expires_minutes
            self.max_daily_questions = max_daily_questions

    try:
        return create_question_if_needed(db, _Body(), user_id=user_id or candidate.user_id)
    except HTTPException as exc:
        if exc.status_code == 429:
            return None, True
        raise


def _upsert_segment_from_candidate(db: Session, candidate: ActivityCandidate, label: str) -> TimelineSegment:
    row = db.query(TimelineSegment).filter(TimelineSegment.candidate_id == candidate.candidate_id).first()
    if row:
        row.final_label = label
        row.label_source = "question"
        row.version = int(row.version or 1) + 1
        row.updated_at = _utc_now()
        return row

    row = TimelineSegment(
        user_id=candidate.user_id,
        day_id=candidate.day_id,
        candidate_id=candidate.candidate_id,
        ts_start=candidate.ts_start,
        ts_end=candidate.ts_end,
        inferred_label=candidate.top1,
        final_label=label,
        label_source="question",
        mismatch_score_avg=candidate.mismatch_score,
        resume_hint_emitted=False,
        version=1,
    )
    db.add(row)
    db.flush()
    return row


def answer_question(db: Session, question_id: int, body, user_id: Optional[str] = None):
    resolved_user_id = _ensure_user(body.user_id, user_id)
    question = db.query(ClarificationQuestion).filter(ClarificationQuestion.question_id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="question not found")
    if resolved_user_id and question.user_id and question.user_id != resolved_user_id:
        raise HTTPException(status_code=403, detail="question user mismatch")
    now = _utc_now()
    if _is_expired(question.expires_at, now):
        _transition_question_status(question, "expired", now)
        db.commit()
        raise HTTPException(status_code=409, detail="question is expired")
    if "answered" not in QUESTION_ALLOWED_TRANSITIONS.get(question.status, set()):
        raise HTTPException(status_code=409, detail="question is not answerable")

    candidate = db.query(ActivityCandidate).filter(ActivityCandidate.candidate_id == question.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="candidate not found")

    _transition_question_status(question, "answered", now)
    segment = _upsert_segment_from_candidate(db, candidate, body.label)

    label_row = UserLabel(
        user_id=candidate.user_id,
        question_id=question.question_id,
        candidate_id=candidate.candidate_id,
        timeline_segment_id=segment.segment_id,
        user_label=body.label,
        corrected_from=segment.inferred_label,
        note=body.note,
    )
    db.add(label_row)
    db.flush()
    db.commit()
    db.refresh(label_row)
    db.refresh(question)
    db.refresh(segment)

    if candidate.day_id:
        log_execution(
            db,
            day_id=candidate.day_id,
            event_type=ExecutionLogEventType.LABEL_CONFIRMED,
            context={
                "question_id": question.question_id,
                "candidate_id": candidate.candidate_id,
                "segment_id": segment.segment_id,
                "label": body.label,
            },
        )
    return question, label_row, segment


def dismiss_question(db: Session, question_id: int, user_id: Optional[str] = None) -> ClarificationQuestion:
    question = db.query(ClarificationQuestion).filter(ClarificationQuestion.question_id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="question not found")
    if user_id and question.user_id and question.user_id != user_id:
        raise HTTPException(status_code=403, detail="question user mismatch")
    now = _utc_now()
    if _is_expired(question.expires_at, now) and question.status == "asked":
        _transition_question_status(question, "expired", now)
    else:
        _transition_question_status(question, "dismissed", now)
    db.commit()
    db.refresh(question)
    return question


def expire_overdue_questions(db: Session, user_id: Optional[str] = None, limit: int = 200) -> int:
    now = _utc_now()
    query = db.query(ClarificationQuestion).filter(
        ClarificationQuestion.status == "asked",
        ClarificationQuestion.expires_at.isnot(None),
    )
    if user_id:
        query = query.filter(ClarificationQuestion.user_id == user_id)
    rows = query.order_by(ClarificationQuestion.asked_at.asc()).limit(limit).all()
    expired_rows = [row for row in rows if _is_expired(row.expires_at, now)]
    for row in expired_rows:
        _transition_question_status(row, "expired", now)
    if expired_rows:
        db.commit()
    return len(expired_rows)


def list_pending_questions(db: Session, user_id: str, limit: int = 20) -> list[ClarificationQuestion]:
    now = _utc_now()
    rows = (
        db.query(ClarificationQuestion)
        .filter(ClarificationQuestion.user_id == user_id, ClarificationQuestion.status == "asked")
        .order_by(ClarificationQuestion.asked_at.desc())
        .limit(limit)
        .all()
    )
    return [row for row in rows if not _is_expired(row.expires_at, now)]


def list_timeline_segments(
    db: Session,
    user_id: str,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
) -> list[TimelineSegment]:
    query = db.query(TimelineSegment).filter(TimelineSegment.user_id == user_id)
    if from_ts:
        query = query.filter(TimelineSegment.ts_end >= _safe_utc(from_ts))
    if to_ts:
        query = query.filter(TimelineSegment.ts_start <= _safe_utc(to_ts))
    return query.order_by(TimelineSegment.ts_start.desc()).all()


def patch_timeline_segment_label(db: Session, segment_id: int, body, user_id: Optional[str] = None):
    resolved_user_id = _ensure_user(body.user_id, user_id)
    row = db.query(TimelineSegment).filter(TimelineSegment.segment_id == segment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="segment not found")
    if resolved_user_id and row.user_id and row.user_id != resolved_user_id:
        raise HTTPException(status_code=403, detail="segment user mismatch")

    previous = row.final_label or row.inferred_label
    row.final_label = body.final_label
    row.label_source = "manual_edit"
    row.version = int(row.version or 1) + 1
    db.add(
        UserLabel(
            user_id=row.user_id,
            question_id=None,
            candidate_id=row.candidate_id,
            timeline_segment_id=row.segment_id,
            user_label=body.final_label,
            corrected_from=previous,
            note=body.note,
        )
    )
    db.flush()
    db.commit()
    db.refresh(row)

    if row.day_id:
        log_execution(
            db,
            day_id=row.day_id,
            event_type=ExecutionLogEventType.TIMELINE_SEGMENT_PATCHED,
            context={
                "segment_id": row.segment_id,
                "candidate_id": row.candidate_id,
                "final_label": row.final_label,
                "source": "manual_edit",
            },
        )
    return row







