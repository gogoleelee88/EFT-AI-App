import redis

import os
from supabase import create_client

from fastapi import APIRouter, HTTPException
from backend.services.emotion_candidates_service import get_emotion_candidates, EmotionCandidate
from backend.routers.compare import SessionState
import json

from typing import Any, Dict, List, Optional
from pydantic import BaseModel



def _get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    redis_client = None


router = APIRouter(prefix="/api/emotion", tags=["emotion"])


class EmotionCheckinRequest(BaseModel):
    session_id: str
    user_id: str | None = None
    core_emotion: str
    situation_context: str
    automatic_thought: str
    physical_sensation: str | None = None
    coping_attempt: str | None = None
    immediate_goal: str | None = None
    intensity_before: int


@router.post("/checkin")
def save_emotion_checkin(payload: EmotionCheckinRequest):
    try:
        sb = _get_supabase()
        data = payload.model_dump()
        
        # 만약 user_id가 없으면, 테스트용 ID를 강제로 넣거나
        # (로그인이 안 된 상태라도 일단 저장은 되게 하기 위함)
        if not data.get("user_id"):
            # 주의: 이 ID는 auth.users 테이블에 실제로 존재하는 ID여야 안전합니다.
            # 일단은 None으로 보내되, DB RLS 정책을 잠시 꺼두거나
            # 테스트용 유저 ID를 넣으세요.
            # 예: data["user_id"] = "00000000-0000-0000-0000-000000000000" 
            pass 
        
        # 하지만 가장 좋은 건, payload 자체를 넣는 게 아니라
        # Supabase가 '현재 로그인한 유저'를 알게 하는 것입니다.
        # (Python 백엔드는 Service Role Key를 쓰므로 모든 권한이 있습니다.)
        # 따라서 여기서는 그냥 저장하면 됩니다. 단, user_id 컬럼에 null이 들어가도 되는지 확인하세요.
        
        sb.table("emotion_checkins").insert(data).execute()
        #sb.table("emotion_checkins").insert(payload.model_dump()).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save emotion checkin: {e}")

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
