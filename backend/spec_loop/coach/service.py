from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.spec_loop.models import ResistanceEvent
from backend.spec_loop.coach.schemas import (
    CoachAction,
    DURATION_SEC_MAX,
    DURATION_SEC_MIN,
    LOCK_SEC,
    TechniqueEnum,
)

# Thresholds used when deciding adaptive support is needed.
STORM_60MIN_COUNT = 3
STORM_15MIN_COUNT = 2
CONSECUTIVE_FOR_ADAPT = 3


def _count_recent(db: Session, day_id: int, since: datetime) -> int:
    return db.query(ResistanceEvent).filter(
        ResistanceEvent.day_id == day_id,
        ResistanceEvent.ts >= since,
    ).count()


def _consecutive_count(db: Session, day_id: int, before_ts: datetime) -> int:
    """Count consecutive resistance events before a point in time."""
    events = (
        db.query(ResistanceEvent)
        .filter(ResistanceEvent.day_id == day_id, ResistanceEvent.ts < before_ts)
        .order_by(ResistanceEvent.ts.desc())
        .limit(10)
        .all()
    )
    return len(events)


def record_resistance_event(
    db: Session,
    day_id: int,
    task_id: int | None,
    trigger: str,
    intensity: int,
    context: dict | None = None,
    *,
    technique: str = TechniqueEnum.EFT_TIMER.value,
    duration_sec: int = 60,
) -> tuple[ResistanceEvent, CoachAction, bool]:
    """
    Save resistance event and generate a coach_action.

    duration_sec is clamped to the configured bounds and lock_sec is always set
    by LOCK_SEC.
    """
    now = datetime.now(timezone.utc)
    duration_sec = max(DURATION_SEC_MIN, min(DURATION_SEC_MAX, duration_sec))
    technique_end_ts = now + timedelta(seconds=duration_sec)

    action_payload = {
        "technique": technique,
        "duration_sec": duration_sec,
        "lock_sec": LOCK_SEC,
        "micro_step": "Start with 60-second settling micro-step." if intensity >= 5 else "Start with 30-second micro-step.",
    }

    row = ResistanceEvent(
        ts=now,
        day_id=day_id,
        task_id=task_id,
        trigger=trigger,
        intensity=intensity,
        context=context,
        action=action_payload,
        technique_end_ts=technique_end_ts,
        chosen_technique=technique,
        lock_applied=LOCK_SEC,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    coach_action = CoachAction(
        technique=technique,
        duration_sec=duration_sec,
        lock_sec=LOCK_SEC,
        micro_step=action_payload.get("micro_step"),
    )

    adapt_required = False
    # Adapt required if recent consecutive events reach threshold.
    prev_count = _consecutive_count(db, day_id, now)
    if prev_count + 1 >= CONSECUTIVE_FOR_ADAPT:
        adapt_required = True

    # Additional guard for recent high-frequency events.
    since_60 = now - timedelta(minutes=60)
    since_15 = now - timedelta(minutes=15)
    count_60 = _count_recent(db, day_id, since_60)
    count_15 = _count_recent(db, day_id, since_15)
    if count_60 >= STORM_60MIN_COUNT or count_15 >= STORM_15MIN_COUNT:
        adapt_required = True

    return row, coach_action, adapt_required
