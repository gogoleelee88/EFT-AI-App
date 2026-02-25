from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.spec_loop.models import ActivityCandidate, DayPlan, FocusBehaviorSession, Task

MOVE_LABELS = {
    "move",
    "commute",
    "workout",
    "exercise",
}

STATIONARY_LABELS = {
    "rest",
    "work",
    "other",
}

EXPECTED_MOTION_STATIONARY = "stationary_expected"
EXPECTED_MOTION_MOVEMENT = "movement_expected"
EXPECTED_MOTION_MIXED = "mixed"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_user_id(body_user_id: Optional[str], user_id: Optional[str]) -> Optional[str]:
    if body_user_id and user_id and body_user_id != user_id:
        raise HTTPException(status_code=403, detail="user_id mismatch")
    return body_user_id or user_id


def _fallback_expected_motion(schedule_type: Optional[str]) -> str:
    key = (schedule_type or "").strip().lower()
    if key in {"workout", "exercise", "run", "running", "gym"}:
        return EXPECTED_MOTION_MOVEMENT
    return EXPECTED_MOTION_STATIONARY


def _resolve_expected_motion_from_schedule(
    db: Session,
    *,
    user_id: Optional[str],
    schedule_id: Optional[str],
) -> Optional[str]:
    if not user_id or not schedule_id:
        return None
    # Best-effort lookup: match schedule_id to task_uid or item_id in recent plans.
    plans = (
        db.query(DayPlan)
        .filter(DayPlan.user_id == user_id, DayPlan.deleted_at.is_(None))
        .order_by(DayPlan.date.desc())
        .limit(14)
        .all()
    )
    for plan in plans:
        items = list(plan.items or [])
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get("task_uid") == schedule_id or item.get("item_id") == schedule_id:
                task_id = item.get("task_id")
                if isinstance(task_id, int):
                    row = db.query(Task).filter(Task.task_id == task_id).first()
                    if row and isinstance(row.tags, dict):
                        expected = row.tags.get("expected_motion")
                        if isinstance(expected, str) and expected:
                            return expected
    return None


def _soft_nudge_config() -> tuple[int, int, int, int]:
    settings = get_settings()
    if settings.SOFT_NUDGE_MODE == "demo":
        min_session_seconds = int(settings.SOFT_NUDGE_DEMO_MIN_SESSION_SECONDS or 30)
    else:
        min_session_seconds = int(settings.SOFT_NUDGE_PROD_MIN_SESSION_SECONDS or 15 * 60)
    return (
        max(1, min_session_seconds),
        max(1, int(settings.SOFT_NUDGE_MOVEMENT_WINDOW_SECONDS or 180)),
        max(0, int(settings.SOFT_NUDGE_COOLDOWN_MINUTES or 15)),
        max(1, int(settings.SOFT_NUDGE_MAX_PER_SESSION or 1)),
    )


def get_active_focus_session(db: Session, *, user_id: Optional[str]) -> Optional[FocusBehaviorSession]:
    if not user_id:
        return None
    now = _utc_now()
    return (
        db.query(FocusBehaviorSession)
        .filter(
            FocusBehaviorSession.user_id == user_id,
            FocusBehaviorSession.state == "tracking",
            or_(FocusBehaviorSession.ended_at.is_(None), FocusBehaviorSession.ended_at > now),
        )
        .order_by(FocusBehaviorSession.started_at.desc())
        .first()
    )


def get_focus_session_by_id(
    db: Session,
    *,
    focus_session_id: str,
    user_id: Optional[str] = None,
) -> Optional[FocusBehaviorSession]:
    if not focus_session_id:
        return None
    row = (
        db.query(FocusBehaviorSession)
        .filter(FocusBehaviorSession.focus_session_id == focus_session_id)
        .first()
    )
    if not row:
        return None
    if user_id and row.user_id and row.user_id != user_id:
        return None
    return row


def create_focus_session(
    db: Session,
    *,
    user_id: Optional[str],
    schedule_id: Optional[str],
    mission_run_id: Optional[str],
    schedule_type: str,
    auto_end_existing: bool,
) -> FocusBehaviorSession:
    now = _utc_now()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    if auto_end_existing:
        active = get_active_focus_session(db, user_id=user_id)
        if active:
            active.state = "stopped"
            active.ended_at = now

    expected_motion = _resolve_expected_motion_from_schedule(
        db,
        user_id=user_id,
        schedule_id=schedule_id,
    )
    if not expected_motion:
        expected_motion = _fallback_expected_motion(schedule_type)

    row = FocusBehaviorSession(
        focus_session_id=uuid4().hex,
        user_id=user_id,
        schedule_id=schedule_id,
        mission_run_id=mission_run_id,
        schedule_type=schedule_type or "focus",
        expected_motion=expected_motion,
        state="tracking",
        started_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def stop_focus_session(
    db: Session,
    focus_session_id: str,
    *,
    user_id: Optional[str] = None,
) -> FocusBehaviorSession:
    row = db.query(FocusBehaviorSession).filter(FocusBehaviorSession.focus_session_id == focus_session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="focus session not found")
    if user_id and row.user_id and row.user_id != user_id:
        raise HTTPException(status_code=403, detail="focus session user mismatch")

    row.state = "stopped"
    row.ended_at = _utc_now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_active_sessions(db: Session, user_id: str) -> list[FocusBehaviorSession]:
    return (
        db.query(FocusBehaviorSession)
        .filter(FocusBehaviorSession.user_id == user_id, FocusBehaviorSession.state == "tracking")
        .order_by(FocusBehaviorSession.started_at.desc())
        .all()
    )


def _has_reached_min_session_age(now: datetime, session: FocusBehaviorSession, now_candidate_end: datetime) -> bool:
    min_session_seconds, *_ = _soft_nudge_config()
    session_start = session.started_at
    if session_start is None:
        return False
    return (now_candidate_end - session_start).total_seconds() >= min_session_seconds


def _collect_recent_movement_seconds(
    db: Session,
    *,
    session: FocusBehaviorSession,
    candidate: ActivityCandidate,
    window_seconds: int,
) -> float:
    if not session.focus_session_id or window_seconds <= 0:
        return 0.0
    if not candidate.ts_start or not candidate.ts_end:
        return 0.0

    window_start = candidate.ts_end - timedelta(seconds=window_seconds)
    rows = (
        db.query(ActivityCandidate)
        .filter(
            ActivityCandidate.focus_session_id == session.focus_session_id,
            ActivityCandidate.top1.in_(MOVE_LABELS),
            ActivityCandidate.ts_end > window_start,
            ActivityCandidate.ts_start < candidate.ts_end,
        )
        .order_by(ActivityCandidate.ts_start.asc())
        .all()
    )
    if not rows:
        return 0.0

    merged_start: Optional[datetime] = None
    merged_end: Optional[datetime] = None
    total_seconds = 0.0

    for row in rows:
        if row.ts_start is None or row.ts_end is None:
            continue
        seg_start = max(row.ts_start, window_start)
        seg_end = min(row.ts_end, candidate.ts_end)
        if seg_end <= seg_start:
            continue

        if merged_start is None or merged_end is None:
            merged_start = seg_start
            merged_end = seg_end
            continue

        if seg_start <= merged_end:
            if seg_end > merged_end:
                merged_end = seg_end
        else:
            total_seconds += max(0.0, (merged_end - merged_start).total_seconds())
            merged_start = seg_start
            merged_end = seg_end

    if merged_start is not None and merged_end is not None:
        total_seconds += max(0.0, (merged_end - merged_start).total_seconds())

    return min(total_seconds, float(window_seconds))


def _collect_recent_stationary_seconds(
    db: Session,
    *,
    session: FocusBehaviorSession,
    candidate: ActivityCandidate,
    window_seconds: int,
) -> float:
    if not session.focus_session_id or window_seconds <= 0:
        return 0.0
    if not candidate.ts_start or not candidate.ts_end:
        return 0.0

    window_start = candidate.ts_end - timedelta(seconds=window_seconds)
    rows = (
        db.query(ActivityCandidate)
        .filter(
            ActivityCandidate.focus_session_id == session.focus_session_id,
            ActivityCandidate.top1.in_(STATIONARY_LABELS),
            ActivityCandidate.ts_end > window_start,
            ActivityCandidate.ts_start < candidate.ts_end,
        )
        .order_by(ActivityCandidate.ts_start.asc())
        .all()
    )
    if not rows:
        return 0.0

    merged_start: Optional[datetime] = None
    merged_end: Optional[datetime] = None
    total_seconds = 0.0

    for row in rows:
        if row.ts_start is None or row.ts_end is None:
            continue
        seg_start = max(row.ts_start, window_start)
        seg_end = min(row.ts_end, candidate.ts_end)
        if seg_end <= seg_start:
            continue

        if merged_start is None or merged_end is None:
            merged_start = seg_start
            merged_end = seg_end
            continue

        if seg_start <= merged_end:
            if seg_end > merged_end:
                merged_end = seg_end
        else:
            total_seconds += max(0.0, (merged_end - merged_start).total_seconds())
            merged_start = seg_start
            merged_end = seg_end

    if merged_start is not None and merged_end is not None:
        total_seconds += max(0.0, (merged_end - merged_start).total_seconds())

    return min(total_seconds, float(window_seconds))


def update_focus_session_from_candidate(
    db: Session,
    session: FocusBehaviorSession,
    candidate: ActivityCandidate,
) -> tuple[bool, list[str]]:
    """
    Returns (should_emit_soft_nudge, reasons).
    """
    now = _utc_now()
    reasons: list[str] = []

    _, movement_window_seconds, _, max_per_session = _soft_nudge_config()

    if session.state != "tracking":
        return False, reasons
    if session.soft_nudge_count >= max_per_session:
        return False, reasons
    if session.next_allowed_nudge_at and session.next_allowed_nudge_at > now:
        return False, reasons
    if not _has_reached_min_session_age(now, session, candidate.ts_end):
        return False, reasons

    label = (candidate.top1 or "").strip()
    recent_move_seconds = _collect_recent_movement_seconds(
        db,
        session=session,
        candidate=candidate,
        window_seconds=movement_window_seconds,
    )
    recent_stationary_seconds = _collect_recent_stationary_seconds(
        db,
        session=session,
        candidate=candidate,
        window_seconds=movement_window_seconds,
    )

    if label in MOVE_LABELS:
        session.movement_last_seen_at = candidate.ts_end
        session.rest_started_at = None
        if session.movement_started_at is None:
            session.movement_started_at = candidate.ts_start
    else:
        if session.movement_started_at is not None:
            session.movement_started_at = None
        session.rest_started_at = candidate.ts_end

    expected_motion = (session.expected_motion or "").strip().lower()
    if not expected_motion:
        expected_motion = _fallback_expected_motion(session.schedule_type or candidate.schedule_type)

    if expected_motion == EXPECTED_MOTION_STATIONARY:
        if recent_move_seconds >= movement_window_seconds:
            reasons.append("focus_soft_nudge_stationary_expected")
            db.add(session)
            db.commit()
            return True, reasons
    elif expected_motion == EXPECTED_MOTION_MOVEMENT:
        if recent_stationary_seconds >= movement_window_seconds:
            reasons.append("focus_soft_nudge_movement_expected")
            db.add(session)
            db.commit()
            return True, reasons
    else:
        # Mixed: require a stronger signal (2x window) to avoid noisy nudges.
        if recent_move_seconds >= movement_window_seconds * 2 or recent_stationary_seconds >= movement_window_seconds * 2:
            reasons.append("focus_soft_nudge_mixed")
            db.add(session)
            db.commit()
            return True, reasons

    schedule_type = (session.schedule_type or candidate.schedule_type or "").strip().lower()
    if schedule_type in {"workout", "exercise", "run", "running"}:
        if recent_stationary_seconds >= movement_window_seconds:
            reasons.append("focus_soft_nudge_stationary")
            db.add(session)
            db.commit()
            return True, reasons

    db.add(session)
    db.commit()
    return False, reasons


def mark_soft_nudge_issued(db: Session, session: FocusBehaviorSession) -> None:
    now = _utc_now()
    _, _, cooldown_minutes, _ = _soft_nudge_config()
    session.soft_nudge_done = True
    session.soft_nudge_count = int(session.soft_nudge_count or 0) + 1
    session.next_allowed_nudge_at = now + timedelta(minutes=cooldown_minutes)
    session.movement_started_at = None
    session.movement_last_seen_at = None
    session.rest_started_at = None
    session.state = "tracking"
    db.add(session)
    db.commit()

