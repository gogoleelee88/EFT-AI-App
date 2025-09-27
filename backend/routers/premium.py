# backend/routers/premium.py - Premium-Only Chat Router
from fastapi import APIRouter, Request, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional
import time
import logging
import httpx

from backend.config.settings import get_settings
from backend.auth.dependencies import PremiumAuth, RequireJSON

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

ROUTER_BUILD = "premium-only v4 @ 2025-09-22 14:00 KST"
logger.info(f"[PremiumRouter] Loaded: {ROUTER_BUILD}")

class ChatPayload(BaseModel):
    """채팅 요청 페이로드 (Premium-Only)"""
    model_config = {"extra": "forbid"}  # 추가 필드 허용 안 함

    message: str = Field(..., description="사용자 메시지")
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="응답 창의성")
    max_tokens: int = Field(700, ge=1, le=4096, description="최대 토큰 수")
    sessionId: Optional[str] = Field(None, description="세션 ID")
    userId: Optional[str] = Field(None, description="사용자 ID")

class ChatResponse(BaseModel):
    """채팅 응답 (Premium-Only)"""
    response: str = Field(..., description="AI 응답 내용")
    model: str = Field(..., description="사용된 모델명")
    processing_time: float = Field(..., description="처리 시간 (초)")
    success: bool = Field(True, description="성공 여부")
    session_id: Optional[str] = Field(None, description="세션 ID")
    timestamp: str = Field(..., description="응답 생성 시각")

# vLLM 직접 연결 함수
async def call_vllm_direct(message: str, temperature: float = 0.7, max_tokens: int = 700) -> dict:
    """vLLM 서버에 직접 연결하여 AI 응답 생성"""
    system_prompt = (
        "당신은 EFT(감정자유기법) 전문 상담사입니다. "
        "공감적으로 돕고 필요 시 EFT를 자연스럽게 안내하세요. 한국어로 답변하세요."
    )

    payload = {
        "model": settings.PREMIUM_AI_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message}
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False
    }

    # 설정 기반 vLLM 서버 URL
    url = f"{settings.PREMIUM_AI_BASE_URL}/chat/completions"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)

            if response.status_code == 200:
                data = response.json()
                return {
                    "response": data["choices"][0]["message"]["content"],
                    "model": settings.PREMIUM_AI_MODEL,
                    "success": True
                }
            logger.error(f"vLLM error: {response.status_code} - {response.text}")
            return {
                "response": "일시적 오류입니다. 잠시 후 다시 시도해주세요.",
                "model": "fallback",
                "success": False
            }
    except Exception as e:
        logger.error(f"vLLM connect fail: {e}")
        return {
            "response": "현재 AI 서비스를 사용할 수 없습니다.",
            "model": "error",
            "success": False
        }

@router.post("/api/chat", response_model=ChatResponse)
@router.post("/api/chat/premium", response_model=ChatResponse)  # 호환용
async def chat(
    request: Request,          # ✅ 기본값 없음
    api_key: PremiumAuth,      # ✅ Annotated 별칭 그대로 사용 (Depends 금지)
    _content_type: RequireJSON,  # ✅ JSON Content-Type 강제
    payload: ChatPayload = Body(..., embed=False),
) -> ChatResponse:
    """프리미엄 전용 AI 채팅 엔드포인트"""
    start = time.time()
    client_ip = request.client.host if request.client else "unknown"

    try:
        logger.info(f"🤖 chat from {client_ip}: {payload.message[:50]}...")

        result = await call_vllm_direct(payload.message, payload.temperature, payload.max_tokens)

        # vLLM 연결 실패 시 즉시 유용한 EFT 안내 응답
        if not result["success"]:
            return ChatResponse(
                response="지금은 연결이 불안정해서 간단히 안내드릴게요. 심호흡 3회 후, 눈썰미 포인트를 손가락으로 가볍게 두드리며 '괜찮아, 금방 지나갈 거야'를 30초간 반복해보세요.",
                model="fallback-ar-holistic",
                processing_time=time.time() - start,
                success=True,  # 사용자 관점에서는 성공적인 응답
                session_id=payload.sessionId,
                timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
            )

        return ChatResponse(
            response=result["response"],
            model=result["model"],
            processing_time=time.time() - start,
            success=result["success"],
            session_id=payload.sessionId,
            timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
        )


    except HTTPException:
        raise

    except Exception as e:
        logger.error(f"❌ chat fail from {client_ip}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal AI service error")

@router.get("/api/validate")
@router.get("/api/premium/validate")  # 호환용
async def validate_key(
    request: Request,     # ✅ 기본값 없음
    api_key: PremiumAuth, # ✅ Annotated 별칭
):
    """프리미엄 키 유효성 검증"""
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"🔑 validate from {client_ip}")
    return {
        "valid": True,
        "tier": "premium",
        "service": "EFT AI Chat",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

# 🔍 디버그 엔드포인트들 (개발 환경에서만 활성화)
if settings.DEBUG:
    @router.post("/api/_debug/echo-model")
    async def echo_model(payload: ChatPayload, api_key: PremiumAuth):
        """모델 검증만 테스트 (개발 전용)"""
        return payload.model_dump()
    @router.post("/api/_debug/echo-bytes")
    async def debug_echo_bytes(request: Request):
        """요청 바디를 원본 바이트로 확인 (개발 전용)"""
        raw = await request.body()
        return {"raw_utf8": raw.decode("utf-8", "replace")}

    @router.post("/api/_debug/echo-json")
    async def debug_echo_json(payload: dict):
        """JSON 파싱이 성공했을 때만 도달 (개발 전용)"""
        return {"parsed": payload}

    logger.info("🔧 DEBUG 모드: 디버그 엔드포인트 활성화됨")
else:
    logger.info("🔒 PRODUCTION 모드: 디버그 엔드포인트 비활성화됨")

