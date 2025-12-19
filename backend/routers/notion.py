"""
Notion 감정 기록 API 라우터
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from backend.models.chat_models import StrictIntakeInput
from backend.services.notion_service import create_emotion_page
from backend.utils.logger import get_logger


logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/notion",
    tags=["notion"],
    responses={404: {"description": "Not found"}},
)


class NotionSaveRequest(BaseModel):
    """Notion 저장 요청 모델"""
    user_email: str = Field(..., description="사용자 이메일")
    strict_intake: StrictIntakeInput = Field(..., description="STRICT6 감정 인테이크 데이터")
    intensity_after: int = Field(..., ge=0, le=10, description="개입 후 감정 강도 (0~10)")
    solution: Optional[str] = Field(
        default="EFT 탭핑 + 박스 호흡",
        description="AI가 제안한 솔루션"
    )


class NotionSaveResponse(BaseModel):
    """Notion 저장 응답 모델"""
    success: bool
    notion_page_id: Optional[str] = None
    message: str
    timestamp: str
    delta_intensity: int


@router.post("/create-emotion-page", response_model=NotionSaveResponse)
async def save_emotion_to_notion(request: NotionSaveRequest):
    """
    STRICT6 감정 인테이크 + intensity_after를 Notion에 저장
    """
    try:
        logger.info(
            f"[Notion] 감정 기록 저장 시작: {request.user_email}, "
            f"감정={request.strict_intake.core_emotion}, "
            f"강도={request.strict_intake.intensity}→{request.intensity_after}"
        )

        result = await create_emotion_page(
            user_email=request.user_email,
            strict_intake=request.strict_intake,
            intensity_after=request.intensity_after,
            solution=request.solution
        )

        if result is None:
            logger.error(f"[Notion] 저장 실패: {request.user_email}")
            raise HTTPException(
                status_code=500,
                detail="Notion 저장 실패. NOTION_API_KEY와 NOTION_DATABASE_ID를 확인해주세요."
            )

        delta = request.strict_intake.intensity - request.intensity_after

        logger.info(
            f"[Notion] 저장 성공: 페이지 ID={result.get('id')}, "
            f"강도 변화={delta}"
        )

        return NotionSaveResponse(
            success=True,
            notion_page_id=result.get("id"),
            message=f"감정 기록이 성공적으로 저장되었습니다. (강도 {delta:+d} 변화)",
            timestamp=datetime.now().isoformat(),
            delta_intensity=delta
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[Notion] 예상치 못한 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"서버 내부 오류: {str(e)}"
        )


@router.get("/health")
async def notion_health_check():
    """
    Notion 연동 상태 확인
    """
    import os

    api_key = os.getenv("NOTION_API_KEY")
    db_id = os.getenv("NOTION_DATABASE_ID")

    return {
        "status": "healthy",
        "configured": bool(api_key and db_id),
        "api_key_set": bool(api_key),
        "database_id_set": bool(db_id),
        "service": "loaded"
    }



