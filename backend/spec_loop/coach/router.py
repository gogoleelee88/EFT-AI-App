# POST /resistance/event
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.models import DayPlan
from backend.spec_loop.coach.schemas import ResistanceEventRequest, ResistanceEventResponse
from backend.spec_loop.coach.service import record_resistance_event

router = APIRouter(prefix="/resistance", tags=["resistance"])


@router.post("/event", response_model=ResistanceEventResponse)
def post_resistance_event(body: ResistanceEventRequest, db: Session = Depends(get_db)) -> ResistanceEventResponse:
    """day_id, task_id?, trigger, intensity(0-10), context? ??event_id, ts, action, lock_applied, adapt_required."""
    plan = db.query(DayPlan).filter(DayPlan.day_id == body.day_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="day_id not found")

    row, action, adapt_required = record_resistance_event(
        db,
        body.day_id,
        body.task_id,
        body.trigger,
        body.intensity,
        body.context,
    )
    return ResistanceEventResponse(
        event_id=row.event_id,
        ts=row.ts,
        action=action,
        lock_applied=row.lock_applied or 120,
        adapt_required=adapt_required,
    )

