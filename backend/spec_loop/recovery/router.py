from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from services.auth_service import AuthService
from backend.spec_loop.recovery.schemas import (
    IosSignalIn,
    RecoveryEventIn,
    RecoveryEventOut,
    RecoveryJournalOut,
    RecoveryJournalSummaryInputOut,
)
from backend.spec_loop.recovery.service import (
    create_recovery_event,
    create_recovery_event_from_ios_signal,
    get_recovery_journal,
    get_recovery_journal_summary_input,
)

router = APIRouter(prefix="/recovery", tags=["recovery"])
auth_service = AuthService()


def _decode_user_id_from_cookie(access_token: Optional[str]) -> Optional[str]:
    if not access_token:
        return None
    try:
        payload = auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            return None
        sub = payload.get("sub")
        return sub if isinstance(sub, str) and sub.strip() else None
    except Exception:
        return None


def _resolve_user_id(explicit_user_id: Optional[str], access_token: Optional[str]) -> Optional[str]:
    cookie_user_id = _decode_user_id_from_cookie(access_token)
    if explicit_user_id and cookie_user_id and explicit_user_id != cookie_user_id:
        raise HTTPException(status_code=403, detail="user_id mismatch")
    return explicit_user_id or cookie_user_id


@router.post("/events", response_model=RecoveryEventOut)
def post_recovery_event(
    body: RecoveryEventIn,
    user_id: Optional[str] = Query(None, min_length=1),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> RecoveryEventOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    return create_recovery_event(db, body, user_id=resolved_user_id)


@router.post("/ios-signals", response_model=RecoveryEventOut)
def post_ios_signal(
    body: IosSignalIn,
    user_id: Optional[str] = Query(None, min_length=1),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> RecoveryEventOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    return create_recovery_event_from_ios_signal(db, body, user_id=resolved_user_id)


@router.get("/journal", response_model=RecoveryJournalOut)
def get_recovery_journal_endpoint(
    user_id: Optional[str] = Query(None, min_length=1),
    days: int = Query(1, ge=1, le=30),
    limit: int = Query(200, ge=1, le=1000),
    from_ts: Optional[datetime] = Query(None),
    to_ts: Optional[datetime] = Query(None),
    include_events: bool = Query(True),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> RecoveryJournalOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    if not resolved_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    return get_recovery_journal(
        db,
        user_id=resolved_user_id,
        days=days,
        limit=limit,
        from_ts=from_ts,
        to_ts=to_ts,
        include_events=include_events,
    )


@router.get("/journal-summary-input", response_model=RecoveryJournalSummaryInputOut)
def get_recovery_journal_summary_input_endpoint(
    user_id: Optional[str] = Query(None, min_length=1),
    days: int = Query(1, ge=1, le=30),
    from_ts: Optional[datetime] = Query(None),
    to_ts: Optional[datetime] = Query(None),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
    db: Session = Depends(get_db),
) -> RecoveryJournalSummaryInputOut:
    resolved_user_id = _resolve_user_id(user_id, access_token)
    if not resolved_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    return get_recovery_journal_summary_input(
        db,
        user_id=resolved_user_id,
        days=days,
        from_ts=from_ts,
        to_ts=to_ts,
    )
