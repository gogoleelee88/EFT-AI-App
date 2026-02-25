"""
StrictIntake ê°ì ?¸í?´í¬ ê¸°ë¡ ì¡°í??API

- ìµê·¼ ?¸ì ë¦¬ì¤??
- ê¸°ë³¸ ?µê³ (ê°ì ë¶í¬, ?ê· ê°ë ??
"""

from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.intake_storage import IntakeStorageService, IntakeDataModel
from utils.logger import get_logger


logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/intake",
    tags=["intake"],
    responses={404: {"description": "Not found"}},
)


class IntakeSessionSummary(BaseModel):
    id: int
    created_at: datetime
    core_emotion: str
    situation_context: str
    automatic_thought: str
    physical_sensation: Optional[str] = None
    behavioral_reaction: Optional[str] = None
    intensity: int
    available_time: Optional[int] = None
    immediate_goal: Optional[str] = None


class IntakeStatsResponse(BaseModel):
    total_records: int
    emotion_distribution: Dict[str, int]
    average_intensity: float
    n8n_sent: int
    n8n_pending: int


def _get_storage() -> IntakeStorageService:
    """
    IntakeStorageService ?¸ì¤?´ì¤ë¥??ì±?ë¤.
    (?´ë? main.startup?ì ì´ê¸°?ëì§ë§? ?¬ê¸°?ë ?ë¦½?ì¼ë¡??¬ì© ê°?¥í?ë¡ ?ë¡ ?ì±)
    """
    try:
        return IntakeStorageService(
            n8n_webhook_url=None,  # ì¡°í?ë ?ì ?ì
        )
    except Exception as e:
        logger.error(f"[Intake API] Storage ì´ê¸°???¤í¨: {e}")
        raise HTTPException(status_code=500, detail="Intake ??¥ì ì´ê¸°???¤í¨")


@router.get("/recent", response_model=List[IntakeSessionSummary])
async def get_recent_intake(limit: int = 5) -> List[IntakeSessionSummary]:
    """
    ìµê·¼ StrictIntake ê°ì ?¸í?´í¬ ê¸°ë¡??ì¡°í?ë¤.
    (??ë³´?ì© ?ì½ ë·?
    """
    storage = _get_storage()
    db = storage.SessionLocal()
    try:
        q = (
            db.query(IntakeDataModel)
            .order_by(IntakeDataModel.created_at.desc())
            .limit(max(1, min(limit, 20)))
        )
        rows: List[IntakeDataModel] = q.all()

        summaries: List[IntakeSessionSummary] = []
        for r in rows:
            summaries.append(
                IntakeSessionSummary(
                    id=r.id,
                    created_at=r.created_at,
                    core_emotion=r.core_emotion,
                    situation_context=r.situation_context,
                    automatic_thought=r.automatic_thought,
                    physical_sensation=r.physical_sensation,
                    behavioral_reaction=r.behavioral_reaction,
                    intensity=r.intensity,
                    available_time=r.available_time,
                    immediate_goal=r.immediate_goal,
                )
            )
        return summaries
    except Exception as e:
        logger.error(f"[Intake API] ìµê·¼ ?¸í?´í¬ ì¡°í ?¤í¨: {e}")
        raise HTTPException(status_code=500, detail="ìµê·¼ ê°ì ê¸°ë¡??ë¶ë¬?¤ì? ëª»í?µë??")
    finally:
        db.close()


@router.get("/stats", response_model=IntakeStatsResponse)
async def get_intake_stats() -> IntakeStatsResponse:
    """
    StrictIntake ?°ì´??ê¸°ë° ê¸°ë³¸ ?µê³ë¥?ì¡°í?ë¤.
    """
    storage = _get_storage()
    try:
        stats = storage.get_statistics()
        return IntakeStatsResponse(**stats)
    except Exception as e:
        logger.error(f"[Intake API] ?µê³ ì¡°í ?¤í¨: {e}")
        raise HTTPException(status_code=500, detail="ê°ì ê¸°ë¡ ?µê³ë¥?ë¶ë¬?¤ì? ëª»í?µë??")


