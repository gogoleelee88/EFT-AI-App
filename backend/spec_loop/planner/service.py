from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.spec_loop.execution_log_service import log_execution
from backend.spec_loop.idempotency import idem_get_or_set
from services.proposal_engine import build_llm_provider
from backend.spec_loop.mission.service import create_mission_template, get_or_create_micro_action
from backend.spec_loop.models import DayPlan, PlannerClientState, ReminderJob, Task
from backend.spec_loop.planner.schemas import (
    PlanDayRequest,
    PlanDayWithMissionRequest,
    PlannerClientStateUpsertRequest,
)
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
                "metadata": dict(item.metadata or {}),
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
    uid = user_id if user_id is not None else body.user_id

    if body.expected_version is not None:
        existing = (
            db.query(DayPlan)
            .filter(DayPlan.user_id == uid, DayPlan.date == body.date)
            .first()
        )
        if existing is not None and int(existing.version or 1) != int(body.expected_version):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": "version_conflict",
                    "expected": int(body.expected_version),
                    "actual": int(existing.version or 1),
                },
            )

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
            "metadata": dict(item.metadata or {}),
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
            start_time = item.alarm.start_time or item.alarm.time
            item_data["alarm"] = {
                "start_time": start_time,
                "end_time": item.alarm.end_time,
                "ends_next_day": item.alarm.ends_next_day,
                "time": start_time,
                "repeat": item.alarm.repeat,
                "custom_days": item.alarm.custom_days,
                "source_type": item.alarm.source_type,
            }
            if item.alarm.source_type:
                item_data["source_type"] = item.alarm.source_type

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


def _to_plan_day_response_payload(plan: DayPlan) -> dict:
    return {
        "day_id": int(plan.day_id),
        "date": plan.date.isoformat(),
        "mode": int(plan.mode),
        "items": list(plan.items or []),
        "version": int(plan.version or 1),
    }


def get_day_plan_by_date(
    db: Session,
    user_id: str,
    plan_date: date,
):
    plan = (
        db.query(DayPlan)
        .filter(DayPlan.user_id == user_id, DayPlan.date == plan_date, DayPlan.deleted_at.is_(None))
        .first()
    )
    if plan is None:
        return None
    return _to_plan_day_response_payload(plan)


def _planner_today_in_timezone(timezone_name: str) -> date:
    tz = ZoneInfo((timezone_name or "Asia/Seoul").strip() or "Asia/Seoul")
    return datetime.now(tz).date()


def _serialize_optional_datetime(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _planner_client_state_payload(
    *,
    user_id: str,
    version: int = 0,
    updated_at: Optional[datetime] = None,
    deadline_goals: Optional[list[dict]] = None,
    privacy_mappings: Optional[list[dict]] = None,
    app_only_events: Optional[list[dict]] = None,
    add_alarm_draft: Optional[dict] = None,
) -> dict:
    return {
        "user_id": user_id,
        "version": int(version or 0),
        "updated_at": _serialize_optional_datetime(updated_at),
        "deadline_goals": list(deadline_goals or []),
        "privacy_mappings": list(privacy_mappings or []),
        "app_only_events": list(app_only_events or []),
        "add_alarm_draft": dict(add_alarm_draft) if isinstance(add_alarm_draft, dict) else None,
    }


def get_planner_client_state(
    db: Session,
    *,
    user_id: str,
) -> dict:
    state = db.query(PlannerClientState).filter(PlannerClientState.user_id == user_id).first()
    if state is None:
        return _planner_client_state_payload(user_id=user_id)
    return _planner_client_state_payload(
        user_id=user_id,
        version=int(state.version or 0),
        updated_at=state.updated_at,
        deadline_goals=list(state.deadline_goals or []),
        privacy_mappings=list(state.privacy_mappings or []),
        app_only_events=list(state.app_only_events or []),
        add_alarm_draft=state.add_alarm_draft if isinstance(state.add_alarm_draft, dict) else None,
    )


def save_planner_client_state(
    db: Session,
    *,
    user_id: str,
    body: PlannerClientStateUpsertRequest,
) -> dict:
    state = db.query(PlannerClientState).filter(PlannerClientState.user_id == user_id).first()
    current_version = int(state.version or 0) if state is not None else 0
    if body.expected_version is not None and int(body.expected_version) != current_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "version_conflict",
                "expected": int(body.expected_version),
                "actual": current_version,
            },
        )

    if state is None:
        state = PlannerClientState(
            user_id=user_id,
            deadline_goals=list(body.deadline_goals or []),
            privacy_mappings=list(body.privacy_mappings or []),
            app_only_events=list(body.app_only_events or []),
            add_alarm_draft=dict(body.add_alarm_draft) if isinstance(body.add_alarm_draft, dict) else None,
            version=1,
        )
        db.add(state)
    else:
        state.deadline_goals = list(body.deadline_goals or [])
        state.privacy_mappings = list(body.privacy_mappings or [])
        state.app_only_events = list(body.app_only_events or [])
        state.add_alarm_draft = (
            dict(body.add_alarm_draft) if isinstance(body.add_alarm_draft, dict) else None
        )
        state.version = current_version + 1

    db.commit()
    db.refresh(state)
    return _planner_client_state_payload(
        user_id=user_id,
        version=int(state.version or 0),
        updated_at=state.updated_at,
        deadline_goals=list(state.deadline_goals or []),
        privacy_mappings=list(state.privacy_mappings or []),
        app_only_events=list(state.app_only_events or []),
        add_alarm_draft=state.add_alarm_draft if isinstance(state.add_alarm_draft, dict) else None,
    )


def build_planner_workspace(
    db: Session,
    *,
    user_id: str,
    active_date: Optional[date] = None,
    timezone_name: str = "Asia/Seoul",
) -> dict:
    resolved_date = active_date or _planner_today_in_timezone(timezone_name)
    workspace_id = f"planner:{user_id}"
    client_state = (
        db.query(PlannerClientState).filter(PlannerClientState.user_id == user_id).first()
    )
    deadline_goals = list(client_state.deadline_goals or []) if client_state is not None else []
    plan = (
        db.query(DayPlan)
        .filter(
            DayPlan.user_id == user_id,
            DayPlan.date == resolved_date,
            DayPlan.deleted_at.is_(None),
        )
        .first()
    )
    reminder_jobs = (
        db.query(ReminderJob)
        .filter(
            ReminderJob.user_id == user_id,
            ReminderJob.plan_date == resolved_date,
            ReminderJob.state != "canceled",
        )
        .order_by(ReminderJob.updated_at.desc(), ReminderJob.job_id.desc())
        .all()
    )

    updated_candidates: list[datetime] = []
    if plan is not None and plan.updated_at is not None:
        updated_candidates.append(plan.updated_at)
    if client_state is not None and client_state.updated_at is not None:
        updated_candidates.append(client_state.updated_at)
    updated_candidates.extend(job.updated_at for job in reminder_jobs if job.updated_at is not None)
    latest_updated_at = max(updated_candidates) if updated_candidates else None
    workspace_version = max(
        int(plan.version or 0) if plan is not None else 0,
        int(client_state.version or 0) if client_state is not None else 0,
    )

    if plan is None:
        return {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "timezone": timezone_name,
            "active_date": resolved_date,
            "version": workspace_version,
            "updated_at": _serialize_optional_datetime(latest_updated_at),
            "source": {
                "projection_source": "client_state" if deadline_goals else "empty",
                "day_id": None,
                "reminder_count": len(reminder_jobs),
                "client_state_version": int(client_state.version or 0) if client_state is not None else 0,
            },
            "deadlines": deadline_goals,
            "goal_items": [],
            "daily_assignments": [],
            "alarm_policies": [],
            "execution_states": [],
        }

    items = list(plan.items or [])
    task_ids = {int(item["task_id"]) for item in items if isinstance(item, dict) and item.get("task_id")}
    task_map: dict[int, str] = {}
    if task_ids:
        task_rows = db.query(Task.task_id, Task.title).filter(Task.task_id.in_(task_ids)).all()
        task_map = {int(task_id): str(title or "").strip() for task_id, title in task_rows}

    reminder_by_task_uid: dict[str, list[ReminderJob]] = {}
    for job in reminder_jobs:
        reminder_by_task_uid.setdefault(str(job.task_uid or "").strip(), []).append(job)

    goal_items: list[dict] = []
    daily_assignments: list[dict] = []
    alarm_policies: list[dict] = []
    execution_states: list[dict] = []

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        item_id = str(item.get("item_id") or f"{plan.day_id}:{idx}")
        task_uid = str(item.get("task_uid") or f"{plan.day_id}:{idx}").strip()
        task_id = int(item["task_id"]) if item.get("task_id") else None
        task_title = str(item.get("task_title") or "").strip() or task_map.get(task_id or -1) or f"Plan item {idx + 1}"
        planned_minutes = int(item.get("planned_block_minutes") or 0) or 30
        goal_item_id = f"goal:{task_uid}"
        assignment_id = f"assignment:{item_id}"

        goal_items.append(
            {
                "goal_item_id": goal_item_id,
                "source": "day_plan_projection",
                "task_id": task_id,
                "task_uid": task_uid,
                "title": task_title,
                "est_minutes": planned_minutes,
                "status": "OPEN",
                "updated_at": _serialize_optional_datetime(plan.updated_at),
            }
        )

        daily_assignments.append(
            {
                "assignment_id": assignment_id,
                "date": resolved_date.isoformat(),
                "goal_item_ids": [goal_item_id],
                "planned_minutes": planned_minutes,
                "task_uid": task_uid,
                "title": task_title,
                "status": "PLANNED",
                "updated_at": _serialize_optional_datetime(plan.updated_at),
            }
        )

        alarm = item.get("alarm") if isinstance(item.get("alarm"), dict) else None
        task_jobs = reminder_by_task_uid.get(task_uid, [])
        if alarm is not None or task_jobs:
            first_job = task_jobs[0] if task_jobs else None
            channels = list(dict.fromkeys(job.channel for job in task_jobs if job.channel))
            alarm_policies.append(
                {
                    "alarm_policy_id": f"alarm:{task_uid}",
                    "assignment_id": assignment_id,
                    "task_uid": task_uid,
                    "start_time": (
                        str(alarm.get("start_time") or alarm.get("time") or "").strip()
                        if alarm is not None
                        else (first_job.alarm_time_local if first_job else None)
                    ),
                    "end_time": str(alarm.get("end_time") or "").strip() if alarm is not None else None,
                    "ends_next_day": bool(alarm.get("ends_next_day")) if alarm is not None else False,
                    "repeat": (
                        str(alarm.get("repeat") or "").strip()
                        if alarm is not None and alarm.get("repeat")
                        else (first_job.repeat_rule if first_job else "once")
                    ),
                    "custom_days": (
                        list(alarm.get("custom_days") or [])
                        if alarm is not None
                        else list(first_job.custom_days or []) if first_job else []
                    ),
                    "source_type": (
                        str(item.get("source_type") or (alarm.get("source_type") if alarm is not None else "") or "").strip()
                        or "service"
                    ),
                    "channels": channels,
                    "state": first_job.state if first_job is not None else "draft",
                    "next_fire_at_utc": _serialize_optional_datetime(first_job.next_fire_at_utc) if first_job is not None else None,
                    "updated_at": _serialize_optional_datetime(
                        max([job.updated_at for job in task_jobs if job.updated_at is not None], default=plan.updated_at)
                    ),
                }
            )

        execution_states.append(
            {
                "execution_state_id": f"execution:{assignment_id}",
                "assignment_id": assignment_id,
                "status": "SCHEDULED" if alarm is not None or task_jobs else "PLANNED",
                "completed_goal_item_ids": [],
                "updated_at": _serialize_optional_datetime(plan.updated_at),
            }
        )

    return {
        "workspace_id": workspace_id,
        "user_id": user_id,
        "timezone": timezone_name,
        "active_date": resolved_date,
        "version": workspace_version,
        "updated_at": _serialize_optional_datetime(latest_updated_at),
        "source": {
            "projection_source": "day_plan_projection",
            "day_id": int(plan.day_id),
            "day_plan_version": int(plan.version or 0),
            "reminder_count": len(reminder_jobs),
            "client_state_version": int(client_state.version or 0) if client_state is not None else 0,
        },
        "deadlines": deadline_goals,
        "goal_items": goal_items,
        "daily_assignments": daily_assignments,
        "alarm_policies": alarm_policies,
        "execution_states": execution_states,
    }


def save_day_with_mission(
    db: Session,
    body: PlanDayWithMissionRequest,
    user_id: str,
):
    """
    Unified write path for web and mobile:
    - overwrite day plan items (existing behavior)
    - optional optimistic concurrency via expected_version
    - optional idempotency via client_request_id
    """

    def _compute():
        plan = create_or_update_day_plan_with_mission(
            db=db,
            body=body,
            user_id=user_id,
        )
        return _to_plan_day_response_payload(plan)

    return idem_get_or_set(
        db=db,
        user_id=user_id,
        scope="spec:plan:day-with-mission",
        key=body.client_request_id,
        compute=_compute,
    )


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
