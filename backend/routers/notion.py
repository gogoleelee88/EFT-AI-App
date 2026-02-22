"""
Notion 챗째챙 챗쨍째챘징 API ?쩌챙째??
- 챘징챗쨌쨍?쨍챠 ?짭챙짤??+ Notion OAuth ?째챘 ???짭챙짤???챠짭?짚챠?쨈챙짚??챗째챙쨍 DB??챗쨍째챘징
- (?챗짹째?? ?쨈챙??챗쨀쨉챙짤 ?쨉챠짤? notion_service.create_emotion_page챘징??챙?
"""
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Depends, Cookie
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.chat_models import StrictIntakeInput
from backend.models.user import User
from services.auth_service import AuthService
from services.notion_service import create_emotion_page_with_token
from services.user_notion_service import get_user_notion_service
from utils.logger import get_logger


logger = get_logger(__name__)
auth_service = AuthService()

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
        raise HTTPException(status_code=401, detail="챘징챗쨌쨍?쨍챙쨈 ?챙?짤챘??")
    try:
        payload = auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="?챘짧쨩???챠째 ?챠?챘??")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="?챠째???짭챙짤???챘쨀쨈챗째 ?챙쨉?챘짚.")
        user = db.query(User).filter(User.id == user_id).one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="?짭챙짤?챘? 챙째쩐챙 ???챙쨉?챘짚.")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="?챠째 챗짼챙짝챙 ?짚챠짢?챙쨉?챘짚.")


class NotionSaveRequest(BaseModel):
    """Notion ????챙짼 챘짧짢챘쨍"""
    # 챗쨀쩌챗짹째 ?쨍챠???챘(챘짭쨈챙), ?짚챙 ?쨈챘짤?쩌챙? 챘징챗쨌쨍?쨍챠 ?짭챙짤?챙??챗째?쨍챙짢??
    user_email: Optional[str] = Field(
        default=None,
        description="?짭챙짤???쨈챘짤??(???쨈챙 ?짭챙짤?챙? ?챙)",
    )
    strict_intake: StrictIntakeInput = Field(..., description="STRICT6 intake payload used for notion page creation")
    intensity_after: int = Field(..., ge=0, le=10, description="챗째챙 ??챗째챙 챗째챘 (0~10)")
    session_type: Optional[Literal["eftar", "meditation"]] = Field(
        default=None,
        description="Session type marker (eftar or meditation)",
    )
    solution: Optional[str] = Field(
        default="EFT ?? + 챘째챙짚 ?쨍챠징",
        description="AI-generated guidance content used for notion save"
    )


class NotionSaveResponse(BaseModel):
    """Notion ????챘쨉 챘짧짢챘쨍"""
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
    STRICT6 챗째챙 ?쨍챠?쨈챠짭 + intensity_after챘짜?Notion?????

    - ?짭챙짤?챗? Notion OAuth ?째챘???챘짙?챘짚챘짤? ?쨈챘쨔 ?짭챙짤?챙 ?챠짭?짚챠?쨈챙짚 DB?????    - ?째챘???챘짚챘짤? HTTP 400 ?챘짭 챘째챠 (?챘징?쨍챙???째챘 ?챘)
    """
    try:
        notion_service = get_user_notion_service()
        email = user.email
        logger.info(
            f"[Notion] 챗째챙 챗쨍째챘징 ????챙: {email}, "
            f"챗째챙={request.strict_intake.core_emotion}, "
            f"감정 강도 시작={request.strict_intake.intensity}, 종료={request.intensity_after}"
        )

        # 1) ?짭챙짤??Notion ?째챘 ?짭챘? ?챙쨍
        if not user.notion_access_token:
            raise HTTPException(
                status_code=400,
                detail="Notion ?째챘???챙쨈 ?챙? ?챙쨉?챘짚. ?짚챙?챙 Notion ?째챘??챘짢쩌챙? 챙짠챠?쨈챙짙쩌?쨍챙.",
            )

        # 2) ?짭챙짤???챠짭?짚챠?쨈챙짚??챗째챙 챗쨍째챘징 DB ?챘쨀쨈 (?챙쩌챘짤??챙짹)
        try:
            user_db_id = await notion_service.ensure_user_database(db, user)
        except Exception as db_err:
            logger.exception(f"[Notion] ?짭챙짤??DB ?챘쨀쨈 ?짚챠짢: {email} - {db_err}")
            raise HTTPException(
                status_code=500,
                detail="?짭챙짤??Notion ?째챙쨈?째챘짼?쨈챙짚챘짜??챙짹/?챘쨀쨈?챘 챙짚??짚챘짜챗째 챘째챙?챙쨉?챘짚.",
            )

        # 3) Notion access token 복호화
        try:
            access_token = notion_service.get_decrypted_access_token(user)
        except Exception as token_err:
            logger.exception(f"[Notion] Notion access token 복호화 실패: {email} - {token_err}")
            raise HTTPException(
                status_code=500,
                detail="Notion access token decoding failed."
            )
        # 4) ?짭챙짤???챙짤 DB??챗쨍째챘징
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
            logger.error(f"[Notion] ????짚챠짢: {email}")
            raise HTTPException(
                status_code=500,
                detail="Notion ????짚챠짢. ?짭챙짤??Notion 챗쨋챠 ?챘 DB ?짚챙???챙쨍?쨈챙짙쩌?쨍챙.",
            )

        delta = request.strict_intake.intensity - request.intensity_after

        logger.info(
            f"[Notion] ????짹챗쨀쨉 (?짭챙짤??DB): ?챙쨈챙짠 ID={result.get('id')}, "
            f"챗째챘 챘쨀??{delta}"
        )

        return NotionSaveResponse(
            success=True,
            notion_page_id=result.get("id"),
            message=f"챗째챙 챗쨍째챘징???짹챗쨀쨉?챙쩌챘징???짜챘?챙쨉?챘짚. (챗째챘 {delta:+d} 챘쨀??",
            timestamp=datetime.now().isoformat(),
            delta_intensity=delta,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[Notion] ?챙챙쨔?챘짧쨩챠 ?짚챘짜: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"?챘짼 ?쨈챘? ?짚챘짜: {str(e)}",
        )


@router.get("/health")
async def notion_health_check():
    """
    Notion ?째챘 ?챠 ?챙쨍 (?쨈챙??챗쨀쨉챙짤 ?쨉챠짤 챗쨍째챙?)
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


