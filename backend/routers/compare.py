import logging
import os
import time
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import redis
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from config.settings import get_settings
from models.action_tokens import TokenParser  # keep
from services.emotion_analyzer import get_emotion_analyzer  # keep
from services.llm_client import LLMClient
from utils.action_builder import build_actions  # keep
from services.chatgpt_service import get_openai_client

#==== ê³µê°œ API ?¬ì •??+ ?¸ì¶œë¶€ ë§ˆì´ê·¸ë ˆ?´ì…˜ ???´ê±° ?? œ ?„ìš” 

def _build_system_prompt_for_compare(user_message, session_state, tier: str | None = None) -> str:
    """[?„ì‹œ ê°•ì œ] vLLM ?ŒìŠ¤???ˆì •?? ??ƒ ?´ë? ë¹Œë”(14???¤í‚¤ë§?ë§??¬ìš©"""
    try:
        return build_checklist_prompt(user_message, session_state)
    except Exception as e:
        logger.error(f"Internal prompt build failed, falling back: {e}")
        return "You are MoodTalk EFT assistant. Keep responses concise and safe."


#====ê³µê°œ API ?¬ì •??+ ?¸ì¶œë¶€ ë§ˆì´ê·¸ë ˆ?´ì…˜ ???´ê±° ?? œ ?„ìš”====

logger = logging.getLogger(__name__)
logger.critical("[V4 DEBUG] Context-Aware compare.py is running!")
router = APIRouter(prefix="/api/chat", tags=["compare"])

settings = get_settings()
structured_client = LLMClient()

REDIS_URL = os.getenv("REDIS_URL", "")
redis_client = None
if REDIS_URL:
    try:
        redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        logger.info("compare: redis session storage enabled")
    except Exception as exc:
        logger.warning("compare: redis connection failed, using in-memory only: %s", exc)
        redis_client = None

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
    {"key": "situation", "question": "?´ë–¤ ?í™©?ì„œ ê·¸ëŸ° ê°ì •???œì…¨?˜ìš”?"},
    {"key": "thought", "question": "ê·¸ë•Œ ?´ë–¤ ?ê°??ë°˜ë³µ?˜ì…¨?˜ìš”?"},
    {"key": "physical_sensation", "question": "ëª¸ì—?œëŠ” ?´ë–¤ ? í˜¸ê°€ ?ê»´ì§€?¨ì–´??"},
    {"key": "reaction", "question": "ê·?ê°ì •???¤ì—ˆ?????´ë–»ê²?ë°˜ì‘?˜ì…¨?˜ìš”?"},
    {"key": "environment", "question": "?¹ì‹œ ì§€ê¸??€?”ì— ì§‘ì¤‘?????ˆëŠ” ?¸ì•ˆ??ê³µê°„??ê³„ì‹ ê°€??"},
    {"key": "time_commitment", "question": "ì¶©ë¶„???œê°„??ê°€ì§€ê³??€?”í•˜??ê²ƒì´ ê´œì°®?¼ì‹ ê°€??"},
    {"key": "elaboration", "question": "ê·??í™©???€??ì¡°ê¸ˆ ??ë§ì??´ì£¼?????ˆë‚˜??"},
    {"key": "intensity", "question": "ì§€ê¸?ê·?ê°ì •??ê°•ë„???¼ë§ˆ???˜ë‚˜??"},
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

4.  **(Skip Proposal)** If an item's `ask_count` reaches 2 (meaning you are about to ask for the third time), DO NOT ask the question. Instead, you MUST ask for permission to skip, for example: "??ì§ˆë¬¸???µí•˜ê¸°ê? ?˜ë“œ??ê²?ê°™ì•„?? ?¤ìŒ?¼ë¡œ ?˜ì–´ê°€??ê´œì°®?„ê¹Œ??"

5.  **(Skip Confirmation)** If the user's current message is a "yes" in response to your previous skip proposal, you MUST update the `value` of that item with a placeholder pronoun (e.g., "???ë‚Œ", "ê·??í™©") and then proceed to ask about the *next* unanswered item.

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
    {"key": "core_emotion",        "question": "ì§€ê¸?ê°€???¬ê²Œ ?ê»´ì§€???µì‹¬ ê°ì •?€ ë¬´ì—‡?¸ê??? ë§í•˜ê¸??˜ë“œ?œë©´ ê·?ê¸°ë¶„,ê·?ê°ì •?´ë¼ê³??´ë„ ?˜ìš”."},
    {"key": "situation_context",   "question": "ê·?ê°ì •?????í™©???Œë ¤ì£¼ì‹¤?˜ìš”?"},
    {"key": "automatic_thought",   "question": "ê·¸ë•Œ ? ì˜¤ë¥??ê°?€ ë¬´ì—‡?´ì—ˆ?˜ìš”?"},
    {"key": "physical_sensation",  "question": "ëª¸ì—?œëŠ” ?´ë–¤ ? ì²´ ê°ê°(?ê·¼ê±°ë¦¼, ê¸´ìž¥ ?????ê»´ì¡Œë‚˜??"},
    {"key": "intensity",           "question": "ì§€ê¸?ê°ì •??ê°•ë„??0~10 ì¤??´ëŠ ?•ë„?¸ê???"},
    {"key": "environment",         "question": "?„ìž¬ ?€??ì¤‘ì— ì£¼ë? ?˜ê²½(?¥ì†Œ/?¬ëžŒ/?œì•½)?€ ëª…ìƒ??ì§‘ì¤‘?????ˆëŠ” ?˜ê²½?¸ê???"},
    {"key": "behavioral_reaction", "question": "ê·¸ë•Œ ?´ë–»ê²?ë°˜ì‘?˜ì…¨?˜ìš”? (?‰ë™/?œì •/?Œí”¼ ?? ?´ë–¤ ?‰ë™ê³?ë°˜ì‘???´ìœ ê°€ ?ˆì„?Œë‹ˆ ê´œì°®?„ìš”. "},
    {"key": "behavior_metric",     "question": "ìµœê·¼ ?˜ë©´/?œë™/?¬ë°• ??ì¶”ì  ì§€?œê? ?ˆë‹¤ë©?ê°„ë‹¨???Œë ¤ì£¼ì„¸??"},
    {"key": "coping_attempt",      "question": "ê·?ê¸°ë¶„ê³??í™©?ì„œ ë²—ì–´?˜ë ¤ê³??´ë–¤ ?‰ë™???ˆë‚˜?? (?¸í¡, ?°ì±…, ?•ë¦¬ ??"},
    {"key": "available_time",      "question": "ì§€ê¸?ê¸°ë¶„?„í™˜???„í•´ ?¬ìš©ê°€?¥í•œ ?œê°„?€ ?¼ë§ˆ???˜ë‚˜?? (ë¶??¨ìœ„ë¡??€??"},
    {"key": "immediate_goal",      "question": "?´ë²ˆ ?€?”ì—??ì§€ê¸?ê¸°ë¶„ê³??ê°?ì„œ ë²—ì–´?? ?´ë–¤ ?íƒœê°€ ?˜ê³  ?¶ìœ¼? ê???"},
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

def _persist_session_state(session_id: str, state: SessionState) -> None:
    if not redis_client:
        return
    try:
        redis_client.set(f"session:compare:{session_id}", state.model_dump_json(), ex=3600)
    except Exception as exc:
        logger.warning("compare: redis session save failed: %s", exc)

def _normalize_extracted(extracted: Any) -> Dict[str, str]:
    if not isinstance(extracted, dict):
        return {}
    out: Dict[str, str] = {}
    for key, value in extracted.items():
        if value in (None, "", []):
            continue
        if isinstance(value, str):
            text = value.strip()
        else:
            text = str(value).strip()
        if text:
            out[str(key)] = text
    return out

def _compute_missing_keys(checklist: List[ChecklistItem]) -> List[str]:
    return [item.key for item in checklist if not _safe_get_val(item)]

def _reorder_missing(missing_keys: List[str], missing_hint: Any) -> List[str]:
    if not isinstance(missing_hint, list):
        return missing_keys
    ordered = [key for key in missing_hint if key in missing_keys]
    for key in missing_keys:
        if key not in ordered:
            ordered.append(key)
    return ordered

def _question_for_key(checklist: List[ChecklistItem], key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    for item in checklist:
        if item.key == key:
            return item.question
    return None

def _compose_user_message(assistant_message: Any, next_question: Any) -> str:
    msg = (assistant_message or "").strip() if isinstance(assistant_message, str) else ""
    question = (next_question or "").strip() if isinstance(next_question, str) else ""
    if not msg:
        return question
    if question and question not in msg:
        return f"{msg} {question}".strip()
    return msg

# OpenAI-backed compare configuration
PRIMARY_COMPARE_MODEL = (settings.OPENAI_MODEL or "gpt-5.2").strip()
SECONDARY_COMPARE_MODEL = os.getenv("ENGINE_B_MODEL", "gpt-5.2").strip()
ENGINE_HTTP_TIMEOUT = float(os.getenv("ENGINE_HTTP_TIMEOUT", "30"))

class CompareRequest(BaseModel):
    message: str
    temperature: Optional[float] = 0.2
    top_p: Optional[float] = 0.9
    max_tokens: Optional[int] = 1024 # Increased for JSON output
    session_id: Optional[str] = "dev" # Default for testing
    user_id: Optional[str] = None
    # turn_count is no longer used by the core logic

def _chat_payload(
    model: str,
    req: CompareRequest,
    system_prompt: str,
    *,
    force_json: bool = False,
) -> Dict[str, Any]:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message},
        ],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens or 1024,
        "stream": False,
        **({"response_format": {"type": "json_object"}} if force_json else {}),
    }


async def _call_openai(payload: Dict[str, Any]) -> str:
    model = (payload.get("model") or PRIMARY_COMPARE_MODEL).strip()
    if not model:
        model = PRIMARY_COMPARE_MODEL

    request_payload = dict(payload)
    request_payload["model"] = model

    max_tokens = request_payload.get("max_tokens", 1024)
    if model.startswith("gpt-5"):
        request_payload.pop("max_tokens", None)
        request_payload["max_completion_tokens"] = max_tokens
    else:
        request_payload.pop("max_completion_tokens", None)

    client = get_openai_client()
    if client is None:
        raise HTTPException(status_code=503, detail="OpenAI client is not configured.")

    try:
        response = await client.chat.completions.create(**request_payload)
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.exception("OpenAI compare call failed: model=%s", model)
        raise HTTPException(status_code=502, detail=f"AI engine request failed: {exc}")

# Part 3: The refactored main endpoint
@router.post("/compare")
async def compare(req: CompareRequest, response: Response, request: Request) -> Dict[str, Any]:
    started_at = time.perf_counter()
    session_id = req.session_id or "dev"

    # Step 1: Get or Create Session State
    if session_id not in session_storage:
        session_storage[session_id] = create_new_session_state()
    session_state = session_storage[session_id]
    _persist_session_state(session_id, session_state)

    # Simple empathy for the very first message to build rapport
    is_first_message = not any(item.value for item in session_state.checklist)
    user_facing_response = ""
    final_actions: List[Dict[str, Any]] = []
    raw_ai_output = ""

    if is_first_message:
        system_prompt = (
            "You are a highly empathetic AI counselor. Your only goal is to provide a short, warm, "
            "and supportive response to the user's first message. Do not ask any questions. "
            "Make the user feel safe and heard."
        )
        payload = _chat_payload(PRIMARY_COMPARE_MODEL, req, system_prompt, force_json=False)
        raw_ai_output = await _call_openai(payload)
        if not raw_ai_output:
            raise HTTPException(status_code=502, detail="AI engine request failed.")
        user_facing_response = raw_ai_output
    else:
        structured = await structured_client.generate_structured(
            user_message=req.message,
            checklist=session_state.checklist,
        )
        raw_ai_output = json.dumps(structured, ensure_ascii=False)

        extracted = _normalize_extracted(structured.get("extracted"))
        for item in session_state.checklist:
            if item.key in extracted:
                item.value = extracted[item.key]

        missing_keys = _compute_missing_keys(session_state.checklist)
        missing_keys = _reorder_missing(missing_keys, structured.get("missing"))

        ask_key = missing_keys[0] if missing_keys else None
        next_question = structured.get("next_question") or _question_for_key(session_state.checklist, ask_key)
        if ask_key and next_question:
            for item in session_state.checklist:
                if item.key == ask_key:
                    item.ask_count = int(item.ask_count or 0) + 1
                    break

        ai_response = AIResponse(
            response_for_user=_compose_user_message(
                structured.get("assistant_message"),
                next_question,
            ),
            updated_checklist=session_state.checklist,
        )
        user_facing_response = ai_response.response_for_user
        session_storage[session_id] = SessionState(checklist=ai_response.updated_checklist)
        _persist_session_state(session_id, session_storage[session_id])

        is_complete = all(_safe_get_val(item) for item in session_state.checklist)
        if is_complete or structured.get("suggested_action") == "ask_suds":
            payload = structured.get("action_payload")
            if not isinstance(payload, dict):
                payload = {
                    "ui": "banner",
                    "message": "Please share your current intensity from 0 to 10.",
                }
            final_actions = [{"type": "ask_suds", "payload": payload}]

    final_result = {
        "response": user_facing_response,
        "actions": final_actions,
        "comparison_time": round(time.perf_counter() - started_at, 3),
        "timestamp": datetime.utcnow().isoformat(),
        "llama3_response": {
            "model": PRIMARY_COMPARE_MODEL,
            "success": bool(raw_ai_output),
            "response": raw_ai_output,
        },
        "qwen25_response": {"model": SECONDARY_COMPARE_MODEL, "success": False, "response": ""},
        "faster_model": "llama3",
    }

    response.headers["Cache-Control"] = "no-store"
    return final_result


