import re
import asyncio
import logging
import os
import time
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from backend.config.settings import get_settings
from backend.models.action_tokens import TokenParser  # keep
from backend.services.emotion_analyzer import get_emotion_analyzer  # keep
from backend.utils.action_builder import build_actions  # keep

#==== 공개 API 재정의 + 호출부 마이그레이션 시 이거 삭제 필요 

def _build_system_prompt_for_compare(user_message, session_state, tier: str | None = None) -> str:
    """[임시 강제] vLLM 테스트/안정화: 항상 내부 빌더(14키 스키마)만 사용"""
    try:
        return build_checklist_prompt(user_message, session_state)
    except Exception as e:
        logger.error(f"Internal prompt build failed, falling back: {e}")
        return "You are MoodTalk EFT assistant. Keep responses concise and safe."


#====공개 API 재정의 + 호출부 마이그레이션 시 이거 삭제 필요====

logger = logging.getLogger(__name__)
logger.critical("✅✅✅ [V4 DEBUG] Context-Aware compare.py is running! ✅✅✅")
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
    {{
      "response_for_user": "The empathetic, natural language response for the user, including the next question if applicable.",
      "updated_checklist": [
        {{
          "key": "situation",
          "question": "...",
          "value": "The extracted value or null",
          "ask_count": 0
        }},
        // ... all other checklist items with their updated values and ask_counts
      ]
    }}
    ```

Now, perform your mission based on the user's message and the current checklist state.
'''
    return prompt.strip()


INTAKE_QUESTIONS = [
    {"key": "core_emotion",        "question": "지금 가장 크게 느껴지는 핵심 감정은 무엇인가요? 말하기 힘드시면 그 기분,그 감정이라고 해도 되요."},
    {"key": "situation_context",   "question": "그 감정이 든 상황을 알려주실래요?"},
    {"key": "automatic_thought",   "question": "그때 떠오른 생각은 무엇이었나요?"},
    {"key": "physical_sensation",  "question": "몸에서는 어떤 신체 감각(두근거림, 긴장 등)이 느껴졌나요?"},
    {"key": "intensity",           "question": "지금 감정의 강도는 0~10 중 어느 정도인가요?"},
    {"key": "environment",         "question": "현재 대화 중에 주변 환경(장소/사람/제약)은 명상에 집중할 수 있는 환경인가요?"},
    {"key": "behavioral_reaction", "question": "그때 어떻게 반응하셨나요? (행동/표정/회피 등) 어떤 행동과 반응도 이유가 있을테니 괜찮아요. "},
    {"key": "behavior_metric",     "question": "최근 수면/활동/심박 등 추적 지표가 있다면 간단히 알려주세요."},
    {"key": "coping_attempt",      "question": "그 기분과 상황에서 벗어나려고 어떤 행동을 했나요? (호흡, 산책, 정리 등)"},
    {"key": "available_time",      "question": "지금 기분전환을 위해 사용가능한 시간은 얼마나 되나요? (분 단위로 대략)"},
    {"key": "immediate_goal",      "question": "이번 대화에서 지금 기분과 생각에서 벗어나, 어떤 상태가 되고 싶으신가요?"},
]

def create_new_session_state() -> SessionState:
    return SessionState(
        checklist=[ChecklistItem(**item) for item in INTAKE_QUESTIONS],
        first_turn_done=False
    )

def _safe_get_val(item) -> Optional[str]:
    if hasattr(item, "value"):
        return getattr(item, "value")
    if isinstance(item, dict):
        return item.get("value")
    return None

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
    temperature: Optional[float] = 0.2
    top_p: Optional[float] = 0.9
    max_tokens: Optional[int] = 1024 # Increased for JSON output
    session_id: Optional[str] = "dev" # Default for testing
    user_id: Optional[str] = None
    # turn_count is no longer used by the core logic

def _chat_payload(model: str, req: CompareRequest, system_prompt: str) -> Dict[str, Any]:
    return {{
        "model": model,
        "messages": [
            {{"role": "system", "content": system_prompt}},
            {{"role": "user", "content": req.message}}
        ],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": 2048, # 1024에서 2048로 늘려서 JSON 잘림 방지
        "stream": False,
        "response_format": {{"type": "json_object"}} # Crucial for the new logic
    }}

# Part 3: The refactored main endpoint
@router.post("/compare")
async def compare(req: CompareRequest, response: Response, request: Request) -> Dict[str, Any]:
    headers = {{"Content-Type": ENGINE_CONTENT_TYPE}}
    started_at = time.perf_counter()
    session_id = req.session_id or "dev"

    # Step 1: Get or Create Session State
    if session_id not in session_storage:
        session_storage[session_id] = create_new_session_state()
    session_state = session_storage[session_id]

    # Simple empathy for the very first message to build rapport
    is_first_message = not any(item.value for item in session_state.checklist)
    if is_first_message:
        system_prompt = "You are a highly empathetic AI counselor. Your only goal is to provide a short, warm, and supportive response to the user's first message. Do not ask any questions. Make the user feel safe and heard."
        payload = _chat_payload(ENGINE_A_MODEL, req, system_prompt)
        payload.pop("response_format", None) # No JSON needed for first response
    else:
        # Step 2: Build the intelligent checklist prompt
        system_prompt = build_checklist_prompt(req.message, session_state)
        payload = _chat_payload(ENGINE_A_MODEL, req, system_prompt)

    # For simplicity in this refactoring, we will only use one engine for the structured JSON task.
    # The dual-engine logic can be re-introduced later if needed.
    async with httpx.AsyncClient() as client:
        try:
            res = await client.post(ENGINE_A_URL, json=payload, headers=headers, timeout=ENGINE_HTTP_TIMEOUT)
            res.raise_for_status()
            
            response_data = res.json()
            raw_ai_output = response_data.get("choices", [{{}}])[0].get("message", {{}}).get("content", "{}")

            user_facing_response = ""
            final_actions = []

            if is_first_message:
                user_facing_response = raw_ai_output
                # On the first turn, we don't update the checklist yet, just listen.
            else:
                # Step 3 & 4: Parse AI response and Update State
                try:
                    ai_response_data = json.loads(raw_ai_output)
                    ai_response = AIResponse(**ai_response_data)
                    
                    user_facing_response = ai_response.response_for_user
                    session_storage[session_id] = SessionState(checklist=ai_response.updated_checklist)
                    
                    # Step 5: Check for Completion
                    is_complete = all(item.value is not None for item in ai_response.updated_checklist)

                    if is_complete:
                        # Step 6: Trigger Frontend Action
                        user_facing_response = "모든 정보가 수집되었습니다. 현재 느끼시는 감정의 강도를 알려주시겠어요?"
                        final_actions = [{{"type": "ask_suds", "payload": {{"ui": "banner", "message": "대화를 바탕으로, 현재 감정의 강도를 알려주세요."}}}}]
                
                except (json.JSONDecodeError, TypeError, KeyError) as e:
                    logger.error(f"Failed to parse AI JSON response: {{e}}\nRaw output: {{raw_ai_output}}")
                    user_facing_response = "죄송합니다, 응답을 처리하는 중 오류가 발생했습니다. 다시 한번 말씀해주시겠어요?"

            # Assemble final response, maintaining original structure for frontend compatibility
            final_result = {{
                "response": user_facing_response,
                "actions": final_actions,
                "comparison_time": round(time.perf_counter() - started_at, 3),
                "timestamp": datetime.utcnow().isoformat(),
                # Keep other fields for compatibility, even if they are mock
                "llama3_response": {{"model": ENGINE_A_MODEL, "success": True, "response": raw_ai_output}},
                "qwen25_response": {{"model": ENGINE_B_MODEL, "success": False, "response": ""}},
                "faster_model": "llama3",
            }}
            
            response.headers["Cache-Control"] = "no-store"
            return final_result

        except httpx.HTTPStatusError as e:
            logger.exception(f"AI engine request failed with status {{e.response.status_code}}")
            raise HTTPException(status_code=502, detail="AI engine request failed.")
        except Exception as e:
            logger.exception("Unhandled error in compare endpoint")
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {{str(e)}}")
