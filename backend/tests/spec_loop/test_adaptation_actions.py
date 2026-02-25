# Slice 3: Adapter 7종 액션 (F5)
from datetime import date

from backend.spec_loop.models import DayPlan, Task
from backend.spec_loop.adapter.service import (
    apply_adaptation,
    _drop_low_priority_high_energy,
    _shrink_blocks_and_micro_steps,
    _delay_moves_to_next_slot,
    _swap_by_energy_cost,
    _split_first_two_min,
    _protect_add_block,
    _load_tasks_map,
)


def test_drop_low_priority_high_energy(db_session):
    """F5: drop — priority 낮고 energy_cost 높은 항목 제거."""
    t_keep = Task(title="Keep", est_minutes=20, priority=4, energy_cost=2)
    t_drop = Task(title="Drop", est_minutes=30, priority=1, energy_cost=5)
    db_session.add_all([t_keep, t_drop])
    db_session.commit()
    db_session.refresh(t_keep)
    db_session.refresh(t_drop)
    items = [
        {"task_id": t_keep.task_id, "planned_block_minutes": 20, "micro_steps": ["a"]},
        {"task_id": t_drop.task_id, "planned_block_minutes": 30, "micro_steps": ["b"]},
    ]
    tasks = _load_tasks_map(db_session, [t_keep.task_id, t_drop.task_id])
    out = _drop_low_priority_high_energy(items, tasks)
    assert len(out) == 1
    assert out[0]["task_id"] == t_keep.task_id


def test_shrink_block_and_micro_steps(db_session):
    """F5: shrink — planned_block 재계산, micro_step 재생성."""
    items = [
        {"task_id": 1, "planned_block_minutes": 30, "micro_steps": ["step1", "step2"]},
    ]
    out = _shrink_blocks_and_micro_steps(items)
    assert len(out) == 1
    assert out[0]["planned_block_minutes"] == 21  # 30 * 0.7
    assert len(out[0]["micro_steps"]) <= 3


def test_delay_moves_to_next_slot(db_session):
    """F5: delay — 한 항목 제거 후 delay 목록 반환, Scheduler 연동용."""
    t1 = Task(title="Low", est_minutes=10, energy_cost=1)
    t2 = Task(title="High", est_minutes=30, energy_cost=5)
    db_session.add_all([t1, t2])
    db_session.commit()
    db_session.refresh(t1)
    db_session.refresh(t2)
    items = [
        {"task_id": t1.task_id, "planned_block_minutes": 10, "micro_steps": []},
        {"task_id": t2.task_id, "planned_block_minutes": 30, "micro_steps": []},
    ]
    tasks = _load_tasks_map(db_session, [t1.task_id, t2.task_id])
    new_items, delayed_ids = _delay_moves_to_next_slot(items, tasks)
    assert len(new_items) == 1
    assert len(delayed_ids) == 1
    assert delayed_ids[0] == t2.task_id


def test_swap_by_energy_cost(db_session):
    """F5: swap — energy_cost 기준 순서 재배열 (낮은 것 먼저)."""
    t_high = Task(title="High", est_minutes=20, energy_cost=5)
    t_low = Task(title="Low", est_minutes=15, energy_cost=1)
    db_session.add_all([t_high, t_low])
    db_session.commit()
    db_session.refresh(t_high)
    db_session.refresh(t_low)
    items = [
        {"task_id": t_high.task_id, "planned_block_minutes": 20, "micro_steps": []},
        {"task_id": t_low.task_id, "planned_block_minutes": 15, "micro_steps": []},
    ]
    tasks = _load_tasks_map(db_session, [t_high.task_id, t_low.task_id])
    out = _swap_by_energy_cost(items, tasks)
    assert out[0]["task_id"] == t_low.task_id
    assert out[1]["task_id"] == t_high.task_id


def test_split_includes_first_two_min(db_session):
    """F5: split — 2~3 micro_step, '첫 2분 착수' 포함."""
    items = [
        {"task_id": 1, "planned_block_minutes": 20, "micro_steps": ["only one"]},
    ]
    out = _split_first_two_min(items)
    assert len(out) == 1
    steps = out[0]["micro_steps"]
    assert any("2분" in str(s) or "첫" in str(s) for s in steps)
    assert len(steps) <= 3


def test_protect_adds_block_no_override(db_session):
    """F5: protect — 최소 1개 핵심 유지, protected_block 추가, protected_block_minutes 설정."""
    t1 = Task(title="Core", est_minutes=15, energy_cost=1)
    t2 = Task(title="Extra", est_minutes=25, energy_cost=5)
    db_session.add_all([t1, t2])
    db_session.commit()
    db_session.refresh(t1)
    db_session.refresh(t2)
    today = date.today()
    plan = DayPlan(
        user_id=None,
        date=today,
        mode=70,
        items=[
            {"task_id": t1.task_id, "planned_block_minutes": 15, "micro_steps": ["x"]},
            {"task_id": t2.task_id, "planned_block_minutes": 25, "micro_steps": ["y"]},
        ],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    result = apply_adaptation(db_session, plan.day_id, 1, target_mode=40, condition_score=35)
    db_session.refresh(plan)
    assert "protect" in result["actions_applied"]
    assert plan.protected_block_minutes is not None
    assert plan.protected_block_minutes >= 15


def test_soothe_flag_passed_to_simulator(db_session):
    """F5: soothe — condition_score 낮을 때 soothe_requested 플래그 (simulator에 전달용)."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[{"task_id": 1, "planned_block_minutes": 15, "micro_steps": ["a"]}])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    result = apply_adaptation(db_session, plan.day_id, 1, target_mode=40, condition_score=30)
    assert result.get("soothe_requested") is True


def test_user_stop_impossible_applies_protect_split(db_session):
    """사용자 '중단/불가' 예외 시 protect+split 적용 (결정 3)."""
    from backend.spec_loop.condition.service import handle_user_stop_impossible

    today = date.today()
    t1 = Task(title="Core", est_minutes=20, energy_cost=2)
    t2 = Task(title="Extra", est_minutes=30, energy_cost=4)
    db_session.add_all([t1, t2])
    db_session.commit()
    db_session.refresh(t1)
    db_session.refresh(t2)

    plan = DayPlan(
        user_id=None,
        date=today,
        mode=70,
        items=[
            {"task_id": t1.task_id, "planned_block_minutes": 20, "micro_steps": ["x"]},
            {"task_id": t2.task_id, "planned_block_minutes": 30, "micro_steps": ["y"]},
        ],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    result = handle_user_stop_impossible(db_session, plan.day_id, condition_id=1)
    actions = result.get("actions_applied", [])
    assert "protect" in actions
    assert "split" in actions
