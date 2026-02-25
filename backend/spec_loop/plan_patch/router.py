from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.plan_patch import service
from backend.spec_loop.plan_patch.schemas import (
    PlanPatchApplyRequest,
    PlanPatchApplyResponse,
    PlanPatchSuggestResponse,
)

router = APIRouter(prefix="/plan/patch", tags=["plan-patch"])


@router.get("/suggest", response_model=PlanPatchSuggestResponse)
def get_plan_patch_suggest(
    date: date,
    user_id: str | None = None,
    day_id: int | None = None,
    db: Session = Depends(get_db),
) -> PlanPatchSuggestResponse:
    payload = service.suggest_plan_patch(db, target_date=date, user_id=user_id, day_id=day_id)
    return PlanPatchSuggestResponse(**payload)


@router.post("/apply", response_model=PlanPatchApplyResponse)
def post_plan_patch_apply(body: PlanPatchApplyRequest, db: Session = Depends(get_db)) -> PlanPatchApplyResponse:
    payload = service.apply_plan_patch(
        db,
        target_date=body.date,
        patch_type=body.patch_type,
        user_id=body.user_id,
        day_id=body.day_id,
        event_id=body.event_id,
    )
    return PlanPatchApplyResponse(**payload)

