# POST /condition/checkin. ê²°ì 4: 30ì´?ì²´í¬??UX ëª©í, ë°±ì??ê²ì¦??ì.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.condition.schemas import CheckinRequest, CheckinResponse
from backend.spec_loop.condition.service import checkin

router = APIRouter(prefix="/condition", tags=["condition"])


@router.post("/checkin", response_model=CheckinResponse)
def post_condition_checkin(body: CheckinRequest, db: Session = Depends(get_db)) -> CheckinResponse:
    """ì²´í¬????? condition_scoreÂ·final_mode, ?ì ???´ë? adapt. 30ì´?ê²ì¦??ì(ê²°ì 4)."""
    return checkin(db, body)

