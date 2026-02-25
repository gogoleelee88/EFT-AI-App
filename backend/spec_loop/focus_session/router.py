from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.focus_session.schemas import (
    FocusSessionCreateIn,
    FocusSessionListOut,
    FocusSessionOut,
)
from backend.spec_loop.focus_session.service import (
    create_focus_session,
    list_active_sessions,
    stop_focus_session,
)

router = APIRouter(tags=["focus-sessions"])


@router.post("/focus-sessions/start", response_model=FocusSessionOut)
def start_focus_session(
    body: FocusSessionCreateIn,
    db: Session = Depends(get_db),
) -> FocusSessionOut:
    row = create_focus_session(
        db,
        user_id=body.user_id,
        schedule_id=body.schedule_id,
        mission_run_id=body.mission_run_id,
        schedule_type=body.schedule_type,
        auto_end_existing=body.auto_end_existing,
    )
    return FocusSessionOut.model_validate(row)


@router.post("/focus-sessions/{focus_session_id}/stop", response_model=FocusSessionOut)
def stop_focus_session_endpoint(
    focus_session_id: str,
    user_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> FocusSessionOut:
    row = stop_focus_session(db, focus_session_id=focus_session_id, user_id=user_id)
    return FocusSessionOut.model_validate(row)


@router.get("/focus-sessions/active", response_model=FocusSessionListOut)
def list_focus_sessions(
    user_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> FocusSessionListOut:
    rows = list_active_sessions(db, user_id=user_id)
    return FocusSessionListOut(items=[FocusSessionOut.model_validate(r) for r in rows])

