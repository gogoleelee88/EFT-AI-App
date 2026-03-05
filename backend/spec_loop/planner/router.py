from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.authz import get_current_user_spec
from backend.spec_loop.models.day_plan import DayPlan
from backend.spec_loop.planner.schemas import (
    PlanDayRequest,
    PlanDayResponse,
    PlanDayWithMissionRequest,
)
from backend.spec_loop.planner.service import (
    create_or_update_day_plan,
    get_day_plan_by_date,
    restore_day_plan,
    save_day_with_mission,
    soft_delete_day_plan,
)

router = APIRouter(prefix="/plan", tags=["plan"])


@router.post("/day", response_model=PlanDayResponse)
def post_plan_day(body: PlanDayRequest, db: Session = Depends(get_db)) -> PlanDayResponse:
    """date, mode, items -> day_id, date, mode, items. 400/404/422."""
    plan = create_or_update_day_plan(db, body)
    return PlanDayResponse(
        day_id=plan.day_id,
        date=plan.date,
        mode=plan.mode,
        items=plan.items or [],
        version=int(plan.version or 1),
    )


@router.get("/day-by-date", response_model=PlanDayResponse)
def get_plan_day_by_date(
    date_: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user_spec),
) -> PlanDayResponse:
    uid = str(getattr(user, "id", None) or getattr(user, "user_id", None) or "")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")
    day_payload = get_day_plan_by_date(db=db, user_id=uid, plan_date=date_)
    if day_payload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return day_payload


@router.get("/day/{day_id}", response_model=PlanDayResponse)
def get_plan_day(day_id: int, db: Session = Depends(get_db)) -> PlanDayResponse:
    """day_id to DayPlan."""
    plan = db.query(DayPlan).filter(DayPlan.day_id == day_id).one_or_none()
    if plan is None or plan.deleted_at is not None:
        raise HTTPException(status_code=404, detail="DayPlan not found")
    return PlanDayResponse(
        day_id=plan.day_id,
        date=plan.date,
        mode=plan.mode,
        items=plan.items or [],
        version=int(plan.version or 1),
    )


@router.delete("/day/{day_id}")
def delete_plan_day(
    day_id: int,
    user_id: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    plan = soft_delete_day_plan(db, day_id=day_id, user_id=user_id)
    return {
        "ok": True,
        "day_id": plan.day_id,
        "deleted_at": plan.deleted_at.isoformat() if plan.deleted_at else None,
    }


@router.post("/day/{day_id}/restore")
def restore_plan_day_endpoint(
    day_id: int,
    user_id: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    plan = restore_day_plan(db, day_id=day_id, user_id=user_id)
    return {"ok": True, "day_id": plan.day_id, "restored": True}


@router.post("/day-with-mission", response_model=PlanDayResponse)
def post_plan_day_with_mission(
    body: PlanDayWithMissionRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_spec),
) -> PlanDayResponse:
    uid = str(getattr(user, "id", None) or getattr(user, "user_id", None) or "")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid user")
    return save_day_with_mission(db=db, body=body, user_id=uid)
