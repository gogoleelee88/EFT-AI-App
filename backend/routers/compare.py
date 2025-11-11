import asyncio
import logging
import os
import time
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from backend.config.settings import get_settings
from backend.models.action_tokens import TokenParser  # keep
from backend.services.emotion_analyzer import get_emotion_analyzer  # keep
from backend.utils.action_builder import build_actions  # keep

logger = logging.getLogger(__name__)
logger.critical("✅✅✅ [V4 DEBUG] Context-Aware compare.py is running! ✅✅✅")
router = APIRouter(prefix="/api/chat", tags=["compare"])

settings = get_settings()

# ==============================
# Data structures
# ==============================
class ChecklistItem(BaseModel):
    key: str
    question: str
    value: Optional[str] = None
    ask_count: int = 0

class SessionState(BaseModel):
    checklist: List[ChecklistItem]
    first_turn_done: bool = False

class AIResponse(BaseModel):
    response_for_user: str = Field(..., description="User-facing response text")
    updated_checklist: List[ChecklistItem] = Field(..., description="Updated checklist")

# In-memory session storage (prod→Redis)
session_storage: Dict[str, SessionState] = {}

# ==== CHECKLIST CONSTANTS (for upgraded checklist) ====

#===대화 바탕 수집===
#1.core_emotion (핵심 감정)
#2.situation_context (상황 맥락)
#3.automatic_thought (자동적 사고)
#4.physical_sensation (신체 감각)
#5.intensity (감정 강도)
#6.environment (환경)
#7.behavioral_reaction (행동 반응 - 묘사)
#8.behavior_metric (행동 측정값 - 추적용) (신설)
#9.coping_attempt (대처 시도 - 강점) (신설)
#10.available_time (가용 시간 - 솔루션 분기용) (신설)
#11.immediate_goal (즉각적인 목표 - 솔루션 정교화용) (신설)

#===AI 분석===
#12.cognitive_distortion (인지 왜곡)
#13.underlying_need (기저 욕구)필수추론 가능감정의 근원(욕구) 파악
#14.core_belief(핵심 신념) 선택/장기불가능 (누적 필요)-> AI가 누적 분석 후 채워야 함


AI_ONLY_KEYS = {"cognitive_distortion", "underlying_need", "core_belief"}

# 사용자가 대화로 채우는 키(질문 대상)
USER_KEYS = {
    "core_emotion", "situation_context", "automatic_thought", "physical_sensation",
    "intensity", "environment", "behavioral_reaction", "behavior_metric",
    "coping_attempt", "available_time", "immediate_goal"
}



# 필수 키(수집 완료/다음단계 분기에 사용)
REQUIRED_KEYS = {
    "core_emotion", "situation_context", "automatic_thought",
    "intensity", "available_time", "immediate_goal"
}

# =============================================


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

def _normalize_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if u.endswith("/v1/chat/completions"):
        return u[:-len("/chat/completions")]
    if u.endswith("/v1"):
        return u
    return u + "/v1"

# ========= text → key:value extractor (robust '>>>> ' prefixes) =========
_CANON_KEYS = {
    "core_emotion", "situation_context", "automatic_thought", "physical_sensation",
    "intensity", "environment", "behavioral_reaction", "behavior_metric",
    "coping_attempt", "available_time", "immediate_goal"
}
def _strip_quote_prefix(s: str) -> str:
    # remove any leading '>' and spaces repeatedly
    s = s.lstrip()
    while s.startswith(">"):
        s = s[1:].lstrip()
    return s

# 과거 호환 라벨 → 새 표준 키 매핑
_LEGACY_TO_NEW = {
    "situation": "situation_context",
    "thought": "automatic_thought",
    "reaction": "behavioral_reaction",
    "time_commitment": "available_time",
    "elaboration": "situation_context",  # 추가 설명을 맥락으로 흡수
}

def _extract_kv_from_text(text: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not text:
        return out
    for raw in text.splitlines():
        s = _strip_quote_prefix(raw)
        if not s or ":" not in s:
            continue
        key, val = s.split(":", 1)
        k = key.strip()
        v = val.strip()
        # 과거 라벨을 새 라벨로 정규화
        k = _LEGACY_TO_NEW.get(k, k)
        if k in _CANON_KEYS and v:
            out[k] = v
    # 중복 루프 제거 (도달 불가 코드 삭제)
    # return out
    # for raw in text.splitlines():
    #     s = _strip_quote_prefix(raw)
    #     if not s or ":" not in s:
    #         continue
    #     key, val = s.split(":", 1)
    #     k = key.strip()
    #     v = val.strip()
    #     if k in _CANON_KEYS and v:
    #         out[k] = v
    return out

# ==== Therapist summary LLM helpers ====
def _ts_build_therapist_prompt(ck: Dict[str, Optional[str]], intensity: Optional[int]) -> str:
    ck_json = json.dumps(ck, ensure_ascii=False, indent=2)
    return f"""
당신은 공감적이고 전문적인 심리상담사입니다. 아래 수집된 정보(체크리스트)를 바탕으로,
'새 질문 없이' 맞춤형 한국어 요약과 즉시 도움이 되는 한두 줄의 안정화 안내 멘트만 작성하세요.

원칙:
- 과장/감정주입/가치판단 금지, 공감적·구체적·검증 가능한 서술만.
- 사용자가 이미 말한 내용을 재질문하지 말 것(물음표로 끝나는 문장 금지).
- "사실/생각/신체/행동/환경/시간" 중 비어있는 항목은 억지로 채우지 말고, 있는 정보만 사용.
- 길이 가이드: 5~8문장, 각 문장 120자 이내.
- 마지막 1문장은 지금 할 안정화(예: EFT 또는 호흡)에 부드럽게 잇는 한 줄 브릿지.
- 말투는 따뜻하지만 단정적이지 않게.

체크리스트(JSON):
{ck_json}

현재 강도(SUDS): {intensity if intensity is not None else "미제공"}

출력형식: 순수 본문만. 마크다운/목록/헤더/따옴표/JSON/코드블록/질문문 금지.
""".strip()

async def _ts_generate_therapist_summary_llm(client, model, ck, intensity, engine_url, content_type, timeout, logger):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a concise, evidence-grounded Korean therapist."},
            {"role": "user", "content": _ts_build_therapist_prompt(ck, intensity)},
        ],
        "temperature": 0.7,
        "top_p": 0.97,
        "max_tokens": 450,
        "stream": False,
    }
    try:
        res = await client.post(engine_url, json=payload, headers={"Content-Type": content_type}, timeout=timeout)
        res.raise_for_status()
        data = res.json()
        txt = (data.get("choices", [{}])[0].get("message", {}) or {}).get("content", "")
        txt = (txt or "").strip()
        if "?" in txt:
            lines = [ln for ln in txt.splitlines() if not ln.strip().endswith("?")]
            txt = "\n".join(lines).strip()
        return txt or None
    except Exception as e:
        logger.warning(f"[therapist_summary_llm] fallback to template due to: {e}")
        return None

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
    max_tokens: Optional[int] = 1024
    session_id: Optional[str] = "dev"
    user_id: Optional[str] = None

def _chat_payload(model: str, req: CompareRequest, system_prompt: str, force_json: bool) -> Dict[str, Any]:
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message},
        ],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens,
        "stream": False,
    }
    if force_json:
        payload["response_format"] = {"type": "json_object"}
    return payload

def build_checklist_prompt(user_message: str, session_state: SessionState) -> str:
    checklist_json = session_state.model_dump_json(indent=2)
    return f"""
You are a highly empathetic and structured AI counselor.

# Mission
1) 사용자의 최신 메시지를 공감적으로 요약하는 **문장**을 먼저 적습니다(질문 금지).
2) 이어서 체크리스트에서 비어있는 항목 중 **가장 중요한 것 한 개만** 짧게 질문합니다(1문장).
3) 재질문 필요 시(ask_count > 0) 부드럽게 바꿔 묻고, 2회 이상이면 **건너뛰기 제안** 문구를 덧붙입니다.
4) 출력은 **JSON만** 반환하세요. 마크다운/설명 불가.

# Input
- User message: "{user_message}"
- Current checklist:
{checklist_json}

# Strict JSON schema
{{
  "response_for_user": "string",
  "updated_checklist": [
    {{
      "key": "core_emotion|situation_context|automatic_thought|physical_sensation|behavioral_reaction|behavior_metric|coping_attempt|available_time|immediate_goal|environment|intensity",
      "question": "string",
      "value": "string or null",
      "ask_count": 0
    }}
  ]
}}
""".strip()

def _pick_next_missing(checklist: List[ChecklistItem]) -> Optional[ChecklistItem]:
    for it in checklist:
        if _safe_get_val(it) is None:
            return it
    return None

def _fallback_ask_next(session_state: SessionState) -> str:
    nxt = _pick_next_missing(session_state.checklist)
    if nxt is None:
        return "모든 정보가 수집되었습니다. 현재 느끼시는 감정의 강도를 알려주시겠어요?"
    nxt.ask_count = (nxt.ask_count or 0) + 1
    return f"말씀 감사합니다. 이어서 {nxt.question}"

# ==============================
# Main endpoint
# ==============================
@router.post("/compare")
async def compare(req: CompareRequest, response: Response, request: Request) -> Dict[str, Any]:
    # 필요한 import: asyncio, json, time, datetime (이미 상단에 있음)
    headers = {"Content-Type": ENGINE_CONTENT_TYPE}
    started_at = time.perf_counter()
    session_id = req.session_id or "dev"

    # 0) 세션 로드
    if session_id not in session_storage:
        session_storage[session_id] = create_new_session_state()
    session_state = session_storage[session_id]

    # 0.1) 사용자 텍스트에서 선-채움 (>>>> 처리)
    kv_user = _extract_kv_from_text(req.message)
    if kv_user:
        filled = 0
        for item in session_state.checklist:
            if item.key in kv_user and kv_user[item.key]:
                item.value = kv_user[item.key]
                filled += 1
        #6개 이상”이 아니라, AI 전용 키 제외 + 필수키(REQUIRED_KEYS) 모두 채움이면 완료로 판정.
        present = {
            i.key for i in session_state.checklist
            if (i.value is not None and str(i.value).strip() != "")
            and i.key not in AI_ONLY_KEYS
        }
        if REQUIRED_KEYS.issubset(present):
            session_state.first_turn_done = True
        session_storage[session_id] = session_state


    # 1) 첫 턴 여부
    is_first_message = not session_state.first_turn_done

    # 2) 프롬프트/페이로드
    # FIX: 들여쓰기 8칸 → 4칸 (IndentationError 예방)
    # (첫 턴 공감 전용 분기 제거: 항상 체크리스트 JSON 경로 사용)
    system_prompt = build_checklist_prompt(req.message, session_state)  # FIX
    payload_a = _chat_payload(ENGINE_A_MODEL, req, system_prompt, force_json=True)  # FIX
    payload_b = _chat_payload(ENGINE_B_MODEL, req, system_prompt, force_json=True)  # FIX

    # 3) A/B 병렬 호출
    # FIX: 들여쓰기 8칸 → 4칸 (동일 블록 정렬)
    a_success, a_text = False, ""  # (정상 들여쓰기)
    b_success, b_text = False, ""
    async with httpx.AsyncClient(timeout=ENGINE_HTTP_TIMEOUT) as client:
        req_a = client.post(ENGINE_A_URL, headers=headers, json=payload_a)
        req_b = client.post(ENGINE_B_URL, headers=headers, json=payload_b)
        resp_a, resp_b = await asyncio.gather(req_a, req_b, return_exceptions=True)

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

    # 4) 선택/변수
    raw_ai_output = a_text if a_success else b_text
    faster_model = "llama3" if a_success else ("qwen25" if b_success else "none")

    user_facing_response = ""
    final_actions: List[Dict[str, Any]] = []

    # 5) 후속 처리
    if not raw_ai_output:
        user_facing_response = "죄송해요. 지금은 응답을 만들 수 없어요."
# [공감대화 부분 - 체크리스트 테스트용으로 주석처리함]     elif is_first_message:
# [공감대화 부분 - 체크리스트 테스트용으로 주석처리함]         user_facing_response = raw_ai_output
# [공감대화 부분 - 체크리스트 테스트용으로 주석처리함]         session_state.first_turn_done = True
# [공감대화 부분 - 체크리스트 테스트용으로 주석처리함]         session_storage[session_id] = session_state
# [공감대화 부분 - 체크리스트 테스트용으로 주석처리함]     else:
    else:    
        parsed_ok = False
        try:
            ai_response_data = json.loads(raw_ai_output)
            if isinstance(ai_response_data, str):
                try:
                    ai_response_data = json.loads(ai_response_data)
                except Exception:
                    pass
            ai_response = AIResponse(**ai_response_data)
            # SAFETY: 엔진 문장을 기본 응답으로 먼저 할당(후속 요약 경로가 있으면 덮어씀)
            user_facing_response = ai_response.response_for_user or ""
            parsed_ok = True

        

            # 5.1) checklist 병합 (LLM 업데이트 + 사용자 KV)
            ck: Dict[str, Optional[str]] = {}
            for it in ai_response.updated_checklist:
                if isinstance(it, dict):
                    ck[it.get("key")] = (it.get("value") if "value" in it else None)
                else:
                    ck[getattr(it, "key", None)] = getattr(it, "value", None)
            # 사용자 KV로 누락 채우기(LLM이 비웠어도 사용자가 준 값 우선)
            if kv_user:
                for k, v in kv_user.items():
                    if k in _CANON_KEYS and (ck.get(k) is None or str(ck.get(k)).strip() == ""):
                        ck[k] = v
            #필수 6개 충족이면 충분 수집으로 간주(요약/브릿지/액션 분기 활성화).? 이거 확인
            canon_keys = list(REQUIRED_KEYS)
            def _filled(v): return v is not None and str(v).strip() not in ("", "null", "None")
            all_filled = all(_filled(ck.get(k)) for k in canon_keys)



            def _parse_intensity_local(val):
                if val is None: return None
                s = str(val).strip().replace("점", "")
                try:
                    n = int(float(s))
                    if 0 <= n <= 10: return n
                    return max(0, min(10, n))
                except: return None
            intensity_num = _parse_intensity_local(ck.get("intensity"))

            if all_filled:
                async with httpx.AsyncClient(timeout=ENGINE_HTTP_TIMEOUT) as _client:
                    summary = await _ts_generate_therapist_summary_llm(
                        client=_client,
                        model=ENGINE_A_MODEL,
                        ck=ck,
                        intensity=intensity_num,
                        engine_url=ENGINE_A_URL,
                        content_type=ENGINE_CONTENT_TYPE,
                        timeout=ENGINE_HTTP_TIMEOUT,
                        logger=logger,
                    )
                    if summary:
                        try:
                            summary = _postprocess_therapist_text(summary)
                        except NameError:
                            pass
                if intensity_num is not None and intensity_num >= 7:
                    next_action = {"type": "start_eft",
                                   "payload": {"preset": "quick_relief", "intensity": intensity_num, "script_hint": "안전/수용·자책완화"}}
                    bridge_line = "지금은 강도가 높아서, 바로 EFT(감정자유기법)로 짧게 안정화를 시작할게요."
                elif intensity_num is not None:
                    next_action = {"type": "start_breath",
                                   "payload": {"style": "box", "duration": "short", "rounds": 3}}
                    bridge_line = "지금은 호흡 안정화(박스 호흡 4-4-4-4)부터 2~3라운드 가볍게 시작할게요."
                else:
                    next_action = {"type": "ask_suds",
                                   "payload": {"ui": "banner", "message": "현재 감정 강도(0~10)를 알려주세요."}}
                    bridge_line = "강도를 알려주시면 다음 단계(호흡 또는 EFT)를 바로 이어가겠습니다."

                if not summary:
                    s   = (ck.get("situation_context") or "").strip()
                    t   = (ck.get("automatic_thought") or "").strip()
                    ps  = (ck.get("physical_sensation") or "").strip()
                    r   = (ck.get("behavioral_reaction") or "").strip()
                    env = (ck.get("environment") or "").strip()

                    pieces = []
                    if s:  pieces.append(f"당시 ‘{s}’ 상황에서")
                    if t:  pieces.append(f"‘{t}’ 생각이 잦았고")
                    if ps: pieces.append(f"몸에서는 ‘{ps}’ 신호가 있었으며")
                    if r:  pieces.append(f"‘{r}’로 대응하셨다고 들었어요.")
                    if env:pieces.append(f"지금은 ‘{env}’ 환경이라 하셨죠.")
                    summary = " ".join(pieces).strip() or "말씀을 차분히 잘 정리해주셨어요."

                user_facing_response = f"{summary}\n\n{bridge_line}"
                final_actions = [next_action]

                # persist merged values
                persist_keys = list({*USER_KEYS, *AI_ONLY_KEYS})
                session_storage[session_id] = SessionState(
                    checklist=[
                        ChecklistItem(key=k, question="", value=str(ck.get(k) or ""), ask_count=1)
                        for k in persist_keys
                    ],
                    first_turn_done=True,
        )


                parsed_ok = True

            if not parsed_ok:
                # 일반 경로(질문 지속)
                parsed_ok = True
                user_facing_response = ai_response.response_for_user
                
                persist_keys = list({*USER_KEYS, *AI_ONLY_KEYS})
                session_storage[session_id] = SessionState(
                    checklist=[
                        ChecklistItem(key=k, question="", value=str(ck.get(k) or ""), ask_count=1)
                        for k in persist_keys
                    ],
                    first_turn_done=True,
            )

                is_complete = all(_safe_get_val(item) is not None for item in ai_response.updated_checklist)
                if is_complete:
                    # 여기서는 intensity가 비었을 때만 묻도록 보정
                    if not _filled(ck.get("intensity")):
                        user_facing_response = "모든 정보가 수집되었습니다. 현재 느끼시는 감정의 강도를 알려주시겠어요?"
                        final_actions = [{"type": "ask_suds",
                                          "payload": {"ui": "banner", "message": "대화를 바탕으로, 현재 감정의 강도를 알려주세요."}}]

        except (json.JSONDecodeError, TypeError, KeyError) as e:
            logger.error(f"Failed to parse AI JSON response: {e}\nRaw output: {raw_ai_output}")
            parsed_ok = False

        if not parsed_ok:
            user_facing_response = _fallback_ask_next(session_state)
            session_state.first_turn_done = True
            session_storage[session_id] = session_state

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


