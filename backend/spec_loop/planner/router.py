from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.models.day_plan import DayPlan
from backend.spec_loop.planner.schemas import (
    PlanDayRequest,
    PlanDayResponse,
    PlanDayWithMissionRequest,
)
from backend.spec_loop.planner.service import (
    create_or_update_day_plan,
    create_or_update_day_plan_with_mission,
    restore_day_plan,
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
    )


@router.get("/day/{day_id}", response_model=PlanDayResponse)
def get_plan_day(day_id: int, db: Session = Depends(get_db)) -> PlanDayResponse:
    """day_id濡?DayPlan 議고쉶 (Resistance/Checkin 蹂댁“ ?쇱슦?곗슜)."""
    plan = db.query(DayPlan).filter(DayPlan.day_id == day_id).one_or_none()
    if plan is None or plan.deleted_at is not None:
        raise HTTPException(status_code=404, detail="DayPlan??李얠쓣 ???놁뒿?덈떎.")
    return PlanDayResponse(
        day_id=plan.day_id,
        date=plan.date,
        mode=plan.mode,
        items=plan.items or [],
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
    body: PlanDayWithMissionRequest, db: Session = Depends(get_db)
) -> PlanDayResponse:
    """誘몄뀡 ?ы븿 DayPlan ?앹꽦/媛깆떊 (?뺤옣 踰꾩쟾)."""
    plan = create_or_update_day_plan_with_mission(db, body)
    return PlanDayResponse(
        day_id=plan.day_id,
        date=plan.date,
        mode=plan.mode,
        items=plan.items or [],
    )

