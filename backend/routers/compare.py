
import re
import asyncio
import logging
import os
import sys
import time
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.config.settings import get_settings
from backend.models.action_tokens import TokenParser
from backend.services.emotion_analyzer import get_emotion_analyzer
from backend.utils.action_builder import build_actions

logger = logging.getLogger(__name__)
logger.critical("✅✅✅ [V3 DEBUG] Context-Aware compare.py is running! ✅✅✅")
router = APIRouter(prefix="/api/chat", tags=["compare"])

settings = get_settings()

# =================================================================================
# NEW: "Intelligent Checklist" based Conversational Logic (v4.0)
# =================================================================================

# Part 1: New Data Structures
class ChecklistItem(BaseModel):
    key: str
    question: str
    value: Optional[str] = None
    ask_count: int = 0

class SessionState(BaseModel):
    checklist: List[ChecklistItem]

class AIResponse(BaseModel):
    response_for_user: str = Field(..., description="The actual text response to show to the user.")
    updated_checklist: List[ChecklistItem] = Field(..., description="The checklist after analyzing the user's message.")

# In-memory storage for session states.
# NOTE: For production, this should be migrated to Redis as per the roadmap.
session_storage: Dict[str, SessionState] = {}

INTAKE_QUESTIONS = [
    {"key": "situation", "question": "어떤 상황에서 그런 감정이 드셨나요?"},
    {"key": "thought", "question": "그때 어떤 생각이 반복되셨나요?"},
    {"key": "physical_sensation", "question": "몸에서는 어떤 신호가 느껴지셨어요?"},
    {"key": "reaction", "question": "그 감정이 들었을 때 어떻게 반응하셨나요?"},
    {"key": "environment", "question": "혹시 지금 대화에 집중할 수 있는 편안한 공간에 계신가요?"},
    {"key": "time_commitment", "question": "충분히 시간을 가지고 대화하는 것이 괜찮으신가요?"},
    {"key": "elaboration", "question": "그 상황에 대해 조금 더 말씀해주실 수 있나요?"},
    {"key": "intensity", "question": "지금 그 감정의 강도는 얼마나 되나요?"},
]

def create_new_session_state() -> SessionState:
    return SessionState(
        checklist=[ChecklistItem(**item) for item in INTAKE_QUESTIONS]
    )

# Part 2: New AI Prompt Generation
def build_checklist_prompt(user_message: str, session_state: SessionState) -> str:
    checklist_json = session_state.model_dump_json(indent=2)

    prompt = f'''
You are a highly empathetic and intelligent AI counselor. Your primary goal is to understand a user's situation by filling out a checklist of required information. You must communicate in a natural, caring, and human-like manner.

**Your Mission (Final):**

1.  **(Analyze & Extract)** Analyze the user's latest message below in the context of the current checklist. Your task is to find answers for any checklist items where the `value` is still `null`. If you find an answer, summarize the core meaning and update the `value` field for that item.
    - User's latest message: "{user_message}"
    - Current checklist state:
      ```json
      {checklist_json}
      ```

2.  **(Ask Next Question)** If the checklist is not yet complete (i.e., there are still items with `value: null`), create a natural, empathetic response for the user that asks for the *next* piece of missing information.

3.  **(Intelligent Re-asking)** If you need to ask about an item you have asked about before (`ask_count > 0`), YOU MUST NOT REPEAT THE SAME QUESTION. Acknowledge the user's previous message and rephrase the question in a different, gentler way.

4.  **(Skip Proposal)** If an item's `ask_count` reaches 2 (meaning you are about to ask for the third time), DO NOT ask the question. Instead, you MUST ask for permission to skip, for example: "이 질문에 답하기가 힘드신 것 같아요. 다음으로 넘어가도 괜찮을까요?"

5.  **(Skip Confirmation)** If the user's current message is a "yes" in response to your previous skip proposal, you MUST update the `value` of that item with a placeholder pronoun (e.g., "이 느낌", "그 상황") and then proceed to ask about the *next* unanswered item.

6.  **(JSON Output)** You MUST wrap your entire response in a single JSON object that strictly follows this format. Do not add any text outside this JSON object.
    ```json
    {
      "response_for_user": "The empathetic, natural language response for the user, including the next question if applicable.",
      "updated_checklist": [
        {
          "key": "situation",
          "question": "...",
          "value": "The extracted value or null",
          "ask_count": 0
        },
        // ... all other checklist items with their updated values and ask_counts
      ]
    }
    ```

Now, perform your mission based on the user's message and the current checklist state.
'''
    return prompt.strip()

# =================================================================================

# Helper functions and existing configurations (mostly unchanged)
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
    max_tokens: Optional[int] = 1024 # Increased for JSON output
    session_id: Optional[str] = "dev" # Default for testing
    user_id: Optional[str] = None
    # turn_count is no longer used by the core logic

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
        "response_format": {"type": "json_object"} # Crucial for the new logic
    }

def _get_val(item):
    # 객체면 .value, dict면 ["value"] 안전 접근
    return getattr(item, "value", item.get("value") if isinstance(item, dict) else None)


# Part 3: The refactored main endpoint
@router.post("/compare")
async def compare(req: CompareRequest, response: Response, request: Request) -> Dict[str, Any]:
    # 필요한 import: asyncio, json, time, datetime (이미 상단에 있음)
    headers = {"Content-Type": ENGINE_CONTENT_TYPE}
    started_at = time.perf_counter()
    session_id = req.session_id or "dev"

    # Step 1: Get or Create Session State
    if session_id not in session_storage:
        session_storage[session_id] = create_new_session_state()
    session_state = session_storage[session_id]

    # 첫 메시지 여부 판정 (안전 접근)
    is_first_message = not any(_get_val(item) for item in session_state.checklist)

    # A/B 공감/체크리스트 프롬프트 & 페이로드 준비
    if is_first_message:
        # 아주 간단한 공감 응답(비 JSON)
        system_prompt = (
            "You are a highly empathetic AI counselor. "
            "Give a short, warm, supportive reply to the user's first message. "
            "Do not ask questions."
        )
        payload_a = _chat_payload(ENGINE_A_MODEL, req, system_prompt)
        payload_b = _chat_payload(ENGINE_B_MODEL, req, system_prompt)
        # 첫 응답은 json_object 강제 안 함
        payload_a.pop("response_format", None)
        payload_b.pop("response_format", None)
    else:
        # 체크리스트 기반 지능형 프롬프트(JSON 응답 기대)
        system_prompt = build_checklist_prompt(req.message, session_state)
        payload_a = _chat_payload(ENGINE_A_MODEL, req, system_prompt)
        payload_b = _chat_payload(ENGINE_B_MODEL, req, system_prompt)

    try:
        # --- A/B 병렬 호출 ---
        async with httpx.AsyncClient(timeout=ENGINE_HTTP_TIMEOUT) as client:
            req_a = client.post(ENGINE_A_URL, headers=headers, json=payload_a)
            req_b = client.post(ENGINE_B_URL, headers=headers, json=payload_b)
            resp_a, resp_b = await asyncio.gather(req_a, req_b, return_exceptions=True)

        # A 처리
        a_success, a_text = False, ""
        if isinstance(resp_a, Exception):
            logger.exception("Engine A request failed", exc_info=resp_a)
        else:
            try:
                resp_a.raise_for_status()
                data_a = resp_a.json()
                a_text = data_a.get("choices", [{}])[0].get("message", {}).get("content", "")
                a_success = True
            except Exception as e:
                logger.exception("Engine A parse failed", exc_info=e)

        # B 처리
        b_success, b_text = False, ""
        if isinstance(resp_b, Exception):
            logger.exception("Engine B request failed", exc_info=resp_b)
        else:
            try:
                resp_b.raise_for_status()
                data_b = resp_b.json()
                b_text = data_b.get("choices", [{}])[0].get("message", {}).get("content", "")
                b_success = True
            except Exception as e:
                logger.exception("Engine B parse failed", exc_info=e)

        # 우선 응답 선택
        raw_ai_output = a_text if a_success else b_text
        faster_model = "llama3" if a_success else ("qwen25" if b_success else "none")

        # --- 체크리스트 처리 ---
        user_facing_response: str = ""
        final_actions: List[Dict[str, Any]] = []

        if not raw_ai_output:
            user_facing_response = "죄송해요. 지금은 응답을 만들 수 없어요."
        elif is_first_message:
            # 첫 메시지는 공감문 그대로 출력
            user_facing_response = raw_ai_output
        else:
            # 두 번째 턴부터는 JSON 파싱 후 상태 갱신
            try:
                ai_response_data = json.loads(raw_ai_output)
                ai_response = AIResponse(**ai_response_data)

                # 사용자에게 보여줄 다음 질문/응답
                user_facing_response = ai_response.response_for_user

                # 체크리스트 업데이트
                session_storage[session_id] = SessionState(checklist=ai_response.updated_checklist)

                # 완료 여부 검사
                is_complete = all(_get_val(item) is not None for item in ai_response.updated_checklist)
                if is_complete:
                    user_facing_response = "모든 정보가 수집되었습니다. 현재 느끼시는 감정의 강도를 알려주시겠어요?"
                    final_actions = [{
                        "type": "ask_suds",
                        "payload": {"ui": "banner", "message": "대화를 바탕으로, 현재 감정의 강도를 알려주세요."}
                    }]

            except (json.JSONDecodeError, TypeError, KeyError) as e:
                logger.error(f"Failed to parse AI JSON response: {e}\nRaw output: {raw_ai_output}")
                user_facing_response = "죄송합니다, 응답을 처리하는 중 오류가 발생했습니다. 다시 한번 말씀해주시겠어요?"

        # 프론트 하위 호환 JSON (response + actions 배열 유지)
        final_result = {
            "response": user_facing_response,
            "actions": final_actions,
            "comparison_time": round(time.perf_counter() - started_at, 3),
            "timestamp": datetime.utcnow().isoformat(),
            "llama3_response": {"model": ENGINE_A_MODEL, "success": a_success, "response": a_text},
            "qwen25_response": {"model": ENGINE_B_MODEL, "success": b_success, "response": b_text},
            "faster_model": faster_model,
        }

        response.headers["Cache-Control"] = "no-store"
        return final_result

    except httpx.HTTPStatusError as e:
        logger.exception(f"AI engine request failed with status {e.response.status_code}")
        raise HTTPException(status_code=502, detail="Upstream model error")
    except Exception as e:
        logger.exception("Unhandled error in compare endpoint")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

