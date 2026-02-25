from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session as DBSession

from backend.database import get_db
from backend.focus.schemas import (
    EventsBatchIn,
    InterruptionLabelIn,
    ReentryCardOut,
    SessionCreateIn,
    SessionOut,
    SessionPatchIn,
    SettingsOut,
    SettingsPatchIn,
    StateOut,
    StuckIn,
    StuckOut,
)
from backend.focus.service import (
    create_session,
    get_reentry_card,
    get_settings,
    get_state,
    handle_stuck,
    ingest_events_batch,
    label_interruption,
    list_catalog,
    patch_session,
    patch_settings,
)

router = APIRouter(tags=["focus-sessions"])


@router.post("/sessions", response_model=SessionOut)
def post_sessions(body: SessionCreateIn, db: DBSession = Depends(get_db)) -> SessionOut:
    row = create_session(db, body)
    return SessionOut(
        id=row.id,
        user_id=row.user_id,
        task_title=row.task_title,
        goal=row.goal,
        timer_mode=row.timer_mode,
        duration=row.duration,
        status=row.status,
        next_step=row.next_step,
        sensors_enabled=row.sensors_enabled or {},
        planned_break=row.planned_break,
    )


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def patch_sessions(session_id: str, body: SessionPatchIn, db: DBSession = Depends(get_db)) -> SessionOut:
    row = patch_session(db, session_id, body)
    return SessionOut(
        id=row.id,
        user_id=row.user_id,
        task_title=row.task_title,
        goal=row.goal,
        timer_mode=row.timer_mode,
        duration=row.duration,
        status=row.status,
        next_step=row.next_step,
        sensors_enabled=row.sensors_enabled or {},
        planned_break=row.planned_break,
    )


@router.post("/events/batch")
def post_events_batch(body: EventsBatchIn, db: DBSession = Depends(get_db)) -> dict:
    return ingest_events_batch(db, body.events)


@router.get("/sessions/{session_id}/state", response_model=StateOut)
def get_session_state(session_id: str, db: DBSession = Depends(get_db)) -> StateOut:
    data = get_state(db, session_id)
    return StateOut(**data)


@router.get("/sessions/{session_id}/reentry_card", response_model=ReentryCardOut)
def get_session_reentry_card(session_id: str, db: DBSession = Depends(get_db)) -> ReentryCardOut:
    return ReentryCardOut(**get_reentry_card(db, session_id))


@router.post("/sessions/{session_id}/interruptions/label")
def post_interruption_label(session_id: str, body: InterruptionLabelIn, db: DBSession = Depends(get_db)) -> dict:
    row = label_interruption(
        db,
        session_id=session_id,
        interruption_type=body.interruption_type,
        user_initiated=body.user_initiated,
        notes=body.notes,
    )
    return {"id": row.id, "interruption_type": row.interruption_type, "user_labeled": row.user_labeled}


@router.post("/sessions/{session_id}/stuck", response_model=StuckOut)
def post_stuck(session_id: str, body: StuckIn, db: DBSession = Depends(get_db)) -> StuckOut:
    return StuckOut(**handle_stuck(db, session_id, body))


@router.get("/users/me/settings", response_model=SettingsOut)
def get_me_settings(user_id: str = Query(..., min_length=1), db: DBSession = Depends(get_db)) -> SettingsOut:
    row = get_settings(db, user_id)
    return SettingsOut(
        user_id=row.user_id,
        idle_threshold_seconds=row.idle_threshold_seconds,
        camera_enabled=row.camera_enabled,
        camera_weight=row.camera_weight,
        window_size_seconds=row.window_size_seconds,
        notification_prefs=row.notification_prefs or {},
        data_retention_days=row.data_retention_days,
    )


@router.patch("/users/me/settings", response_model=SettingsOut)
def patch_me_settings(
    body: SettingsPatchIn,
    user_id: str = Query(..., min_length=1),
    db: DBSession = Depends(get_db),
) -> SettingsOut:
    row = patch_settings(db, user_id, body)
    return SettingsOut(
        user_id=row.user_id,
        idle_threshold_seconds=row.idle_threshold_seconds,
        camera_enabled=row.camera_enabled,
        camera_weight=row.camera_weight,
        window_size_seconds=row.window_size_seconds,
        notification_prefs=row.notification_prefs or {},
        data_retention_days=row.data_retention_days,
    )


@router.get("/stuck/catalog")
def get_stuck_catalog() -> dict:
    return {"items": list_catalog()}


