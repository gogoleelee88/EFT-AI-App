# POST /adapt/day
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.adapter.schemas import AdaptRequest, AdaptResult
from backend.spec_loop.adapter.service import apply_adaptation
from backend.spec_loop.condition.service import _sync_delay_tasks_to_google, _sync_plan_tasks_to_google
from backend.spec_loop.models import DayPlan

router = APIRouter(prefix="/adapt", tags=["adapt"])


@router.post("/day", response_model=AdaptResult)
def post_adapt_day(body: AdaptRequest, db: Session = Depends(get_db)) -> AdaptResult:
    """Manual adaptation endpoint."""
    plan = db.query(DayPlan).filter(DayPlan.day_id == body.day_id).first()
    before_items = list(plan.items or []) if plan else []

    result = apply_adaptation(
        db,
        body.day_id,
        body.condition_id,
        target_mode=body.mode,
        condition_score=body.condition_score,
    )
    actions_applied = list(result.get("actions_applied") or [])

    effective_user_id = body.user_id
    if effective_user_id is None and plan is not None and plan.user_id:
        effective_user_id = plan.user_id

    sync_messages: list[str] = []
    google_calendar_synced = False
    google_calendar_sync_message: str | None = None

    if plan is not None and effective_user_id is not None:
        delay_task_ids = [
            int(task_id)
            for task_id in (result.get("delay_scheduler_hint") or [])
            if str(task_id).strip()
        ]

        if delay_task_ids:
            try:
                google_calendar_synced, sync_message = _sync_delay_tasks_to_google(
                    db,
                    effective_user_id,
                    plan.date,
                    delay_task_ids,
                    list(plan.items or []),
                )
                if sync_message:
                    sync_messages.append(sync_message)
            except Exception:
                google_calendar_synced = False

        try:
            sync_applied, sync_message = _sync_plan_tasks_to_google(
                db,
                effective_user_id,
                plan.date,
                before_items,
                list(plan.items or []),
                actions_applied,
            )
            if sync_message:
                sync_messages.append(sync_message)
            if sync_applied:
                google_calendar_synced = True
        except Exception:
            pass

        if sync_messages:
            google_calendar_sync_message = " | ".join(sync_messages)

    return AdaptResult(
        day_id=body.day_id,
        actions_applied=result.get("actions_applied", []),
        updated_plan=result.get("updated_plan"),
        soothe_requested=result.get("soothe_requested", False),
        delay_scheduler_hint=result.get("delay_scheduler_hint"),
        google_calendar_synced=google_calendar_synced,
        google_calendar_sync_message=google_calendar_sync_message,
    )

