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

from backend.routes.compare import (  # compare.py에서 이미 있는 것 재사용
    SessionState,
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


# ---- 1) 후보 레이어 모델 ----

class EmotionInference(BaseModel):
    core_emotion_hypothesis: Optional[str] = None
    emotion_candidates: List[str] = Field(default_factory=list)
    reasoning: Optional[str] = None


class EmotionSelection(BaseModel):
    user_choice: Optional[str] = None
    chosen_at: Optional[datetime] = None


# ---- 2) 세션 로드 유틸 (compare.py와 동일 규칙 사용) ----

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


# ---- 3) 체크리스트 → intake dict 변환 ----

STRICT6_KEYS = [
    "core_emotion",
    "situation_context",
    "automatic_thought",
    "physical_sensation",
    "intensity",
    "environment",
]

def _checklist_to_intake_dict(session_state: SessionState) -> Dict[str, Any]:
    """compare.py의 checklist를 key:value dict로 변환 (STRICT 14키 스타일)"""
    ck: Dict[str, Any] = {}
    for item in session_state.checklist:
        ck[item.key] = item.value
    return ck


# ---- 4) LLM 프롬프트: 감정 후보만 뽑기 ----

def _build_emotion_inference_prompt(intake: Dict[str, Any]) -> str:
    intake_json = json.dumps(intake, ensure_ascii=False, indent=2)
    return f"""
너는 20년 경력의 한국어 임상심리학자이자 CBT/ACT 전문가다.

역할:
- 아래 STRICT 인테이크 정보를 보고, 사용자가 느낄 법한 **핵심 감정 후보 3~4개**를 제안한다.
- 이때 감정은 미리 정의된 리스트에서만 고른다.
  예시: ["불안", "압도감", "짜증", "분노", "무기력", "슬픔", "수치심", "자괴감", "허무함", "외로움"]

규칙:
- core_emotion 값이 이미 있어도, 필요하다면 다시 평가할 수 있다.
- 감정 후보는 서로 충분히 구분되는 것들로 고른다(서로 너무 비슷한 말만 3개 X).
- reasoning에서는 왜 이런 후보가 나왔는지를 1~2문장으로 정리한다.
- 출력은 반드시 JSON object 한 개만, 아래 스키마를 따른다.

입력 STRICT 인테이크 (예시 14키 구조):
{intake_json}

출력 형식(JSON only):

{{
  "core_emotion_hypothesis": "가장 가능성이 높은 감정 하나",
  "emotion_candidates": ["후보1", "후보2", "후보3"],
  "reasoning": "왜 이런 후보들이 나왔는지에 대한 짧은 설명"
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


# ---- 5) /emotion/candidates: 감정 후보 리스트 주기 ----

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
    - compare.py에서 이미 쌓인 checklist를 읽어서
    - STRICT 인테이크 dict로 변환한 뒤
    - 감정 후보를 LLM으로부터 받아 프론트에 전달
    """
    state = _load_session_state(req.session_id)
    intake = _checklist_to_intake_dict(state)

    # core_emotion이 이미 꽤 잘 채워져 있으면 굳이 안 불러도 되지만,
    # 1차 버전에서는 무조건 후보를 뽑도록 두고, 나중에 조건 추가해도 됨.
    inference = await _call_llm_emotion_inference(intake)

    # 후보 → 버튼 라벨/설명으로 변환
    # 설명은 일단 심플하게; 나중에 감정별 고정 텍스트 매핑 추가 가능
    candidates_out: List[Dict[str, str]] = []
    for label in inference.emotion_candidates:
        desc = f"지금 상태를 '{label}' 쪽에 더 가깝게 느낄 때 선택하세요."
        candidates_out.append({"label": label, "description": desc})

    # "잘 모르겠어요" 옵션은 백엔드에서 강제로 추가해도 됨
    candidates_out.append({
        "label": "잘 모르겠음",
        "description": "딱 하나로 말하기 어렵거나 복잡하게 느껴질 때."
    })

    return EmotionCandidatesResponse(
        message="지금 감정, 후보를 같이 골라볼까요?",
        candidates=candidates_out,
        core_emotion_hypothesis=inference.core_emotion_hypothesis,
        reasoning=inference.reasoning,
    )


# ---- 6) /emotion/choice: 사용자가 고른 감정을 core_emotion에 반영 ----

class EmotionChoiceRequest(BaseModel):
    session_id: str
    user_choice: str


class EmotionChoiceResponse(BaseModel):
    core_emotion_final: str
    chosen_at: datetime


@router.post("/choice", response_model=EmotionChoiceResponse)
async def set_emotion_choice(req: EmotionChoiceRequest):
    """
    - 사용자가 고른 감정을 compare 세션의 체크리스트 core_emotion에 반영
    - STRICT 14키 레이어 입장에서는 'runtime용 core_emotion'을 채우는 역할
    """
    state = _load_session_state(req.session_id)

    # checklist에서 core_emotion 항목 찾기
    found = False
    for item in state.checklist:
        if item.key == "core_emotion":
            item.value = req.user_choice
            found = True
            break

    if not found:
        # 혹시 core_emotion이 checklist에 없으면 새로 추가
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
