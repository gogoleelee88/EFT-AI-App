from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.spec_loop.execution_log_service import log_execution
from backend.spec_loop.models import DayPlan, Task
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType

# delay: move heavy tasks to scheduler with hint
DELAY_SCHEDULER_HOOK = "delay_scheduler_hook"

# soothe: soft recovery mode marker
SOOTHE_FLAG = "soothe"


def _load_tasks_map(db: Session, task_ids: list[int]) -> dict[int, Any]:
    """task_id -> Task ORM (for priority, energy_cost)."""
    if not task_ids:
        return {}
    rows = db.query(Task).filter(Task.task_id.in_(task_ids)).all()
    return {t.task_id: t for t in rows}


def _plan_items(plan: DayPlan) -> list[dict]:
    return list(plan.items or [])


def _save_plan_items(db: Session, plan: DayPlan, items: list[dict], protected_block_minutes: Optional[int] = None) -> None:
    plan.items = items
    if protected_block_minutes is not None:
        plan.protected_block_minutes = protected_block_minutes
    db.commit()
    db.refresh(plan)


def _drop_low_priority_high_energy(items: list[dict], tasks: dict[int, Any]) -> list[dict]:
    """Drop low-priority/high-energy tasks only."""
    kept = []
    for it in items:
        tid = it.get("task_id")
        t = tasks.get(tid) if tid is not None else None
        if t is None:
            kept.append(it)
            continue
        prio = getattr(t, "priority", None) or 5
        energy = getattr(t, "energy_cost", None) or 0
        if prio <= 2 and energy >= 4:
            continue
        kept.append(it)
    return kept


def _shrink_blocks_and_micro_steps(items: list[dict]) -> list[dict]:
    """Shrink planned_block and fill missing micro_steps."""
    out = []
    for it in items:
        block = max(1, int((it.get("planned_block_minutes") or 0) * 0.7))
        micro_steps = it.get("micro_steps") or []
        if not micro_steps:
            micro_steps = [f"총 {block}분 동안 집중해서 진행"]
        else:
            micro_steps = [micro_steps[0]] + [f"후속 단계 {i + 2}" for i in range(min(2, len(micro_steps) - 1))]
        out.append(
            {
                **it,
                "planned_block_minutes": block,
                "micro_steps": micro_steps[:3],
            }
        )
    return out


def _delay_moves_to_next_slot(items: list[dict], tasks: dict[int, Any]) -> tuple[list[dict], list[int]]:
    """Find a move with the highest energy_cost and mark it delayed."""
    if not items:
        return items, []
    best_idx = 0
    best_energy = -1
    for i, it in enumerate(items):
        t = tasks.get(it.get("task_id")) if it.get("task_id") is not None else None
        e = getattr(t, "energy_cost", None) or 0
        if e > best_energy:
            best_energy = e
            best_idx = i
    delayed_id = items[best_idx].get("task_id")
    delayed_ids = [delayed_id] if delayed_id is not None else []
    new_items = [it for j, it in enumerate(items) if j != best_idx]
    return new_items, delayed_ids


def _swap_by_energy_cost(items: list[dict], tasks: dict[int, Any]) -> list[dict]:
    """Sort by descending energy_cost to reduce peak load."""

    def key(it: dict) -> tuple[int, int]:
        t = tasks.get(it.get("task_id")) if it.get("task_id") is not None else None
        return (getattr(t, "energy_cost", None) or 5, it.get("task_id") or 0)

    return sorted(items, key=key)


def _split_first_two_min(items: list[dict]) -> list[dict]:
    """Ensure first 2~3 micro steps are present."""
    out = []
    for it in items:
        micro_steps = list(it.get("micro_steps") or [])
        if "2분 단위" not in micro_steps and not any("2분" in str(s) for s in micro_steps):
            micro_steps = ["2분 단위 단순화"] + (micro_steps[:2] or ["다음 단계 진행"])
        out.append({**it, "micro_steps": micro_steps[:3]})
    return out


def _protect_add_block(items: list[dict], protected_minutes: int = 30) -> tuple[list[dict], int]:
    """Add (or keep) protected block minutes."""
    if not items:
        return items, 0
    return items, protected_minutes


def apply_adaptation(
    db: Session,
    day_id: int,
    condition_id: int,
    target_mode: Optional[int] = None,
    condition_score: Optional[int] = None,
) -> dict[str, Any]:
    """
    Apply F5 adaptations in order: drop, shrink, delay, swap, split, protect, soothe.
    """
    plan = db.query(DayPlan).filter(DayPlan.day_id == day_id).first()
    if not plan:
        return {"actions_applied": [], "updated_plan": None, "soothe_requested": False, "delay_scheduler_hint": None}

    if target_mode is None:
        from backend.spec_loop.models import Condition

        c = db.query(Condition).filter(Condition.condition_id == condition_id).first()
        if c and c.condition_score is not None:
            if c.condition_score >= 70:
                target_mode = 100
            elif c.condition_score >= 40:
                target_mode = 70
            else:
                target_mode = 40
        else:
            target_mode = plan.mode

    items = _plan_items(plan)
    task_ids = [it.get("task_id") for it in items if it.get("task_id") is not None]
    tasks = _load_tasks_map(db, task_ids)

    actions_applied: list[str] = []
    delay_scheduler_hint: list[int] = []
    protected_block_minutes: Optional[int] = plan.protected_block_minutes
    soothe_requested = False

    if target_mode <= 70 and plan.mode == 100:
        items = _drop_low_priority_high_energy(items, tasks)
        if len(items) < len(_plan_items(plan)):
            actions_applied.append("drop")
        items = _shrink_blocks_and_micro_steps(items)
        actions_applied.append("shrink")

    if target_mode <= 40:
        items, delayed = _delay_moves_to_next_slot(items, tasks)
        if delayed:
            actions_applied.append("delay")
            delay_scheduler_hint = delayed
        items = _swap_by_energy_cost(items, tasks)
        actions_applied.append("swap")
        items = _split_first_two_min(items)
        actions_applied.append("split")
        items, prot = _protect_add_block(items, 30)
        if prot > 0:
            actions_applied.append("protect")
            protected_block_minutes = prot
        if condition_score is not None and condition_score < 50:
            soothe_requested = True
            actions_applied.append("soothe")

    if target_mode <= 70 and "protect" not in actions_applied:
        _, prot = _protect_add_block(items, 15)
        if prot > 0:
            protected_block_minutes = max(protected_block_minutes or 0, prot)
            actions_applied.append("protect")

    _save_plan_items(db, plan, items, protected_block_minutes)

    updated_plan = {
        "day_id": plan.day_id,
        "date": plan.date.isoformat() if hasattr(plan.date, "isoformat") else str(plan.date),
        "mode": plan.mode,
        "items": plan.items,
        "protected_block_minutes": plan.protected_block_minutes,
    }

    if actions_applied:
        log_execution(
            db,
            day_id=plan.day_id,
            event_type=ExecutionLogEventType.ADAPT_APPLIED,
            mode=plan.mode,
            condition_ref=condition_id,
            metrics={"actions_applied": actions_applied},
        )

    return {
        "actions_applied": actions_applied,
        "updated_plan": updated_plan,
        "soothe_requested": soothe_requested,
        "delay_scheduler_hint": delay_scheduler_hint or None,
    }
