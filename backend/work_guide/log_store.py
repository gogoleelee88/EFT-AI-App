from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from threading import Lock

from work_guide.schemas import StepPlan, WorkGuideLogItem, WorkGuideLogRequest

_MAX_LOGS = 1000
_lock = Lock()
_items: deque[WorkGuideLogItem] = deque(maxlen=_MAX_LOGS)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def append_plan_log(plan: StepPlan) -> None:
    step = plan.steps[0]
    item = WorkGuideLogItem(
        ts=_now_iso(),
        goal=plan.goal,
        mode=plan.mode,
        step_id=step.id,
        confirm_needed=step.confirm.needed,
    )
    with _lock:
        _items.append(item)


def append_confirm_log(body: WorkGuideLogRequest) -> WorkGuideLogItem:
    item = WorkGuideLogItem(
        ts=_now_iso(),
        goal=body.goal,
        mode=body.mode,
        step_id=body.step_id,
        confirm_needed=body.confirm_needed,
        confirm_answer=body.confirm_answer,
        selected_candidate_index=body.selected_candidate_index,
    )
    with _lock:
        _items.append(item)
    return item


def list_logs(limit: int = 100) -> list[WorkGuideLogItem]:
    bounded = max(1, min(500, limit))
    with _lock:
        rows = list(_items)[-bounded:]
    return list(reversed(rows))


