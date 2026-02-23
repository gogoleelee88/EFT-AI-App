# Slice 4: duration_sec 30~90, lock_sec=120, 연속 2회 제한·3회째 adapt_required
from datetime import date

from backend.spec_loop.models import DayPlan
from backend.spec_loop.coach.service import record_resistance_event
from backend.spec_loop.coach.schemas import LOCK_SEC, DURATION_SEC_MIN, DURATION_SEC_MAX


def test_technique_duration_30_to_90(db_session):
    """E: duration_sec 30~90."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    _, action, _ = record_resistance_event(
        db_session, plan.day_id, None, "PAIN", 3, None, duration_sec=25
    )
    assert action.duration_sec == DURATION_SEC_MIN
    _, action2, _ = record_resistance_event(
        db_session, plan.day_id, None, "FATIGUE", 2, None, duration_sec=100
    )
    assert action2.duration_sec == DURATION_SEC_MAX


def test_lock_sec_120_const(db_session):
    """B3, E: lock_sec=120 const."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    row, action, _ = record_resistance_event(
        db_session, plan.day_id, None, "OVERWHELM", 5, None
    )
    assert action.lock_sec == LOCK_SEC
    assert row.lock_applied == LOCK_SEC


def test_third_resistance_forces_adapt(db_session):
    """E: 연속 3회째 시 adapt_required True."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    _, _, a1 = record_resistance_event(db_session, plan.day_id, None, "START_AVERSION", 4, None)
    _, _, a2 = record_resistance_event(db_session, plan.day_id, None, "PERFECTIONISM", 3, None)
    _, _, a3 = record_resistance_event(db_session, plan.day_id, None, "CONFLICT", 5, None)
    assert a3 is True
