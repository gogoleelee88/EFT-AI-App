# backend/routes/emotion_candidates.py

import redis
import os
from supabase import create_client

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from routes.compare import (  # compare.py?ì„œ ?´ë? ?ˆëŠ” ê²??¬ì‚¬??    SessionState,
    ChecklistItem,
    redis_client,
    ENGINE_A_URL,
    ENGINE_A_MODEL,
    ENGINE_CONTENT_TYPE,
    ENGINE_HTTP_TIMEOUT,
)

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
        sb.table("emotion_checkins").insert(payload.model_dump()).execute()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save emotion checkin: {e}")


# ---- 1) ?„ë³´ ?ˆì´??ëª¨ë¸ ----

class EmotionInference(BaseModel):
    core_emotion_hypothesis: Optional[str] = None
    emotion_candidates: List[str] = Field(default_factory=list)
    reasoning: Optional[str] = None


class EmotionSelection(BaseModel):
    user_choice: Optional[str] = None
    chosen_at: Optional[datetime] = None


# ---- 2) ?¸ì…˜ ë¡œë“œ ? í‹¸ (compare.py?€ ?™ì¼ ê·œì¹™ ?¬ìš©) ----

def _load_session_state(session_id: str) -> SessionState:
    session_key = f"session:compare:{session_id}"
    if not redis_client:
        raise HTTPException(status_code=500, detail="Redis not configured for emotion state")

    raw = redis_client.get(session_key)
    if not raw:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        data = json.loads(raw)
        return SessionState(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse session state: {e}")


def _save_session_state(session_id: str, state: SessionState) -> None:
    session_key = f"session:compare:{session_id}"
    redis_client.set(session_key, state.model_dump_json(), ex=3600)


# ---- 3) ì²´í¬ë¦¬ìŠ¤????intake dict ë³€??----

STRICT6_KEYS = [
    "core_emotion",
    "situation_context",
    "automatic_thought",
    "physical_sensation",
    "intensity",
    "environment",
]

def _checklist_to_intake_dict(session_state: SessionState) -> Dict[str, Any]:
    """compare.py??checklistë¥?key:value dictë¡?ë³€??(STRICT 14???¤í???"""
    ck: Dict[str, Any] = {}
    for item in session_state.checklist:
        ck[item.key] = item.value
    return ck


# ---- 4) LLM ?„ë¡¬?„íŠ¸: ê°ì • ?„ë³´ë§?ë½‘ê¸° ----

def _build_emotion_inference_prompt(intake: Dict[str, Any]) -> str:
    intake_json = json.dumps(intake, ensure_ascii=False, indent=2)
    return f"""
?ˆëŠ” 20??ê²½ë ¥???œêµ­???„ìƒ?¬ë¦¬?™ì?´ì CBT/ACT ?„ë¬¸ê°€??

??• :
- ?„ë˜ STRICT ?¸í…Œ?´í¬ ?•ë³´ë¥?ë³´ê³ , ?¬ìš©?ê? ?ë‚„ ë²•í•œ **?µì‹¬ ê°ì • ?„ë³´ 3~4ê°?*ë¥??œì•ˆ?œë‹¤.
- ?´ë•Œ ê°ì •?€ ë¯¸ë¦¬ ?•ì˜??ë¦¬ìŠ¤?¸ì—?œë§Œ ê³ ë¥¸??
  ?ˆì‹œ: ["ë¶ˆì•ˆ", "?•ë„ê°?, "ì§œì¦", "ë¶„ë…¸", "ë¬´ê¸°??, "?¬í””", "?˜ì¹˜??, "?ê´´ê°?, "?ˆë¬´??, "?¸ë¡œ?€"]

ê·œì¹™:
- core_emotion ê°’ì´ ?´ë? ?ˆì–´?? ?„ìš”?˜ë‹¤ë©??¤ì‹œ ?‰ê??????ˆë‹¤.
- ê°ì • ?„ë³´???œë¡œ ì¶©ë¶„??êµ¬ë¶„?˜ëŠ” ê²ƒë“¤ë¡?ê³ ë¥¸???œë¡œ ?ˆë¬´ ë¹„ìŠ·??ë§ë§Œ 3ê°?X).
- reasoning?ì„œ?????´ëŸ° ?„ë³´ê°€ ?˜ì™”?”ì?ë¥?1~2ë¬¸ì¥?¼ë¡œ ?•ë¦¬?œë‹¤.
- ì¶œë ¥?€ ë°˜ë“œ??JSON object ??ê°œë§Œ, ?„ë˜ ?¤í‚¤ë§ˆë? ?°ë¥¸??

?…ë ¥ STRICT ?¸í…Œ?´í¬ (?ˆì‹œ 14??êµ¬ì¡°):
{intake_json}

ì¶œë ¥ ?•ì‹(JSON only):

{{
  "core_emotion_hypothesis": "ê°€??ê°€?¥ì„±???’ì? ê°ì • ?˜ë‚˜",
  "emotion_candidates": ["?„ë³´1", "?„ë³´2", "?„ë³´3"],
  "reasoning": "???´ëŸ° ?„ë³´?¤ì´ ?˜ì™”?”ì????€??ì§§ì? ?¤ëª…"
}}
""".strip()


async def _call_llm_emotion_inference(intake: Dict[str, Any]) -> EmotionInference:
    prompt = _build_emotion_inference_prompt(intake)
    payload = {
        "model": ENGINE_A_MODEL,
        "messages": [
            {"role": "system", "content": "You are a Korean clinical psychologist for emotion inference."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "top_p": 0.9,
        "max_tokens": 512,
        "stream": False,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=ENGINE_HTTP_TIMEOUT) as client:
        res = await client.post(
            ENGINE_A_URL,
            json=payload,
            headers={"Content-Type": ENGINE_CONTENT_TYPE},
        )
        res.raise_for_status()
        data = res.json()
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        ) or ""

    try:
        obj = json.loads(content)
    except json.JSONDecodeError:
        obj = json.loads(content.strip())

    return EmotionInference(**obj)


# ---- 5) /emotion/candidates: ê°ì • ?„ë³´ ë¦¬ìŠ¤??ì£¼ê¸° ----

class EmotionCandidatesRequest(BaseModel):
    session_id: str


class EmotionCandidatesResponse(BaseModel):
    message: str
    candidates: List[Dict[str, str]]  # {label, description}
    core_emotion_hypothesis: Optional[str] = None
    reasoning: Optional[str] = None


@router.post("/candidates", response_model=EmotionCandidatesResponse)
async def get_emotion_candidates(req: EmotionCandidatesRequest):
    """
    - compare.py?ì„œ ?´ë? ?“ì¸ checklistë¥??½ì–´??    - STRICT ?¸í…Œ?´í¬ dictë¡?ë³€?˜í•œ ??    - ê°ì • ?„ë³´ë¥?LLM?¼ë¡œë¶€??ë°›ì•„ ?„ë¡ ?¸ì— ?„ë‹¬
    """
    state = _load_session_state(req.session_id)
    intake = _checklist_to_intake_dict(state)

    # core_emotion???´ë? ê½???ì±„ì›Œ???ˆìœ¼ë©?êµ³ì´ ??ë¶ˆëŸ¬???˜ì?ë§?
    # 1ì°?ë²„ì „?ì„œ??ë¬´ì¡°ê±??„ë³´ë¥?ë½‘ë„ë¡??ê³ , ?˜ì¤‘??ì¡°ê±´ ì¶”ê??´ë„ ??
    inference = await _call_llm_emotion_inference(intake)

    # ?„ë³´ ??ë²„íŠ¼ ?¼ë²¨/?¤ëª…?¼ë¡œ ë³€??    # ?¤ëª…?€ ?¼ë‹¨ ?¬í”Œ?˜ê²Œ; ?˜ì¤‘??ê°ì •ë³?ê³ ì • ?ìŠ¤??ë§¤í•‘ ì¶”ê? ê°€??    candidates_out: List[Dict[str, str]] = []
    for label in inference.emotion_candidates:
        desc = f"ì§€ê¸??íƒœë¥?'{label}' ìª½ì— ??ê°€ê¹ê²Œ ?ë‚„ ??? íƒ?˜ì„¸??"
        candidates_out.append({"label": label, "description": desc})

    # "??ëª¨ë¥´ê² ì–´?? ?µì…˜?€ ë°±ì—”?œì—??ê°•ì œë¡?ì¶”ê??´ë„ ??    candidates_out.append({
        "label": "??ëª¨ë¥´ê² ìŒ",
        "description": "???˜ë‚˜ë¡?ë§í•˜ê¸??´ë µê±°ë‚˜ ë³µì¡?˜ê²Œ ?ê»´ì§???"
    })

    return EmotionCandidatesResponse(
        message="ì§€ê¸?ê°ì •, ?„ë³´ë¥?ê°™ì´ ê³¨ë¼ë³¼ê¹Œ??",
        candidates=candidates_out,
        core_emotion_hypothesis=inference.core_emotion_hypothesis,
        reasoning=inference.reasoning,
    )


# ---- 6) /emotion/choice: ?¬ìš©?ê? ê³ ë¥¸ ê°ì •??core_emotion??ë°˜ì˜ ----

class EmotionChoiceRequest(BaseModel):
    session_id: str
    user_choice: str


class EmotionChoiceResponse(BaseModel):
    core_emotion_final: str
    chosen_at: datetime


@router.post("/choice", response_model=EmotionChoiceResponse)
async def set_emotion_choice(req: EmotionChoiceRequest):
    """
    - ?¬ìš©?ê? ê³ ë¥¸ ê°ì •??compare ?¸ì…˜??ì²´í¬ë¦¬ìŠ¤??core_emotion??ë°˜ì˜
    - STRICT 14???ˆì´???…ì¥?ì„œ??'runtime??core_emotion'??ì±„ìš°????• 
    """
    state = _load_session_state(req.session_id)

    # checklist?ì„œ core_emotion ??ª© ì°¾ê¸°
    found = False
    for item in state.checklist:
        if item.key == "core_emotion":
            item.value = req.user_choice
            found = True
            break

    if not found:
        # ?¹ì‹œ core_emotion??checklist???†ìœ¼ë©??ˆë¡œ ì¶”ê?
        state.checklist.append(
            ChecklistItem(key="core_emotion", question="", value=req.user_choice, ask_count=1)
        )

    _save_session_state(req.session_id, state)

    now = datetime.utcnow()
    return EmotionChoiceResponse(
        core_emotion_final=req.user_choice,
        chosen_at=now,
    )

def _get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)

