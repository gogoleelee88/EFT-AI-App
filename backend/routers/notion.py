"""
Notion ê°ì • ê¸°ë¡ API ?¼ìš°??
- ë¡œê·¸?¸í•œ ?¬ìš©??+ Notion OAuth ?°ë™ ???¬ìš©???Œí¬?¤í˜?´ìŠ¤??ê°œì¸ DB??ê¸°ë¡
- (?ˆê±°?? ?´ì˜??ê³µìš© ?µí•©?€ notion_service.create_emotion_pageë¡?? ì?
"""
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Depends, Cookie
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models.chat_models import StrictIntakeInput
from models.user import User
from services.auth_service import AuthService
from services.notion_service import create_emotion_page_with_token
from services.user_notion_service import get_user_notion_service
from utils.logger import get_logger


logger = get_logger(__name__)
auth_service = AuthService()
user_notion_service = get_user_notion_service()

router = APIRouter(
    prefix="/api/notion",
    tags=["notion"],
    responses={404: {"description": "Not found"}},
)


def get_current_user(
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> User:
    if not access_token:
        raise HTTPException(status_code=401, detail="ë¡œê·¸?¸ì´ ?„ìš”?©ë‹ˆ??")
    try:
        payload = auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="?˜ëª»??? í° ? í˜•?…ë‹ˆ??")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="? í°???¬ìš©???•ë³´ê°€ ?†ìŠµ?ˆë‹¤.")
        user = db.query(User).filter(User.id == user_id).one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="?¬ìš©?ë? ì°¾ì„ ???†ìŠµ?ˆë‹¤.")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="? í° ê²€ì¦ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.")


class NotionSaveRequest(BaseModel):
    """Notion ?€???”ì²­ ëª¨ë¸"""
    # ê³¼ê±° ?¸í™˜???„ë“œ(ë¬´ì‹œ), ?¤ì œ ?´ë©”?¼ì? ë¡œê·¸?¸í•œ ?¬ìš©?ì—??ê°€?¸ì˜¨??
    user_email: Optional[str] = Field(
        default=None,
        description="?¬ìš©???´ë©”??(???´ìƒ ?¬ìš©?˜ì? ?ŠìŒ)",
    )
    strict_intake: StrictIntakeInput = Field(..., description="STRICT6 ê°ì • ?¸í…Œ?´í¬ ?°ì´??)
    intensity_after: int = Field(..., ge=0, le=10, description="ê°œì… ??ê°ì • ê°•ë„ (0~10)")
    session_type: Optional[Literal["eftar", "meditation"]] = Field(
        default=None,
        description="Session type marker (eftar or meditation)",
    )
    solution: Optional[str] = Field(
        default="EFT ??•‘ + ë°•ìŠ¤ ?¸í¡",
        description="AIê°€ ?œì•ˆ???”ë£¨??,
    )


class NotionSaveResponse(BaseModel):
    """Notion ?€???‘ë‹µ ëª¨ë¸"""
    success: bool
    notion_page_id: Optional[str] = None
    message: str
    timestamp: str
    delta_intensity: int


@router.post("/create-emotion-page", response_model=NotionSaveResponse)
async def save_emotion_to_notion(
    request: NotionSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    STRICT6 ê°ì • ?¸í…Œ?´í¬ + intensity_afterë¥?Notion???€??

    - ?¬ìš©?ê? Notion OAuth ?°ë™???„ë£Œ?ˆë‹¤ë©? ?´ë‹¹ ?¬ìš©?ì˜ ?Œí¬?¤í˜?´ìŠ¤ DB???€??    - ?°ë™???†ë‹¤ë©? HTTP 400 ?ëŸ¬ ë°˜í™˜ (?„ë¡ ?¸ì—???°ë™ ? ë„)
    """
    try:
        email = user.email
        logger.info(
            f"[Notion] ê°ì • ê¸°ë¡ ?€???œì‘: {email}, "
            f"ê°ì •={request.strict_intake.core_emotion}, "
            f"ê°•ë„={request.strict_intake.intensity}??request.intensity_after}"
        )

        # 1) ?¬ìš©??Notion ?°ë™ ?¬ë? ?•ì¸
        if not user.notion_access_token:
            raise HTTPException(
                status_code=400,
                detail="Notion ?°ë™???˜ì–´ ?ˆì? ?ŠìŠµ?ˆë‹¤. ?¤ì •?ì„œ Notion ?°ë™??ë¨¼ì? ì§„í–‰?´ì£¼?¸ìš”.",
            )

        # 2) ?¬ìš©???Œí¬?¤í˜?´ìŠ¤??ê°ì • ê¸°ë¡ DB ?•ë³´ (?†ìœ¼ë©??ì„±)
        try:
            user_db_id = await user_notion_service.ensure_user_database(db, user)
        except Exception as db_err:
            logger.exception(f"[Notion] ?¬ìš©??DB ?•ë³´ ?¤íŒ¨: {email} - {db_err}")
            raise HTTPException(
                status_code=500,
                detail="?¬ìš©??Notion ?°ì´?°ë² ?´ìŠ¤ë¥??ì„±/?•ë³´?˜ëŠ” ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
            )

        # 3) ?¬ìš©??? í° ë³µí˜¸??        try:
            access_token = user_notion_service.get_decrypted_access_token(user)
        except Exception as token_err:
            logger.exception(f"[Notion] ?¬ìš©??? í° ë³µí˜¸???¤íŒ¨: {email} - {token_err}")
            raise HTTPException(
                status_code=500,
                detail="?¬ìš©??Notion ? í°??ë³µí˜¸?”í•˜??ì¤??¤ë¥˜ê°€ ë°œìƒ?ˆìŠµ?ˆë‹¤.",
            )

        # 4) ?¬ìš©???„ìš© DB??ê¸°ë¡
        result = await create_emotion_page_with_token(
            access_token=access_token,
            database_id=user_db_id,
            user_email=email,
            strict_intake=request.strict_intake,
            session_type=request.session_type,
            intensity_after=request.intensity_after,
            solution=request.solution,
        )

        if result is None:
            logger.error(f"[Notion] ?€???¤íŒ¨: {email}")
            raise HTTPException(
                status_code=500,
                detail="Notion ?€???¤íŒ¨. ?¬ìš©??Notion ê¶Œí•œ ?ëŠ” DB ?¤ì •???•ì¸?´ì£¼?¸ìš”.",
            )

        delta = request.strict_intake.intensity - request.intensity_after

        logger.info(
            f"[Notion] ?€???±ê³µ (?¬ìš©??DB): ?˜ì´ì§€ ID={result.get('id')}, "
            f"ê°•ë„ ë³€??{delta}"
        )

        return NotionSaveResponse(
            success=True,
            notion_page_id=result.get("id"),
            message=f"ê°ì • ê¸°ë¡???±ê³µ?ìœ¼ë¡??€?¥ë˜?ˆìŠµ?ˆë‹¤. (ê°•ë„ {delta:+d} ë³€??",
            timestamp=datetime.now().isoformat(),
            delta_intensity=delta,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[Notion] ?ˆìƒì¹?ëª»í•œ ?¤ë¥˜: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"?œë²„ ?´ë? ?¤ë¥˜: {str(e)}",
        )


@router.get("/health")
async def notion_health_check():
    """
    Notion ?°ë™ ?íƒœ ?•ì¸ (?´ì˜??ê³µìš© ?µí•© ê¸°ì?)
    """
    import os

    api_key = os.getenv("NOTION_API_KEY")
    db_id = os.getenv("NOTION_DATABASE_ID")

    return {
        "status": "healthy",
        "configured": bool(api_key and db_id),
        "api_key_set": bool(api_key),
        "database_id_set": bool(db_id),
        "service": "loaded",
    }

