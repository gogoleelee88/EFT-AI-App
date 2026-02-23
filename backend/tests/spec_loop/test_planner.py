# Slice 4: POST /plan/day (SPEC C2)
from datetime import date

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.spec_loop.models import DayPlan, Task
from backend.spec_loop.planner.service import (
    create_or_update_day_plan,
    create_or_update_day_plan_with_mission,
)
from backend.spec_loop.planner.schemas import (
    PlanDayRequest,
    PlanDayWithMissionRequest,
    PlanItem,
    PlanItemWithMission,
)


def test_post_plan_day_creates_or_updates(db_session):
    """POST /plan/day: date, mode, items → day_id, date, mode, items. 생성 또는 갱신."""
    t1 = Task(title="T1", est_minutes=20, priority=1, energy_cost=2)
    db_session.add(t1)
    db_session.commit()
    db_session.refresh(t1)

    today = date.today()
    body = PlanDayRequest(
        date=today,
        mode=70,
        items=[
            PlanItem(
                task_id=t1.task_id,
                resistance_level=8,
                planned_block_minutes=15,
                micro_steps=["step1", "step2"],
            ),
        ],
    )
    plan = create_or_update_day_plan(db_session, body)
    assert plan.day_id is not None
    assert plan.date == today
    assert plan.mode == 70
    assert len(plan.items) == 1
    assert plan.items[0]["task_id"] == t1.task_id
    assert plan.items[0]["resistance_level"] == 8
    assert plan.items[0]["planned_block_minutes"] == 15
    # Slice 수정: item_id가 안정적인 diff를 위해 부여됨
    assert "item_id" in plan.items[0]

    # 동일 date로 다시 요청 시 갱신
    body2 = PlanDayRequest(
        date=today,
        mode=40,
        items=[
            PlanItem(
                task_id=t1.task_id,
                resistance_level=3,
                planned_block_minutes=10,
                micro_steps=[],
            )
        ],
    )
    plan2 = create_or_update_day_plan(db_session, body2)
    assert plan2.day_id == plan.day_id
    assert plan2.mode == 40
    assert plan2.items[0]["resistance_level"] == 3
    assert plan2.items[0]["planned_block_minutes"] == 10


def test_post_plan_day_404_when_task_id_not_found(db_session):
    """task_id 없으면 404."""
    today = date.today()
    body = PlanDayRequest(date=today, mode=100, items=[PlanItem(task_id=99999, planned_block_minutes=10, micro_steps=[])])
    with pytest.raises(HTTPException) as exc:
        create_or_update_day_plan(db_session, body)
    assert exc.value.status_code == 404


def test_day_with_mission_persists_resistance_level(db_session):
    t1 = Task(title="T-with-mission", est_minutes=30, priority=1, energy_cost=2)
    db_session.add(t1)
    db_session.commit()
    db_session.refresh(t1)

    body = PlanDayWithMissionRequest(
        date=date.today(),
        mode=70,
        items=[
            PlanItemWithMission(
                task_id=t1.task_id,
                resistance_level=7,
                planned_block_minutes=20,
                micro_steps=["step1"],
            )
        ],
    )

    plan = create_or_update_day_plan_with_mission(db_session, body)
    assert plan.items[0]["resistance_level"] == 7


def test_plan_item_rejects_invalid_resistance_level():
    with pytest.raises(ValidationError):
        PlanItem(task_id=1, resistance_level=11, planned_block_minutes=10, micro_steps=[])
