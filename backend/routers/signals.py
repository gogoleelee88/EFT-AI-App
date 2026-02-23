from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.proposal_os import AuditEvent, Signal
from schemas.proposal_os import SignalIngestRequest, SignalResponse

router = APIRouter(tags=["proposal-os-signals"])


def _to_signal_response(row: Signal) -> SignalResponse:
    return SignalResponse(
        signal_id=row.signal_id,
        user_id=row.user_id,
        signal_type=row.signal_type,  # type: ignore[arg-type]
        source=row.source,
        title=row.title,
        body=row.body,
        metadata=row.metadata_json or {},
        occurred_at=row.occurred_at,
        created_at=row.created_at,
    )


@router.post("/signal/ingest", response_model=SignalResponse)
@router.post("/api/signal/ingest", response_model=SignalResponse)
def ingest_signal(body: SignalIngestRequest, db: Session = Depends(get_db)) -> SignalResponse:
    row = Signal(
        signal_id=str(uuid4()),
        user_id=body.user_id,
        signal_type=body.signal_type,
        source=body.source,
        title=body.title,
        body=body.body,
        metadata_json=body.metadata,
        occurred_at=body.occurred_at,
    )
    db.add(row)
    db.add(
        AuditEvent(
            entity_type="signal",
            entity_id=row.signal_id,
            action="ingest",
            actor=body.user_id,
            payload={"signal_type": body.signal_type, "source": body.source},
        )
    )
    db.commit()
    db.refresh(row)
    return _to_signal_response(row)


@router.get("/signal/list", response_model=list[SignalResponse])
@router.get("/api/signal/list", response_model=list[SignalResponse])
def list_signals(
    user_id: str = Query(..., min_length=1, max_length=64),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[SignalResponse]:
    rows = (
        db.query(Signal)
        .filter(Signal.user_id == user_id)
        .order_by(Signal.created_at.desc())
        .limit(limit)
        .all()
    )
    # if occurred_at is missing for temporal records, keep deterministic now marker for consumers
    for row in rows:
        if row.occurred_at is None and row.signal_type == "temporal":
            row.occurred_at = datetime.now(timezone.utc)
    return [_to_signal_response(row) for row in rows]


