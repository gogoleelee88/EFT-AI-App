from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.spec_loop.execution_log_service import log_execution
from services.proposal_engine import build_llm_provider
from backend.spec_loop.mission.service import create_mission_template, get_or_create_micro_action
from backend.spec_loop.models import DayPlan, Task
from backend.spec_loop.planner.schemas import PlanDayRequest, PlanDayWithMissionRequest
from backend.spec_loop.reminder import repository as reminder_repository
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType


def _validate_task_ids(db: Session, task_ids: list[int]) -> None:
    if not task_ids:
        return
    found = db.query(Task.task_id).filter(Task.task_id.in_(task_ids)).all()
    found_ids = {row[0] for row in found}
    missing = sorted(set(task_ids) - found_ids)
    if missing:
        raise HTTPException(status_code=404, detail=f"task_id not found: {missing}")


def _fallback_expected_motion(title: str, extra: Optional[str] = None) -> str:
    text = f"{title} {extra or ''}".lower()
    movement_keywords = [
        "walk", "walking", "run", "running", "jog", "swim", "gym", "workout", "exercise", "bike", "bicycle", "hike", "yoga", "fitness", "pilates",
        "stretch", "dance", "park", "sports"
    ]
    for movement in movement_keywords:
        if movement in text:
            return "movement_expected"
    return "stationary_expected"


def _llm_expected_motion(title: str, extra: Optional[str] = None) -> Optional[str]:
    provider = build_llm_provider()
    system_prompt = (
        "You classify the expected motion of a scheduled activity.\n"
        "Return exactly one of: stationary_expected, movement_expected, mixed.\n"
        "No extra words."
    )
    user_prompt = f"Title: {title}\nDetails: {extra or ''}\nExpected motion:"
    try:
        raw = (provider.complete(system_prompt=system_prompt, user_prompt=user_prompt, max_tokens=12) or "").strip()
    except Exception:
        return None
    for val in ("stationary_expected", "movement_expected", "mixed"):
        if val in raw:
            return val
    return None


def _ensure_expected_motion_for_task(
    db: Session,
    *,
    task_id: int,
    title: str,
    extra: Optional[str] = None,
) -> str:
    task = db.query(Task).filter(Task.task_id == task_id).first()
    if not task:
        return _fallback_expected_motion(title, extra)
    tags = task.tags if isinstance(task.tags, dict) else {}
    existing = tags.get("expected_motion")
    if isinstance(existing, str) and existing:
        return existing

    expected = _llm_expected_motion(title, extra) or _fallback_expected_motion(title, extra)
    tags = dict(tags)
    tags["expected_motion"] = expected
    task.tags = tags
    db.add(task)
    db.flush()
    return expected


def _ensure_task_id(db: Session, *, task_id: Optional[int], task_title: Optional[str], est_minutes: Optional[int], priority: Optional[int], fallback_minutes: int) -> int:
    if task_id is not None:
        return task_id
    title = (task_title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="task_title is required when task_id is missing")
    expected = _llm_expected_motion(title) or _fallback_expected_motion(title)
    new_task = Task(
        title=title,
        est_minutes=est_minutes or fallback_minutes or 30,
        priority=priority or 1,
        tags={"expected_motion": expected},
        energy_cost=None,
        pain_sensitive=False,
        requires_focus=False,
    )
    db.add(new_task)
    db.flush()
    return int(new_task.task_id)


def _upsert_day_plan(db: Session, *, uid: Optional[str], plan_date: date, mode: int, items_payload: list[dict]) -> DayPlan:
    plan = db.query(DayPlan).filter(DayPlan.user_id == uid, DayPlan.date == plan_date).first()
    if plan:
        plan.mode = mode
        plan.items = items_payload
        plan.deleted_at = None
        plan.version = int(plan.version or 1) + 1
        db.commit()
        db.refresh(plan)
        return plan

    plan = DayPlan(
        user_id=uid,
        date=plan_date,
        mode=mode,
        items=items_payload,
        version=1,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def create_or_update_day_plan(db: Session, body: PlanDayRequest, user_id: Optional[str] = None) -> DayPlan:
    uid = body.user_id or user_id
    existing_ids = [it.task_id for it in body.items if it.task_id is not None]
    _validate_task_ids(db, existing_ids)

    items_payload: list[dict] = []
    for idx, item in enumerate(body.items):
        resolved_task_id = _ensure_task_id(
            db,
            task_id=item.task_id,
            task_title=item.task_title,
            est_minutes=item.est_minutes,
            priority=item.priority,
            fallback_minutes=item.planned_block_minutes,
        )
        expected_motion = _ensure_expected_motion_for_task(
            db,
            task_id=resolved_task_id,
            title=item.task_title or "",
            extra=" ".join(item.micro_steps or []) if isinstance(item.micro_steps, list) else None,
        )
        task_uid = reminder_repository.build_task_uid(
            user_id=uid,
            plan_date=body.date,
            task_title=item.task_title,
            task_id=resolved_task_id,
            index=idx,
        )
        items_payload.append(
            {
                "item_id": uuid4().hex,
                "task_id": resolved_task_id,
                "task_title": item.task_title,
                "expected_motion": expected_motion,
                "task_uid": task_uid,
                "resistance_level": item.resistance_level,
                "planned_block_minutes": item.planned_block_minutes,
                "micro_steps": item.micro_steps,
            }
        )

    plan = _upsert_day_plan(
        db,
        uid=uid,
        plan_date=body.date,
        mode=body.mode,
        items_payload=items_payload,
    )
    # /plan/day route does not include alarm schema; cancel stale reminder jobs for this day.
    reminder_repository.cancel_jobs_for_day_id(db, plan.day_id)

    log_execution(
        db,
        day_id=plan.day_id,
        event_type=ExecutionLogEventType.PLAN_COMMIT,
        mode=plan.mode,
    )
    return plan


def create_or_update_day_plan_with_mission(
    db: Session,
    body: PlanDayWithMissionRequest,
    user_id: Optional[str] = None,
) -> DayPlan:
    uid = body.user_id or user_id
    existing_ids = [it.task_id for it in body.items if it.task_id is not None]
    _validate_task_ids(db, existing_ids)

    items_payload: list[dict] = []
    for idx, item in enumerate(body.items):
        resolved_task_id = _ensure_task_id(
            db,
            task_id=item.task_id,
            task_title=item.task_title,
            est_minutes=item.est_minutes,
            priority=item.priority,
            fallback_minutes=item.planned_block_minutes,
        )
        expected_motion = _ensure_expected_motion_for_task(
            db,
            task_id=resolved_task_id,
            title=item.task_title or "",
            extra=" ".join(item.micro_steps or []) if isinstance(item.micro_steps, list) else None,
        )
        task_uid = reminder_repository.build_task_uid(
            user_id=uid,
            plan_date=body.date,
            task_title=item.task_title,
            task_id=resolved_task_id,
            index=idx,
        )

        item_data: dict = {
            "item_id": uuid4().hex,
            "task_id": resolved_task_id,
            "task_title": item.task_title,
            "expected_motion": expected_motion,
            "task_uid": task_uid,
            "resistance_level": item.resistance_level,
            "planned_block_minutes": item.planned_block_minutes,
            "micro_steps": item.micro_steps,
        }

        if item.micro_action:
            micro_action = get_or_create_micro_action(
                db=db,
                task_id=resolved_task_id,
                name=item.micro_action.name,
                description=item.micro_action.description,
                start_trigger=item.micro_action.start_trigger,
                source=item.micro_action.source,
                user_id=uid,
            )
            item_data["micro_action"] = {
                "micro_action_id": micro_action.micro_action_id,
                "name": micro_action.name,
                "description": micro_action.description,
                "start_trigger": micro_action.start_trigger,
                "source": micro_action.source,
            }

            if item.missions:
                mission_items = []
                for mission in item.missions:
                    template = create_mission_template(
                        db=db,
                        micro_action_id=micro_action.micro_action_id,
                        mission_type=mission.type,
                        config=mission.config,
                        enabled=mission.enabled,
                        user_id=uid,
                    )
                    mission_items.append(
                        {
                            "mission_template_id": template.mission_template_id,
                            "mission_id": mission.mission_id,
                            "type": mission.type,
                            "enabled": mission.enabled,
                            "config": mission.config,
                        }
                    )
                item_data["missions"] = mission_items

            if item.missions_combination_mode:
                item_data["missions_combination_mode"] = item.missions_combination_mode

        if item.alarm:
            item_data["alarm"] = {
                "time": item.alarm.time,
                "repeat": item.alarm.repeat,
                "custom_days": item.alarm.custom_days,
            }

        items_payload.append(item_data)

    plan = _upsert_day_plan(
        db,
        uid=uid,
        plan_date=body.date,
        mode=body.mode,
        items_payload=items_payload,
    )

    reminder_repository.upsert_jobs_for_day_plan(
        db,
        plan,
        timezone_name=get_settings().REMINDER_DEFAULT_TZ,
        channels=["webpush", "fcm"],
    )

    log_execution(
        db,
        day_id=plan.day_id,
        event_type=ExecutionLogEventType.PLAN_COMMIT,
        mode=plan.mode,
    )
    return plan


def delete_day_plan(db: Session, day_id: int, user_id: Optional[str] = None) -> bool:
    q = db.query(DayPlan).filter(DayPlan.day_id == day_id)
    if user_id:
        q = q.filter(DayPlan.user_id == user_id)
    plan = q.one_or_none()
    if plan is None:
        return False

    reminder_repository.cancel_jobs_for_day_id(db, plan.day_id)
    db.delete(plan)
    db.commit()
    return True


def soft_delete_day_plan(db: Session, day_id: int, user_id: Optional[str] = None) -> DayPlan:
    q = db.query(DayPlan).filter(DayPlan.day_id == day_id)
    if user_id:
        q = q.filter(DayPlan.user_id == user_id)
    plan = q.one_or_none()
    if plan is None or plan.deleted_at is not None:
        raise HTTPException(status_code=404, detail="DayPlan not found")

    plan.deleted_at = datetime.now(timezone.utc)
    plan.version = int(plan.version or 1) + 1
    db.commit()
    db.refresh(plan)
    reminder_repository.cancel_jobs_for_day_id(db, plan.day_id)
    return plan


def restore_day_plan(db: Session, day_id: int, user_id: Optional[str] = None) -> DayPlan:
    q = db.query(DayPlan).filter(DayPlan.day_id == day_id)
    if user_id:
        q = q.filter(DayPlan.user_id == user_id)
    plan = q.one_or_none()
    if plan is None or plan.deleted_at is None:
        raise HTTPException(status_code=404, detail="DayPlan not found")

    plan.deleted_at = None
    plan.version = int(plan.version or 1) + 1
    db.commit()
    db.refresh(plan)
    reminder_repository.upsert_jobs_for_day_plan(
        db,
        plan,
        timezone_name=get_settings().REMINDER_DEFAULT_TZ,
        channels=["webpush", "fcm"],
    )
    return plan



