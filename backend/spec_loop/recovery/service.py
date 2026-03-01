from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.spec_loop.focus_session.service import get_active_focus_session, get_focus_session_by_id
from backend.spec_loop.models import RecoveryEvent
from backend.spec_loop.recovery.schemas import (
    IosSignalIn,
    RecoveryEventIn,
    RecoveryEventOut,
    RecoveryJournalEventItem,
    RecoveryJournalOut,
    RecoveryJournalSummaryInputOut,
)

MIN_CONFIDENCE = 0.40
DEFAULT_SCHEDULE_NAME = "업무 세션"
ENTRY_COOLDOWN_MINUTES = {
    "schedule_start": 6,
    "progress_blocked": 10,
    "distraction_detected": 8,
}
ENTRY_POINT_LABEL = {
    "schedule_start": "시작 지연",
    "progress_blocked": "진행 중 막힘",
    "distraction_detected": "이탈 감지",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_user_id(body_user_id: Optional[str], user_id: Optional[str]) -> Optional[str]:
    if body_user_id and user_id and body_user_id != user_id:
        raise HTTPException(status_code=403, detail="user_id mismatch")
    return body_user_id or user_id


def _normalized_schedule_name(raw: Optional[str]) -> str:
    value = (raw or "").strip()
    return value if value else DEFAULT_SCHEDULE_NAME


def _normalize_distraction_type(raw: Optional[str]) -> Optional[str]:
    value = (raw or "").strip()
    return value if value else None


def _build_entry_sentence(
    *,
    entry_point: str,
    schedule_name: str,
    blocked_min: Optional[int],
    distraction_type: Optional[str],
) -> str:
    if entry_point == "schedule_start":
        if blocked_min is not None and blocked_min > 0:
            return f"{schedule_name}을(를) 시작해야 하는데 {blocked_min}분째 시작하지 못하고 있다."
        return f"지금 {schedule_name}을(를) 시작해야 하는데 시작이 막힌 상태다."
    if entry_point == "progress_blocked":
        mins = max(1, int(blocked_min or 1))
        return f"{schedule_name}을 하다가 {mins}분째 멈춰 있고 다시 이어가기 어렵다."
    if distraction_type:
        return f"{schedule_name} 중에 {distraction_type}로 이탈했고 다시 돌아오기 어렵다."
    return f"{schedule_name} 중에 딴짓/이탈이 발생해 복귀가 필요한 상태다."


def _resolve_frontend_base_url() -> str:
    settings = get_settings()
    dashboard_url = (settings.FRONTEND_DASHBOARD_URL or "").strip()
    if not dashboard_url:
        return ""
    base = dashboard_url.rstrip("/")
    if base.endswith("/dashboard"):
        base = base[: -len("/dashboard")]
    return base.rstrip("/")


def _build_recovery_url(
    *,
    entry_point: str,
    schedule_id: Optional[str],
    schedule_name: str,
    entry_sentence: str,
    blocked_min: Optional[int],
    distraction_type: Optional[str],
    event_id: str,
) -> Optional[str]:
    base = _resolve_frontend_base_url()
    if not base:
        return None
    params = {
        "entry_point": entry_point,
        "sentence": entry_sentence,
        "schedule_name": schedule_name,
        "event_id": event_id,
    }
    if schedule_id:
        params["schedule_id"] = schedule_id
    if blocked_min is not None:
        params["blocked_min"] = str(int(blocked_min))
    if distraction_type:
        params["distraction_type"] = distraction_type
    return f"{base}/eft-strict?{urlencode(params)}"


def _has_recent_open_event(
    db: Session,
    *,
    user_id: Optional[str],
    schedule_id: Optional[str],
    entry_point: str,
    now: datetime,
    cooldown_minutes: int,
) -> bool:
    if not user_id:
        return False
    threshold = now - timedelta(minutes=max(1, cooldown_minutes))
    query = db.query(RecoveryEvent).filter(
        RecoveryEvent.user_id == user_id,
        RecoveryEvent.entry_point == entry_point,
        RecoveryEvent.action == "open_web",
        RecoveryEvent.created_at >= threshold,
    )
    if schedule_id:
        query = query.filter(RecoveryEvent.schedule_id == schedule_id)
    else:
        query = query.filter(RecoveryEvent.schedule_id.is_(None))
    return query.first() is not None


def _save_event(
    db: Session,
    *,
    event_id: str,
    user_id: Optional[str],
    focus_session_id: Optional[str],
    schedule_id: Optional[str],
    schedule_name: str,
    session_state: str,
    entry_point: str,
    blocked_min: Optional[int],
    distraction_type: Optional[str],
    distraction_app_category: Optional[str],
    mismatch_score: Optional[float],
    observed_apps: Optional[object],
    context_version: Optional[str],
    confidence: Optional[float],
    source: Optional[str],
    source_detail: Optional[str],
    summary_reason: Optional[str],
    unknown_ratio: Optional[float],
    system_ratio: Optional[float],
    top_categories: Optional[object],
    switch_count: Optional[int],
    duration_ratio: Optional[float],
    entry_sentence: str,
    action: str,
    suppressed_reason: Optional[str],
    recovery_url: Optional[str],
) -> RecoveryEvent:
    row = RecoveryEvent(
        event_id=event_id,
        user_id=user_id,
        focus_session_id=focus_session_id,
        schedule_id=schedule_id,
        schedule_name=schedule_name,
        session_state=session_state,
        entry_point=entry_point,
        blocked_min=blocked_min,
        distraction_type=distraction_type,
        distraction_app_category=distraction_app_category,
        mismatch_score=mismatch_score,
        observed_apps=observed_apps,
        context_version=context_version,
        confidence=confidence,
        source=source,
        source_detail=source_detail,
        summary_reason=summary_reason,
        unknown_ratio=unknown_ratio,
        system_ratio=system_ratio,
        top_categories=top_categories,
        switch_count=switch_count,
        duration_ratio=duration_ratio,
        entry_sentence=entry_sentence,
        action=action,
        suppressed_reason=suppressed_reason,
        recovery_url=recovery_url,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _resolve_focus_context(
    db: Session,
    *,
    resolved_user_id: str,
    body_focus_session_id: Optional[str],
    body_schedule_id: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    focus_session = None
    if body_focus_session_id:
        focus_session = get_focus_session_by_id(
            db,
            focus_session_id=body_focus_session_id,
            user_id=resolved_user_id,
        )
    if focus_session is None:
        focus_session = get_active_focus_session(db, user_id=resolved_user_id)
    focus_session_id = body_focus_session_id or getattr(focus_session, "focus_session_id", None)
    schedule_id = body_schedule_id or getattr(focus_session, "schedule_id", None)
    return focus_session_id, schedule_id


def create_recovery_event(
    db: Session,
    body: RecoveryEventIn,
    *,
    user_id: Optional[str] = None,
) -> RecoveryEventOut:
    resolved_user_id = _safe_user_id(body.user_id, user_id)
    if not resolved_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    focus_session_id, schedule_id = _resolve_focus_context(
        db,
        resolved_user_id=resolved_user_id,
        body_focus_session_id=body.focus_session_id,
        body_schedule_id=body.schedule_id,
    )
    schedule_name = _normalized_schedule_name(body.schedule_name)
    distraction_type = _normalize_distraction_type(body.distraction_type)
    blocked_min = int(body.blocked_min) if body.blocked_min is not None else None
    source = (body.source or "").strip() or None
    distraction_app_category = (getattr(body, "distraction_app_category", None) or None)
    mismatch_score = getattr(body, "mismatch_score", None)
    observed_apps = getattr(body, "observed_apps", None)
    context_version = (getattr(body, "context_version", None) or "v1")
    source_detail = (getattr(body, "source_detail", None) or None)
    summary_reason = (getattr(body, "summary_reason", None) or None)
    unknown_ratio = getattr(body, "unknown_ratio", None)
    system_ratio = getattr(body, "system_ratio", None)
    top_categories_raw = getattr(body, "top_categories", None)
    switch_count = getattr(body, "switch_count", None)
    duration_ratio = getattr(body, "duration_ratio", None)
    if mismatch_score is not None:
        try:
            mismatch_score = float(mismatch_score)
        except Exception:
            mismatch_score = None
    if mismatch_score is not None:
        mismatch_score = max(0.0, min(1.0, mismatch_score))
    if unknown_ratio is not None:
        try:
            unknown_ratio = float(unknown_ratio)
        except Exception:
            unknown_ratio = None
    if unknown_ratio is not None:
        unknown_ratio = max(0.0, min(1.0, unknown_ratio))
    if system_ratio is not None:
        try:
            system_ratio = float(system_ratio)
        except Exception:
            system_ratio = None
    if system_ratio is not None:
        system_ratio = max(0.0, min(1.0, system_ratio))
    top_categories: Optional[list[str]] = None
    if isinstance(top_categories_raw, list):
        top_categories = []
        for cat in top_categories_raw:
            value = str(cat).strip()
            if value:
                top_categories.append(value[:32])
        top_categories = top_categories[:10] if top_categories else None
    if switch_count is not None:
        try:
            switch_count = int(switch_count)
        except Exception:
            switch_count = None
    if switch_count is not None:
        switch_count = max(0, min(100000, switch_count))
    if duration_ratio is not None:
        try:
            duration_ratio = float(duration_ratio)
        except Exception:
            duration_ratio = None
    if duration_ratio is not None:
        duration_ratio = max(0.0, min(1.0, duration_ratio))
    now = _utc_now()
    event_id = uuid4().hex

    entry_sentence = _build_entry_sentence(
        entry_point=body.entry_point,
        schedule_name=schedule_name,
        blocked_min=blocked_min,
        distraction_type=distraction_type,
    )

    action = "open_web"
    suppressed_reason: Optional[str] = None
    recovery_url: Optional[str] = None

    if body.entry_point == "session_summary":
        action = "ignore"
        suppressed_reason = "summary_only"

    if action == "open_web" and body.confidence is not None and body.confidence < MIN_CONFIDENCE:
        action = "ignore"
        suppressed_reason = "low_confidence"

    if action == "open_web" and body.entry_point in {"progress_blocked", "distraction_detected"}:
        if not focus_session_id and not schedule_id:
            action = "ignore"
            suppressed_reason = "no_active_session"

    if action == "open_web":
        cooldown_minutes = int(body.cooldown_minutes or ENTRY_COOLDOWN_MINUTES.get(body.entry_point, 8))
        if _has_recent_open_event(
            db,
            user_id=resolved_user_id,
            schedule_id=schedule_id,
            entry_point=body.entry_point,
            now=now,
            cooldown_minutes=cooldown_minutes,
        ):
            action = "ignore"
            suppressed_reason = "cooldown"

    if action == "open_web":
        recovery_url = _build_recovery_url(
            entry_point=body.entry_point,
            schedule_id=schedule_id,
            schedule_name=schedule_name,
            entry_sentence=entry_sentence,
            blocked_min=blocked_min,
            distraction_type=distraction_type,
            event_id=event_id,
        )
        if not recovery_url:
            action = "ignore"
            suppressed_reason = "frontend_url_missing"

    row = _save_event(
        db,
        event_id=event_id,
        user_id=resolved_user_id,
        focus_session_id=focus_session_id,
        schedule_id=schedule_id,
        schedule_name=schedule_name,
        session_state=body.session_state,
        entry_point=body.entry_point,
        blocked_min=blocked_min,
        distraction_type=distraction_type,
        distraction_app_category=distraction_app_category,
        mismatch_score=mismatch_score,
        observed_apps=observed_apps,
        context_version=context_version,
        confidence=body.confidence,
        source=source,
        source_detail=source_detail,
        summary_reason=summary_reason,
        unknown_ratio=unknown_ratio,
        system_ratio=system_ratio,
        top_categories=top_categories,
        switch_count=switch_count,
        duration_ratio=duration_ratio,
        entry_sentence=entry_sentence,
        action=action,
        suppressed_reason=suppressed_reason,
        recovery_url=recovery_url,
    )
    return RecoveryEventOut(
        event_id=row.event_id,
        action=row.action,
        entry_sentence=row.entry_sentence,
        recovery_url=row.recovery_url,
        suppressed_reason=row.suppressed_reason,
        focus_session_id=row.focus_session_id,
        schedule_id=row.schedule_id,
        entry_point=row.entry_point,
        created_at=row.created_at,
    )


def create_recovery_event_from_ios_signal(
    db: Session,
    body: IosSignalIn,
    *,
    user_id: Optional[str] = None,
) -> RecoveryEventOut:
    distraction_type = "iOSBackground" if body.signal_type == "background" else "ScreenOff"
    mapped = RecoveryEventIn(
        user_id=body.user_id,
        focus_session_id=body.focus_session_id,
        schedule_id=body.schedule_id,
        schedule_name=body.schedule_name,
        session_state="in_progress",
        entry_point="distraction_detected",
        distraction_type=distraction_type,
        confidence=body.confidence,
        source="ios_signal",
        timestamp=body.timestamp,
        cooldown_minutes=body.cooldown_minutes,
    )
    return create_recovery_event(db, mapped, user_id=user_id)


def _resolve_range(
    *,
    days: int,
    from_ts: Optional[datetime],
    to_ts: Optional[datetime],
) -> tuple[datetime, datetime]:
    now = _utc_now()
    end = to_ts or now
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    else:
        end = end.astimezone(timezone.utc)
    start = from_ts or (end - timedelta(days=max(1, days)))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    else:
        start = start.astimezone(timezone.utc)
    if start > end:
        raise HTTPException(status_code=400, detail="from_ts must be <= to_ts")
    return start, end


def get_recovery_journal(
    db: Session,
    *,
    user_id: str,
    days: int = 1,
    limit: int = 200,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
    include_events: bool = True,
) -> RecoveryJournalOut:
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    start, end = _resolve_range(days=days, from_ts=from_ts, to_ts=to_ts)

    rows = (
        db.query(RecoveryEvent)
        .filter(
            RecoveryEvent.user_id == user_id,
            RecoveryEvent.created_at >= start,
            RecoveryEvent.created_at <= end,
        )
        .order_by(RecoveryEvent.created_at.desc())
        .limit(max(1, min(limit, 1000)))
        .all()
    )

    total_events = len(rows)
    open_web_count = sum(1 for row in rows if row.action == "open_web")
    ignored_count = total_events - open_web_count

    entry_counter = Counter((row.entry_point or "unknown") for row in rows)
    distraction_counter = Counter(
        row.distraction_type for row in rows if (row.distraction_type or "").strip()
    )
    schedule_counter = Counter(
        (row.schedule_name or DEFAULT_SCHEDULE_NAME) for row in rows
    )

    summary_lines: list[str] = []
    if total_events <= 0:
        summary_lines.append("지정한 기간에 개입 이벤트가 없다.")
    else:
        top_entry, top_entry_count = entry_counter.most_common(1)[0]
        top_entry_label = ENTRY_POINT_LABEL.get(top_entry, top_entry)
        summary_lines.append(
            f"총 {total_events}회 개입 신호가 있었고, {top_entry_label}이 {top_entry_count}회로 가장 많았다."
        )
        if schedule_counter:
            schedule_text = ", ".join(
                f"{name} {count}회" for name, count in schedule_counter.most_common(3)
            )
            summary_lines.append(f"막힘/이탈이 많이 발생한 일정은 {schedule_text} 순서다.")
        if distraction_counter:
            distraction_text = ", ".join(
                f"{name} {count}회" for name, count in distraction_counter.most_common(3)
            )
            summary_lines.append(f"이탈 유형은 {distraction_text}가 많았다.")

    events: list[RecoveryJournalEventItem] = []
    if include_events:
        for row in rows[: min(100, len(rows))]:
            events.append(
                RecoveryJournalEventItem(
                    event_id=row.event_id,
                    created_at=row.created_at,
                    entry_point=row.entry_point,
                    session_state=row.session_state,
                    schedule_id=row.schedule_id,
                    schedule_name=row.schedule_name,
                    distraction_type=row.distraction_type,
                    blocked_min=row.blocked_min,
                    mismatch_score=getattr(row, "mismatch_score", None),
                    distraction_app_category=getattr(row, "distraction_app_category", None),
                    observed_apps=getattr(row, "observed_apps", None),
                    context_version=getattr(row, "context_version", None),
                    action=row.action,
                    entry_sentence=row.entry_sentence,
                )
            )

    return RecoveryJournalOut(
        user_id=user_id,
        from_ts=start,
        to_ts=end,
        total_events=total_events,
        open_web_count=open_web_count,
        ignored_count=ignored_count,
        entry_point_counts=dict(entry_counter),
        distraction_type_counts=dict(distraction_counter),
        schedule_counts=dict(schedule_counter),
        summary_lines=summary_lines,
        events=events,
    )


def get_recovery_journal_summary_input(
    db: Session,
    *,
    user_id: str,
    days: int = 1,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
) -> RecoveryJournalSummaryInputOut:
    start, end = _resolve_range(days=days, from_ts=from_ts, to_ts=to_ts)

    rows = (
        db.query(RecoveryEvent)
        .filter(
            RecoveryEvent.user_id == user_id,
            RecoveryEvent.created_at >= start,
            RecoveryEvent.created_at <= end,
        )
        .order_by(RecoveryEvent.created_at.desc())
        .limit(1000)
        .all()
    )

    entry_counter = Counter((row.entry_point or "unknown") for row in rows)

    mismatch_values = [row.mismatch_score for row in rows if getattr(row, "mismatch_score", None) is not None]
    avg_mismatch: Optional[float] = None
    if mismatch_values:
        avg_mismatch = float(sum(mismatch_values) / max(1, len(mismatch_values)))

    unknown_vals = [row.unknown_ratio for row in rows if getattr(row, "unknown_ratio", None) is not None]
    avg_unknown: Optional[float] = None
    if unknown_vals:
        avg_unknown = float(sum(unknown_vals) / max(1, len(unknown_vals)))

    system_vals = [row.system_ratio for row in rows if getattr(row, "system_ratio", None) is not None]
    avg_system: Optional[float] = None
    if system_vals:
        avg_system = float(sum(system_vals) / max(1, len(system_vals)))

    cats: list[str] = []
    for row in rows:
        cat = getattr(row, "distraction_app_category", None) or getattr(row, "distraction_type", None)
        if cat:
            cats.append(cat)
    top_cats = [c for c, _ in Counter(cats).most_common(5)]

    top_categories_counter: Counter[str] = Counter()
    for row in rows:
        values = getattr(row, "top_categories", None)
        if not isinstance(values, list):
            continue
        for cat in values:
            value = str(cat).strip()
            if value:
                top_categories_counter[value] += 1

    mismatch_by_schedule: dict[str, list[float]] = {}
    for row in rows:
        ms = getattr(row, "mismatch_score", None)
        if ms is None:
            continue
        key = row.schedule_name or DEFAULT_SCHEDULE_NAME
        mismatch_by_schedule.setdefault(key, []).append(float(ms))
    mismatch_by_schedule_avg: dict[str, float] = {
        k: float(sum(v) / max(1, len(v))) for k, v in mismatch_by_schedule.items()
    }

    focus_sessions = set()
    for row in rows:
        fs = getattr(row, "focus_session_id", None)
        if fs:
            focus_sessions.add(fs)

    return RecoveryJournalSummaryInputOut(
        user_id=user_id,
        from_ts=start,
        to_ts=end,
        focus_sessions_count=len(focus_sessions),
        entry_point_counts=dict(entry_counter),
        top_distraction_categories=top_cats,
        avg_mismatch_score=avg_mismatch,
        mismatch_by_schedule=mismatch_by_schedule_avg,
        avg_unknown_ratio=avg_unknown,
        avg_system_ratio=avg_system,
        top_categories_counts=dict(top_categories_counter),
    )
