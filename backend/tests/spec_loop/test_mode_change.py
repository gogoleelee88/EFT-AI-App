# Slice 2: 당일 2회째 전환 409, 보호 하향만 2회째 허용, 상향 2회째 당일 금지 (PM 결정 1)
from datetime import date

import pytest
from fastapi import HTTPException

from backend.spec_loop.models import DayPlan, ModeChange
from backend.spec_loop.mode_change import service as mode_change_service
from backend.spec_loop.condition.service import checkin
from backend.spec_loop.condition.schemas import CheckinRequest, MinConditionSet


def test_mode_change_once_per_day_then_409(db_session):
    """당일 1회 전환 허용, 2회째(상향 아닌 경우) 409."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=100, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    day_id = plan.day_id

    # 1회: 100 → 70 (하향) 허용
    body1 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="H6_7", fatigue=6, pain=1, mood="ok"),
        day_id=day_id,
    )
    r1 = checkin(db_session, body1, day_id=day_id)
    assert r1.final_mode == 70
    assert r1.adapt_applied is True

    # 2회: 70 → 70 변경 없음이면 adapt 호출 안 함. 70 → 40 (하향) 하면 2회째 전환
    plan.mode = 70
    db_session.commit()
    body2 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="LT5", fatigue=8, pain=3, mood="low"),
        day_id=day_id,
    )
    r2 = checkin(db_session, body2, day_id=day_id)
    assert r2.final_mode == 40
    assert r2.adapt_applied is True

    # 3회 전환 시도: 40 → 70 (상향) → 409
    plan.mode = 40
    db_session.commit()
    body3 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm"),
        day_id=day_id,
    )
    with pytest.raises(HTTPException) as exc:
        checkin(db_session, body3, day_id=day_id)
    assert exc.value.status_code == 409
    assert mode_change_service.MODE_CHANGE_LIMIT in str(exc.value.detail)


def test_409_mode_change_limit_when_second_change(db_session):
    """2회째 전환(상향) 시 409 MODE_CHANGE_LIMIT."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    day_id = plan.day_id

    # 1회: 70 → 100 (상향)
    body1 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm"),
        day_id=day_id,
    )
    checkin(db_session, body1, day_id=day_id)

    # 2회: 100 → 70 (하향) 허용(보호 목적). 그 다음 70 → 100 다시 시도하면 409
    plan.mode = 100
    db_session.commit()
    body2 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="H6_7", fatigue=5, pain=2, mood="ok"),
        day_id=day_id,
    )
    checkin(db_session, body2, day_id=day_id)
    assert db_session.query(ModeChange).filter(ModeChange.day_id == day_id).count() == 2

    plan.mode = 70
    db_session.commit()
    body3 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm"),
        day_id=day_id,
    )
    with pytest.raises(HTTPException) as exc:
        checkin(db_session, body3, day_id=day_id)
    assert exc.value.status_code == 409


def test_protection_down_allows_second_change_same_day(db_session):
    """보호 목적 하향만 2회째 허용: 100→70→40 같은 날 가능."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=100, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    day_id = plan.day_id

    # 1회: 100 → 70
    body1 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="H6_7", fatigue=5, pain=1, mood="ok"),
        day_id=day_id,
    )
    checkin(db_session, body1, day_id=day_id)

    # 2회: 70 → 40 (보호 하향) 허용
    plan.mode = 70
    db_session.commit()
    body2 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="LT5", fatigue=8, pain=5, mood="low"),
        day_id=day_id,
    )
    r2 = checkin(db_session, body2, day_id=day_id)
    assert r2.final_mode == 40
    assert r2.adapt_applied is True


def test_upward_second_change_forbidden_same_day(db_session):
    """상향 2회째 당일 절대 금지: 70→100 후 같은 날 다시 40→70 시도 시 409."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    day_id = plan.day_id

    # 1회: 70 → 100 (상향)
    body1 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm"),
        day_id=day_id,
    )
    checkin(db_session, body1, day_id=day_id)

    # 2회: 100 → 40 (하향) 허용
    plan.mode = 100
    db_session.commit()
    body2 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="LT5", fatigue=9, pain=9, mood="low"),
        day_id=day_id,
    )
    checkin(db_session, body2, day_id=day_id)

    # 3회: 40 → 70 (상향) 시도 → 409
    plan.mode = 40
    db_session.commit()
    body3 = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="H7_8", fatigue=3, pain=2, mood="ok"),
        day_id=day_id,
    )
    with pytest.raises(HTTPException) as exc:
        checkin(db_session, body3, day_id=day_id)
    assert exc.value.status_code == 409


def test_mode_up_not_allowed_same_day(db_session):
    """모드 상향은 예외로도 당일 2회째 기본 금지 (결정 3)."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    day_id = plan.day_id

    # 1회 상향 전환 기록(70→100)
    mode_change_service.record(db_session, day_id, 70, 100, reason="first_up")

    # 같은 날 두 번째 상향(40→70) 시도 → 409 MODE_CHANGE_LIMIT
    with pytest.raises(HTTPException) as exc:
        mode_change_service.can_change(db_session, day_id, 40, 70)
    assert exc.value.status_code == 409
    assert mode_change_service.MODE_CHANGE_LIMIT in str(exc.value.detail)
