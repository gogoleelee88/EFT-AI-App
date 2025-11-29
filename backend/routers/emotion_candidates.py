from fastapi import APIRouter, HTTPException
from backend.services.emotion_candidates_service import get_emotion_candidates, EmotionCandidate
from backend.routers.compare import SessionState, redis_client
import json

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


router = APIRouter(prefix="/api/emotion", tags=["emotion"])

class EmotionCandidatesRequest(BaseModel):
    session_id: str

class EmotionCandidatesResponse(BaseModel):
    message: str
    candidates: List[Dict[str, Any]]
    core_emotion_hypothesis: Optional[str] = None
    reasoning: Optional[str] = None

@router.post("/candidates", response_model=EmotionCandidatesResponse)
async def emotion_candidates(req: EmotionCandidatesRequest):

    # ⭐ 세션 상태 불러오기
    raw = redis_client.get(f"session:compare:{req.session_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Session not found")
    state = SessionState(**json.loads(raw))

    intake = {item.key: item.value for item in state.checklist}

    # 🌟 하이브리드 LLM 후보 추출
    inference_list = await get_emotion_candidates(
        user_input=intake.get("situation_context") or "",
        strict6_output=intake,
        engine="b"
    )

    if not inference_list:
        return EmotionCandidatesResponse(
            message="감정을 하나로 고르기 어려운 상태예요.",
            candidates=[{
                "label": "복합/잘모르겠음",
                "reason": "여러 감정이 섞여 있거나 아직 정리가 안 된 상태일 수 있어요.",
                "confidence": 0.5,
            }]
        )

    candidates_out = [{
        "label": c.label,
        "reason": c.reason,
        "confidence": c.confidence,
    } for c in inference_list]

    return EmotionCandidatesResponse(
        message="가장 가까운 감정을 선택해볼까요?",
        candidates=candidates_out,
        core_emotion_hypothesis=inference_list[0].label,
        reasoning=inference_list[0].reason
    )
