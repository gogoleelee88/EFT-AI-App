# backend/routers/premium.py - Premium-Only Chat Router
import logging
import time
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Request
from pydantic import BaseModel, Field

from auth.dependencies import PremiumAuth, RequireJSON
from config.settings import get_settings
from services.chatgpt_service import get_openai_client

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

ROUTER_BUILD = "premium-only v4 @ 2025-09-22 14:00 KST"
logger.info(f"[PremiumRouter] Loaded: {ROUTER_BUILD}")


class ChatPayload(BaseModel):
    model_config = {"extra": "forbid"}
    message: str = Field(..., description="?ì² ë©ì???)
    temperature: float = Field(0.7, ge=0.0, le=2.0, description="?ëµ ?¨ë")
    max_tokens: int = Field(700, ge=1, le=4096, description="ìµë? ?í° ??)
    sessionId: Optional[str] = Field(None, description="?¸ì ID")
    userId: Optional[str] = Field(None, description="?ì²??ID")


class ChatResponse(BaseModel):
    response: str = Field(..., description="AI ?ëµ ?ì¤??)
    model: str = Field(..., description="ëª¨ë¸ëª?)
    processing_time: float = Field(..., description="?ì ?ê°")
    success: bool = Field(True, description="?±ê³µ ?¬ë?")
    session_id: Optional[str] = Field(None, description="?¸ì ID")
    timestamp: str = Field(..., description="?ëµ ??ì¤?¬í")


async def call_vllm_direct(message: str, temperature: float = 0.7, max_tokens: int = 700) -> dict:
    """OpenAI ê¸°ë° ?ëµ ?ì± (?¸í???¨ìëª?."""
    system_prompt = (
        "You are a supportive EFT coach. "
        "Respond with practical, empathetic guidance and keep users grounded."
    )

    model = (settings.OPENAI_MODEL or "gpt-5.2").strip()
    client = get_openai_client()
    if client is None:
        return {
            "response": "?ì¬ AI ?ë¹?¤ì ?°ê²°?????ìµ?ë¤. ?ì ???¤ì ?ë??ì£¼ì¸??",
            "model": "openai-unavailable",
            "success": False,
        }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "temperature": temperature,
        "stream": False,
    }
    if model.startswith("gpt-5"):
        payload["max_completion_tokens"] = max_tokens
    else:
        payload["max_tokens"] = max_tokens

    try:
        response = await client.chat.completions.create(**payload)
        if not response.choices:
            return {
                "response": "AI ?ëµ???ì±?ì? ëª»í?µë??",
                "model": model,
                "success": False,
            }

        response_text = (response.choices[0].message.content or "").strip()
        if not response_text:
            return {
                "response": "AI ?ëµ??ë¹ì´ ?ìµ?ë¤. ?ì ???¤ì ?ë??ì£¼ì¸??",
                "model": model,
                "success": False,
            }

        return {
            "response": response_text,
            "model": model,
            "success": True,
        }
    except Exception as exc:
        logger.error("OpenAI chat call failed: %s", exc)
        return {
            "response": "?¤ìê°?AI ?ëµ ?¸ì¶???¤í¨?ìµ?ë¤. ?ì ???¤ì ?ë??ì£¼ì¸??",
            "model": "error",
            "success": False,
        }


@router.post("/api/chat/premium", response_model=ChatResponse)
async def chat(
    request: Request,
    api_key: PremiumAuth,
    _content_type: RequireJSON,
    payload: ChatPayload = Body(..., embed=False),
) -> ChatResponse:
    """?ë¦¬ë¯¸ì AI ì±í ?ëµ ?ê³µ"""
    start = time.time()
    client_ip = request.client.host if request.client else "unknown"

    try:
        logger.info("premium chat from %s: %s...", client_ip, payload.message[:50])
        result = await call_vllm_direct(payload.message, payload.temperature, payload.max_tokens)

        if not result["success"]:
            return ChatResponse(
                response=(
                    "ë¬¸ì ?ì´ ?´ì´ê°????ëë¡??ì??ë¦´ê²ì. "
                    "ê°ì???ë¬´ ê³¼ë??ì²???ê»´ì§??ë 30ë¶??ë ?´ì ?? "
                    "?¨ì ì²ì²??ê³ë¥´ê³??¤ì ë§ì???ì£¼ì¸??"
                ),
                model="fallback-ar-holistic",
                processing_time=time.time() - start,
                success=True,
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
    except Exception as exc:
        logger.error("premium chat fail from %s: %s", client_ip, str(exc))
        raise HTTPException(status_code=500, detail="Internal AI service error")


@router.get("/api/validate")
@router.get("/api/premium/validate")
async def validate_key(
    request: Request,
    api_key: PremiumAuth,
):
    """?ë¦¬ë¯¸ì ??ê²ì¦?""
    client_ip = request.client.host if request.client else "unknown"
    logger.info("validate premium key from %s", client_ip)
    return {
        "valid": True,
        "tier": "premium",
        "service": "EFT AI Chat",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


if settings.DEBUG:
    @router.post("/api/_debug/echo-model")
    async def echo_model(payload: ChatPayload, api_key: PremiumAuth):
        return payload.model_dump()

    @router.post("/api/_debug/echo-bytes")
    async def debug_echo_bytes(request: Request):
        raw = await request.body()
        return {"raw_utf8": raw.decode("utf-8", "replace")}

    @router.post("/api/_debug/echo-json")
    async def debug_echo_json(payload: dict):
        return {"parsed": payload}

    logger.info("DEBUG: Premium routes loaded with openai-backed handler.")
else:
    logger.info("PRODUCTION: Premium routes loaded.")

