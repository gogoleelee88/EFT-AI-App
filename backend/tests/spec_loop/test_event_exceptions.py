# Slice 4: 저항 폭주(≥3/60min, ≥2/15min) → adapt_required (결정 3)
from datetime import date

from backend.spec_loop.models import DayPlan
from backend.spec_loop.coach.service import record_resistance_event
from backend.spec_loop.condition.service import checkin
from backend.spec_loop.condition.schemas import CheckinRequest, MinConditionSet


def test_resistance_storm_3_in_60min_forces_adapt(db_session):
    """저항 폭주: 60분 내 3회 이상 시 adapt_required True."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    for i in range(3):
        _, _, adapt = record_resistance_event(
            db_session, plan.day_id, None, "PAIN", 2 + i, None
        )
    assert adapt is True


def test_resistance_storm_2_in_15min_forces_adapt(db_session):
    """저항 폭주: 15분 내 2회 이상 시 adapt_required True."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    # 2회 연속 (같은 분 내) → count_15 >= 2
    _, _, _ = record_resistance_event(db_session, plan.day_id, None, "FATIGUE", 3, None)
    _, _, a2 = record_resistance_event(db_session, plan.day_id, None, "OVERWHELM", 4, None)
    assert a2 is True


def test_pain_surge_applies_protection(db_session):
    """통증 급증(pain>=9) 시 보호 목적 모드 하향 + protect 적용."""
    today = date.today()
    # 최소 1개 task 블록이 있어야 protect 블록이 의미 있게 설정됨
    plan = DayPlan(
        user_id=None,
        date=today,
        mode=100,
        items=[{"task_id": 1, "planned_block_minutes": 20, "micro_steps": ["a"]}],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    body = CheckinRequest(
        min_condition_set=MinConditionSet(
            sleep_hours="H7_8",
            fatigue=3,
            pain=9,
            mood="ok",
        ),
        day_id=plan.day_id,
    )
    resp = checkin(db_session, body, day_id=plan.day_id)

    # 통증 급증 시 보호 목적 모드 하향(40) 및 adapt 적용 여부만 검증한다.
    assert resp.final_mode == 40
    assert resp.adapt_applied is True
