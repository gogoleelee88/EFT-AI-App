# backend/routes/emotion_candidates.py

import redis
from services.supabase_client import _get_supabase

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from routes.compare import (  # compare.py?ì ?´ë? ?ë ê²??¬ì¬??    SessionState,
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


# ---- 1) ?ë³´ ?ì´??ëª¨ë¸ ----

class EmotionInference(BaseModel):
    core_emotion_hypothesis: Optional[str] = None
    emotion_candidates: List[str] = Field(default_factory=list)
    reasoning: Optional[str] = None


class EmotionSelection(BaseModel):
    user_choice: Optional[str] = None
    chosen_at: Optional[datetime] = None


# ---- 2) ?¸ì ë¡ë ?í¸ (compare.py? ?ì¼ ê·ì¹ ?¬ì©) ----

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


# ---- 3) ì²´í¬ë¦¬ì¤????intake dict ë³??----

STRICT6_KEYS = [
    "core_emotion",
    "situation_context",
    "automatic_thought",
    "physical_sensation",
    "intensity",
    "environment",
]

def _checklist_to_intake_dict(session_state: SessionState) -> Dict[str, Any]:
    """compare.py??checklistë¥?key:value dictë¡?ë³??(STRICT 14???¤í???"""
    ck: Dict[str, Any] = {}
    for item in session_state.checklist:
        ck[item.key] = item.value
    return ck


# ---- 4) LLM ?ë¡¬?í¸: ê°ì ?ë³´ë§?ë½ê¸° ----

def _build_emotion_inference_prompt(intake: Dict[str, Any]) -> str:
    intake_json = json.dumps(intake, ensure_ascii=False, indent=2)
    return f"""
?ë 20??ê²½ë¥???êµ???ì?¬ë¦¬?ì?´ì CBT/ACT ?ë¬¸ê°??

??:
- ?ë STRICT ?¸í?´í¬ ?ë³´ë¥?ë³´ê³, ?¬ì©?ê? ?ë ë²í **?µì¬ ê°ì ?ë³´ 3~4ê°?*ë¥??ì?ë¤.
- ?´ë ê°ì? ë¯¸ë¦¬ ?ì??ë¦¬ì¤?¸ì?ë§ ê³ë¥¸??
  ?ì: ["ë¶ì", "?ëê°?, "ì§ì¦", "ë¶ë¸", "ë¬´ê¸°??, "?¬í", "?ì¹??, "?ê´´ê°?, "?ë¬´??, "?¸ë¡?"]

ê·ì¹:
- core_emotion ê°ì´ ?´ë? ?ì´?? ?ì?ë¤ë©??¤ì ?ê??????ë¤.
- ê°ì ?ë³´???ë¡ ì¶©ë¶??êµ¬ë¶?ë ê²ë¤ë¡?ê³ë¥¸???ë¡ ?ë¬´ ë¹ì·??ë§ë§ 3ê°?X).
- reasoning?ì?????´ë° ?ë³´ê° ?ì?ì?ë¥?1~2ë¬¸ì¥?¼ë¡ ?ë¦¬?ë¤.
- ì¶ë¥? ë°ë??JSON object ??ê°ë§, ?ë ?¤í¤ë§ë? ?°ë¥¸??

?ë¥ STRICT ?¸í?´í¬ (?ì 14??êµ¬ì¡°):
{intake_json}

ì¶ë¥ ?ì(JSON only):

{{
  "core_emotion_hypothesis": "ê°??ê°?¥ì±???ì? ê°ì ?ë",
  "emotion_candidates": ["?ë³´1", "?ë³´2", "?ë³´3"],
  "reasoning": "???´ë° ?ë³´?¤ì´ ?ì?ì??????ì§§ì? ?¤ëª"
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


# ---- 5) /emotion/candidates: ê°ì ?ë³´ ë¦¬ì¤??ì£¼ê¸° ----

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
    - compare.py?ì ?´ë? ?ì¸ checklistë¥??½ì´??    - STRICT ?¸í?´í¬ dictë¡?ë³?í ??    - ê°ì ?ë³´ë¥?LLM?¼ë¡ë¶??ë°ì ?ë¡?¸ì ?ë¬
    """
    state = _load_session_state(req.session_id)
    intake = _checklist_to_intake_dict(state)

    # core_emotion???´ë? ê½???ì±ì???ì¼ë©?êµ³ì´ ??ë¶ë¬???ì?ë§?
    # 1ì°?ë²ì?ì??ë¬´ì¡°ê±??ë³´ë¥?ë½ëë¡??ê³, ?ì¤??ì¡°ê±´ ì¶ê??´ë ??
    inference = await _call_llm_emotion_inference(intake)

    # ?ë³´ ??ë²í¼ ?¼ë²¨/?¤ëª?¼ë¡ ë³??    # ?¤ëª? ?¼ë¨ ?¬í?ê²; ?ì¤??ê°ìë³?ê³ì ?ì¤??ë§¤í ì¶ê? ê°??    candidates_out: List[Dict[str, str]] = []
    for label in inference.emotion_candidates:
        desc = f"ì§ê¸??íë¥?'{label}' ìª½ì ??ê°ê¹ê² ?ë ???í?ì¸??"
        candidates_out.append({"label": label, "description": desc})
    candidates_out.append({

    # "??ëª¨ë¥´ê²ì´?? ?µì? ë°±ì?ì??ê°ìë¡?ì¶ê??´ë ??    candidates_out.append({
        "label": "??ëª¨ë¥´ê²ì",
        "description": "???ëë¡?ë§íê¸??´ëµê±°ë ë³µì¡?ê² ?ê»´ì§???"
    })

    return EmotionCandidatesResponse(
        message="ì§ê¸?ê°ì, ?ë³´ë¥?ê°ì´ ê³¨ë¼ë³¼ê¹??",
        candidates=candidates_out,
        core_emotion_hypothesis=inference.core_emotion_hypothesis,
        reasoning=inference.reasoning,
    )


# ---- 6) /emotion/choice: ?¬ì©?ê? ê³ë¥¸ ê°ì??core_emotion??ë°ì ----

class EmotionChoiceRequest(BaseModel):
    session_id: str
    user_choice: str


class EmotionChoiceResponse(BaseModel):
    core_emotion_final: str
    chosen_at: datetime


@router.post("/choice", response_model=EmotionChoiceResponse)
async def set_emotion_choice(req: EmotionChoiceRequest):
    """
    - ?¬ì©?ê? ê³ë¥¸ ê°ì??compare ?¸ì??ì²´í¬ë¦¬ì¤??core_emotion??ë°ì
    - STRICT 14???ì´???ì¥?ì??'runtime??core_emotion'??ì±ì°????
    """
    state = _load_session_state(req.session_id)

    # checklist?ì core_emotion ??ª© ì°¾ê¸°
    found = False
    for item in state.checklist:
        if item.key == "core_emotion":
            item.value = req.user_choice
            found = True
            break

    if not found:
        # ?¹ì core_emotion??checklist???ì¼ë©??ë¡ ì¶ê?
        state.checklist.append(
            ChecklistItem(key="core_emotion", question="", value=req.user_choice, ask_count=1)
        )

    _save_session_state(req.session_id, state)

    now = datetime.utcnow()
    return EmotionChoiceResponse(
        core_emotion_final=req.user_choice,
        chosen_at=now,
    )
