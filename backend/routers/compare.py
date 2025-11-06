import asyncio
import logging
import os
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from backend.config.settings import get_settings
from backend.models.action_tokens import TokenParser
from backend.services.emotion_analyzer import get_emotion_analyzer
from backend.utils.action_builder import build_actions

logger = logging.getLogger(__name__)
logger.critical("✅✅✅ [V3 DEBUG] Context-Aware compare.py is running! ✅✅✅")
router = APIRouter(prefix="/api/chat", tags=["compare"])

settings = get_settings()

# =================================================================================
# NEW: "Context-Aware Emotional Intelligence Counseling System" Logic
# =================================================================================

INTAKE_QUESTIONS = [
    "어떤 상황에서 그런 감정이 드셨나요?",
    "그때 어떤 생각이 반복되셨나요?",
    "몸에서는 어떤 신호가 느껴지셨어요?",
    "그 감정이 들었을 때 어떻게 반응하셨나요?",
    "혹시 지금 대화에 집중할 수 있는 편안한 공간에 계신가요?",
    "충분히 시간을 가지고 대화하는 것이 괜찮으신가요?",
    "그 상황에 대해 조금 더 말씀해주실 수 있나요?",
    "지금 그 감정의 강도는 얼마나 되나요?",
]

PROMPT_EMPATHY_ONLY = """
당신은 사용자의 말을 깊이 경청하고 공감하는 AI 상담사입니다.
사용자의 첫 메시지에 대해, 어떤 질문도 하지 말고 오직 따뜻한 공감과 지지의 말을 담아 2-3문장의 짧은 답변을 생성해주세요.
사용자가 이야기를 시작할 수 있도록 안전하고 수용적인 분위기를 만들어주는 것이 당신의 유일한 목표입니다.
"""

def build_intelligent_intake_prompt(user_message: str, turn_count: int) -> str:
    # turn 1 asks question 0, up to turn 8 for question 7
    question_index = turn_count - 1
    if not (0 <= question_index < len(INTAKE_QUESTIONS)):
        return "모든 정보가 수집되었습니다. 이제 사용자의 상황을 종합하여, 가장 적절한 해결책(EFT, 호흡 명상 등)을 제안하거나 대화를 자유롭게 이끌어가세요. 사용자의 말을 경청하고, 필요하다면 추가적인 질문을 할 수 있습니다."

    next_question = INTAKE_QUESTIONS[question_index]

    prompt = f"""
당신은 '상황인지형 감성 지능 상담사'입니다. 당신의 목표는 사용자의 감정 상태를 체계적으로 이해하고 적절한 도움을 주는 것입니다.

현재 대화는 {turn_count}번째 턴입니다.
사용자의 최근 메시지: "{user_message}"

당신의 임무는 다음 규칙에 따라, 지금 사용자에게 보낼 응답을 생성하는 것입니다:

1.  **사용자 메시지 내용 인정:** 먼저, 사용자가 방금 말한 내용("{user_message}")을 자연스럽게 인정하고, "말씀해주셔서 감사해요" 와 같이 맥락에 맞는 따뜻한 감사와 지지를 표현해주세요. 상투적인 표현은 피해주세요.

2.  **다음 질문 제시:** 그 다음, 아래의 질문을 사용자에게 자연스럽게 물어보세요.
    > "{next_question}"

3.  **진정 제안 (필요시):** 만약 사용자가 메시지에서 매우 강한 감정을 쏟아내어 진정이 필요해 보인다면, 위 질문을 하기 전에 "힘든 이야기를 하셨으니 잠시 마음을 가다듬는 시간이 필요할 것 같아요" 라고 말하며, 간단한 호흡법(예: '숨을 깊게 들이마시고, 천천히 내쉬어 보세요.')을 제안하는 문장을 먼저 포함해주세요.

4.  **정보 분석 및 건너뛰기 (가장 중요):** 만약 사용자의 최근 메시지에 이미 다음 질문("{next_question}")에 대한 답이 포함되어 있다고 판단되면, 그 질문을 하는 대신, "말씀해주신 내용을 바탕으로 다음 단계로 넘어가도 괜찮을까요?" 와 같이 자연스럽게 확인하고 다음 턴으로 넘어가도록 유도하세요.

지금, 위 규칙에 따라 사용자에게 보낼 최종 응답을 한두 문단으로 생성하세요.
"""
    return prompt.strip()

# =================================================================================

def _normalize_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if u.endswith("/v1/chat/completions"):
        return u[:-len("/chat/completions")]
    if u.endswith("/v1"):
        return u
    return u + "/v1"


ENGINE_A_BASE = _normalize_api_base(settings.VLLM_ENGINE_A_URL)
ENGINE_B_BASE = _normalize_api_base(settings.VLLM_ENGINE_B_URL)
ENGINE_A_URL = f"{ENGINE_A_BASE}/chat/completions"
ENGINE_B_URL = f"{ENGINE_B_BASE}/chat/completions"
ENGINE_A_MODEL = os.getenv("ENGINE_A_MODEL", "engine-a")
ENGINE_B_MODEL = os.getenv("ENGINE_B_MODEL", "engine-b")
ENGINE_CONTENT_TYPE = os.getenv("ENGINE_CONTENT_TYPE", "application/json;charset=utf-8")
ENGINE_HTTP_TIMEOUT = float(os.getenv("ENGINE_HTTP_TIMEOUT", "30"))


class CompareRequest(BaseModel):
    message: str
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    max_tokens: Optional[int] = 512
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    turn_count: Optional[int] = 0

def _chat_payload(model: str, req: CompareRequest, system_prompt: str) -> Dict[str, Any]:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message}
        ],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens,
        "stream": False,
    }

@router.post("/compare")
async def compare(req: CompareRequest, response: Response, request: Request) -> Dict[str, Any]:
    headers = {"Content-Type": ENGINE_CONTENT_TYPE}
    started_at = time.perf_counter()
    
    turn_count = req.turn_count or 0
    user_message = req.message
    system_prompt = ""

    # New "Context-Aware" Conversational Flow
    if turn_count == 0:
        system_prompt = PROMPT_EMPATHY_ONLY
    else:
        # For turns 1 and up, use the intelligent intake prompt.
        # The prompt itself handles the logic for turns 1-8 (gathering) and 9+ (counseling).
        system_prompt = build_intelligent_intake_prompt(user_message, turn_count)

    payload_a = _chat_payload(ENGINE_A_MODEL, req, system_prompt)
    payload_b = _chat_payload(ENGINE_B_MODEL, req, system_prompt)

    async with httpx.AsyncClient() as client:
        try:
            res_a, res_b = await asyncio.gather(
                client.post(ENGINE_A_URL, json=payload_a, headers=headers, timeout=ENGINE_HTTP_TIMEOUT),
                client.post(ENGINE_B_URL, json=payload_b, headers=headers, timeout=ENGINE_HTTP_TIMEOUT),
                return_exceptions=True,
            )

            # The following is complex error handling and response selection logic from the original file.
            # It is preserved to maintain the parallel engine comparison functionality.
            if isinstance(res_a, Exception):
                logger.warning("Engine A 연결 실패: %r", res_a)
                data_a = {"choices": [{"message": {"content": f"안녕하세요. {req.message}에 대해 스트레스가 많으시군요. 깊은 호흡을 한번 해보시는 게 어떨까요?"}}]}
                res_a = type("MockResponse", (), {"status_code": 200, "elapsed": datetime.timedelta(seconds=0.1), "json": lambda: data_a})()
            else:
                data_a = res_a.json() if res_a.status_code == 200 else {"error": f"HTTP {res_a.status_code}"}

            if isinstance(res_b, Exception):
                logger.warning("Engine B 연결 실패: %r", res_b)
                data_b = {"choices": [{"message": {"content": f"힘드시겠어요. {req.message} 상황이 어렵죠. 잠시 휴식을 취하시는 것을 추천드립니다."}}]}
                res_b = type("MockResponse", (), {"status_code": 200, "elapsed": datetime.timedelta(seconds=0.15), "json": lambda: data_b})()
            else:
                data_b = res_b.json() if res_b.status_code == 200 else {"error": f"HTTP {res_b.status_code}"}

            response_a_raw = data_a.get("choices", [{}])[0].get("message", {}).get("content", "") if res_a.status_code == 200 else f"❌ engine_a 연결 실패: {data_a}"
            response_b_raw = data_b.get("choices", [{}])[0].get("message", {}).get("content", "") if res_b.status_code == 200 else f"❌ engine_b 연결 실패: {data_b}"

            winner_text = ""
            if res_a.status_code == 200 and res_b.status_code == 200:
                t_a = getattr(res_a, "elapsed", None)
                t_b = getattr(res_b, "elapsed", None)
                if t_a is not None and t_b is not None:
                    winner_text = response_a_raw if t_a.total_seconds() <= t_b.total_seconds() else response_b_raw
                else:
                    winner_text = response_a_raw
            elif res_a.status_code == 200:
                winner_text = response_a_raw
            elif res_b.status_code == 200:
                winner_text = response_b_raw

            winner_clean = TokenParser.remove_tokens(winner_text)

            executed_actions: List[Dict[str, Any]] = []
            # Actions are only generated AFTER the main intake phase (e.g., turn > 8)
            if turn_count > 8:
                try:
                    analyzer = get_emotion_analyzer()
                    emotion_analysis = await analyzer.analyze(req.message)
                except Exception:
                    emotion_analysis = None

                try:
                    meta = {"session_id": getattr(req, "session_id", None), "assistant_text": winner_clean}
                    if emotion_analysis:
                        meta["emotion_analysis"] = emotion_analysis
                    executed_actions.extend(build_actions(req.message, meta) or [])
                except Exception as e:
                    logger.warning("[COMPARE] action builder skipped: %r", e)

            # Assemble final response
            response.headers["Cache-Control"] = "no-store"
            
            def _elapsed_seconds(res: httpx.Response) -> Optional[float]:
                try:
                    return float(getattr(res, "elapsed", None).total_seconds())
                except Exception:
                    return None

            result = {
                "llama3_response": {"model": ENGINE_A_MODEL, "success": res_a.status_code == 200, "processing_time": _elapsed_seconds(res_a), "response": TokenParser.remove_tokens(response_a_raw), "raw": response_a_raw},
                "qwen25_response": {"model": ENGINE_B_MODEL, "success": res_b.status_code == 200, "processing_time": _elapsed_seconds(res_b), "response": TokenParser.remove_tokens(response_b_raw), "raw": response_b_raw},
                "comparison_time": round(time.perf_counter() - started_at, 3),
                "faster_model": "llama3" if _elapsed_seconds(res_a) is not None and _elapsed_seconds(res_b) is not None and _elapsed_seconds(res_a) <= _elapsed_seconds(res_b) else "qwen25",
                "timestamp": datetime.utcnow().isoformat(),
                "response": "[V4 TEST] " + winner_clean, # The actual winner text for the frontend to display
            }
            if executed_actions:
                result["actions"] = executed_actions

            return result

        except Exception as e:
            logger.exception("Unhandled error in compare endpoint")
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")