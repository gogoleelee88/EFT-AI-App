from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.cycle.schemas import CycleStateResponse, PeriodStartRequest, PeriodStartResponse
from backend.spec_loop.cycle import service

router = APIRouter(prefix="/cycle", tags=["cycle"])


@router.get("/state", response_model=CycleStateResponse)
def get_cycle_state(date: date, user_id: str | None = None, db: Session = Depends(get_db)) -> CycleStateResponse:
    return service.get_cycle_state(db, reference_date=date, user_id=user_id)


@router.post("/period_start", response_model=PeriodStartResponse)
def post_period_start(body: PeriodStartRequest, db: Session = Depends(get_db)) -> PeriodStartResponse:
    row = service.upsert_cycle_state(
        db=db,
        reference_date=body.period_start_date,
        user_id=body.user_id,
        last_period_start_date=body.period_start_date,
    )
    return PeriodStartResponse(
        recorded=True,
        cycle_state=CycleStateResponse(
            date=row.date,
            last_period_start_date=row.last_period_start_date,
            avg_cycle_len_days=row.avg_cycle_len_days,
            cycle_len_std_days=row.cycle_len_std_days,
            irregularity_level=row.irregularity_level,  # type: ignore[arg-type]
            phase_prob=row.phase_prob or {},
            next_period_window=row.next_period_window,
            confidence=row.confidence,  # type: ignore[arg-type]
            evidence_snapshot=list(row.evidence_snapshot or []),
        ),
    )

