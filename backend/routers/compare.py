import asyncio
import logging
import os
import time
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
import redis
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field, ValidationError

from fastapi.responses import JSONResponse


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

# ==============================
# Data structures
# ==============================
class ChecklistItem(BaseModel):
    key: str
    question: Optional[str] = ""   # 앞에서 바꿔둔 상태일 거야
    value: Optional[Any] = None    # 🔥 핵심: Any 허용
    ask_count: int = 0


class SessionState(BaseModel):
    checklist: List[ChecklistItem]
    first_turn_done: bool = False

class AIResponse(BaseModel):
    response_for_user: str = Field(..., description="User-facing response text")
    # ❗ LLM이 updated_checklist를 안 줄 수도 있으니, 기본값을 빈 리스트로 둔다.
    updated_checklist: List[ChecklistItem] = Field(
        default_factory=list,
        description="Updated checklist (can be empty if the model doesn't update anything)",
    )

# In-memory session storage (prod→Redis)
session_storage: Dict[str, SessionState] = {}
# In-memory session storage (prod→Redis)


# Redis 클라이언트 초기화
try:
    # 'decode_responses=True'는 Redis에서 받은 데이터를 자동으로 string(utf-8)으로 변환해줍니다.
    redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    redis_client.ping()
    logger.info("✅ Redis session storage connected.")
except Exception as e:
    logger.error(f"❌ Redis connection failed: {e}. Falling back to in-memory dict.")
    # Redis 연결 실패 시, 기존처럼 1회용 메모리 딕셔너리로 비상 동작합니다.
    redis_client = None
    session_storage_fallback = {} # 비상용 딕셔너리

 # ==== CHECKLIST CONSTANTS (for upgraded checklist) ====

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

# 🔹 자연어 추출 레이어에서 사용하는 키 목록
INTAKE_EXTRA_KEYS = {
    "core_emotion",
    "situation_context",
    "automatic_thought",
    "physical_sensation",
    "behavioral_reaction",
    "behavior_metric",
    "coping_attempt",
    "environment",
    "intensity",
    "available_time",
    "immediate_goal",
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

# [compare.py]

# ...
def _extract_kv_from_text(text: str) -> Dict[str, str]:
    """
    사용자/테스트 텍스트에서 key:value 패턴을 추출한다.
    - 지원 예시: "#core_emotion: 불안함", "#1.automatic_thought: 모두가 나를 싫어할 거야"
    - 실제 사용자 입력이 아닌, 테스트 및 구조화된 추출을 위해 사용됩니다.
    """
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

        # 1) 테스트용 DSL: "#..." 제거
        if k.startswith("#"):
            k = k[1:].strip()

        # 2) "#1.core_emotion" 같은 번호 접두어 처리
        if "." in k:
            head, tail = k.split(".", 1)
            if head.isdigit():
                k = tail.strip()

        # 3) 과거 라벨을 새 라벨로 정규화
        k = _LEGACY_TO_NEW.get(k, k)

        # 4) 우리가 관리하는 표준 키만 허용
        if k in _CANON_KEYS and v:
            out[k] = v

    return out

    

def _merge_values(old: Optional[str], new: Optional[str]) -> Optional[str]:
    """
    체크리스트 value 누적 규칙:
    - new가 비었으면 old 유지
    - old가 비었으면 new로 설정
    - 둘 다 있으면 'old | new' 형태로 Append
    """
    if new is None or str(new).strip() == "":
        return old
    
    new_s = str(new).strip()
    
    if old is None or str(old).strip() == "":
        return new_s

    old_s = str(old).strip()

    # 중복 방지는 선택 사항이지만, 깔끔한 누적을 위해 구현합니다.
    if new_s in old_s:
        return old_s

    return f"{old_s} | {new_s}"



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


def _build_intake_extractor_prompt(user_text: str) -> str:
    """
    자연어 user_text에서 인테이크 JSON을 추출하기 위한 프롬프트 빌더.
    - CBT 기준으로 situation_context(상황)와 automatic_thought(자동적 사고)를 명확히 분리하도록 지시한다.
    """
    return f"""
당신은 한국어 심리 상담 인테이크를 구조화된 JSON으로 추출하는 AI입니다.

# 역할
- 아래 정의된 11개 key에 해당하는 정보를, 사용자가 쓴 고민 글에서 찾아 JSON으로만 출력합니다.
- 텍스트에 명확히 드러나지 않는 정보는 절대 추측하지 말고 null로 둡니다.
- 출력은 반드시 JSON object 한 개뿐이어야 하며, 설명/마크다운/코드블록을 섞지 마세요.

# key 정의 (CBT 기준)

1. core_emotion (핵심 감정)
   - 사용자가 지금 가장 크게 느끼는 감정 한 단어 또는 짧은 구.
   - 예: "불안", "우울함", "짜증", "허무함"

2. situation_context (상황/방아쇠, FACT 중심)
   - 외부에서 실제로 벌어진 사건/상황만 적습니다.
   - 시간/장소/사람/무슨 일이 있었는지 같은 "사실(fact)" 위주로.
   - 사용자의 해석/생각/믿음은 넣지 않습니다.
   - 예시 (O):
     - "팀 미팅에서 내가 의견을 말했을 때 동료들이 반응을 잘 하지 않았다"
     - "상사가 내 발표 중간에 말을 끊고 다른 안건으로 넘어갔다"
   - 예시 (X, automatic_thought로 가야 하는 것):
     - "사람들이 나를 무시한다"
     - "나는 중요하지 않다"

3. automatic_thought (자동적 사고, 해석/믿음)
   - 위 상황에서 머릿속에 떠오른 문장/해석/신념을 적습니다.
   - "그래서 나는 ~라고 느꼈다/믿었다/생각했다"에 해당하는 내용.
   - 예:
     - "사람들이 나를 중요하게 생각하지 않는 것 같다"
     - "내 의견은 가치가 없어서 아무도 듣지 않을 거야"
     - "나는 능력이 없어서 결국 실패할 거야"
   - 언제/어디서/누가/무슨 일이 있었는지 같은 상황 설명은 여기에 쓰지 않습니다.

4. physical_sensation (신체 감각)
   - 감정이 올라왔을 때 몸에서 느껴진 감각.
   - 예: "가슴이 두근거림", "속이 메스꺼움", "머리가 띵함", "어깨가 잔뜩 올라감"

5. intensity (감정 강도)
   - 0~10 사이의 숫자 또는 숫자를 포함한 문자열.
   - 예: 7, "7", "7점"; 범위를 벗어나면 null로 둡니다.

6. environment (환경)
   - 현재 사용자가 있는 장소/환경을 짧게 요약.
   - 예: "집에서 혼자", "회사 회의실", "카페", "지하철 안"

7. behavioral_reaction (행동 반응)
   - 그 감정/상황에서 사용자가 실제로 보인 행동/표정/회피 등을 서술.
   - 예: "그 이후로 회의에서 말을 거의 하지 않았다", "회의 끝나고 바로 화장실로 가서 울었다"

8. behavior_metric (행동 지표)
   - 최근 수면/활동/심박/음주/카페인/스크린타임 등 추적 가능한 지표.
   - 예: "어제 3시간밖에 못 잤다", "최근 일주일 동안 매일 야근했다", "커피를 하루에 4잔 마신다"

9. coping_attempt (대처 시도)
   - 힘든 감정/상황에서 벗어나려고 한 행동/시도.
   - 예: "산책을 했다", "유튜브를 보며 시간 보내려고 했다", "호흡을 깊게 해보려 했다"

10. available_time (가용 시간)
    - 지금 이 대화/안정화에 쓸 수 있는 시간.
    - 숫자 또는 분 단위 표현이면 그대로 사용 (예: "20분", "15분 정도").

11. immediate_goal (즉각적인 목표)
    - 이번 대화/세션에서 사용자가 원하는 상태 변화.
    - 예: "머리가 좀 가벼워졌으면 좋겠다", "오늘 밤에는 잠을 좀 잤으면 좋겠다"

# 추출 규칙

- 각 key는 입력 텍스트에 명확하게 존재하는 부분만 채웁니다.
- 애매하거나, 모델이 추측해야만 나올 것 같은 정보는 반드시 null로 둡니다.
- situation_context와 automatic_thought는 절대 섞지 마세요:
  - situation_context는 외부에서 실제로 관찰 가능한 사건/상황의 묘사입니다.
  - automatic_thought는 그 사건에 대해 사용자의 머릿속에서 떠오른 생각/해석/믿음입니다.

# 입력 텍스트

다음 사용자의 고민 글에서 위 key들을 추출하세요:

\"\"\"{user_text}\"\"\"

# 출력 형식 (반드시 이 JSON 스키마를 따르세요)

다음과 같이 JSON object 하나만 출력하세요:

{{
  "core_emotion":        string 또는 null,
  "situation_context":   string 또는 null,
  "automatic_thought":   string 또는 null,
  "physical_sensation":  string 또는 null,
  "intensity":           number 또는 string 또는 null,
  "environment":         string 또는 null,
  "behavioral_reaction": string 또는 null,
  "behavior_metric":     string 또는 null,
  "coping_attempt":      string 또는 null,
  "available_time":      string 또는 null,
  "immediate_goal":      string 또는 null
}}

기타 텍스트나 설명은 출력하지 말고, JSON object 한 개만 출력하세요.
""".strip()


# ==============================
# 🔹 자연어 인테이크 추출 레이어 (LLM)
# ==============================
def _sanitize_intake_nl_output(user_text: str, obj: Dict[str, Any]) -> Dict[str, Any]:
    """
    LLM 추출 결과에서 입력에 근거 없는 환각을 줄이기 위한 1차 룰 기반 필터.

    - environment / behavior_metric:
      원문에 관련 단어가 전혀 없으면 null로 강제.
    - intensity:
      0~10 범위를 벗어나면 미리 None 처리.
    """
    if not obj:
        return obj

    text = user_text or ""
    if not text:
        return obj

    def _contains_any(words: List[str]) -> bool:
        return any(w in text for w in words)

    # environment: 장소/환경 관련 단어가 전혀 없으면 null
    env = obj.get("environment")
    if env not in (None, "", "null", "None"):
        if not _contains_any(["집", "회사", "회의실", "카페", "도서관", "지하철", "버스", "기숙사", "방", "식당", "카페테리아"]):
            obj["environment"] = None

    # behavior_metric: 수면/활동/심박/음주/카페인/스크린타임 언급 없으면 null
    bm = obj.get("behavior_metric")
    if bm not in (None, "", "null", "None"):
        if not _contains_any([
            "잠", "수면", "자다", "못 자", "깊이 잠", "피곤", "기상",
            "운동", "걸음", "걸음 수", "심박", "맥박",
            "알코올", "술", "소주", "맥주", "와인",
            "카페인", "커피", "에너지 드링크",
            "스크린타임", "화면 시간", "핸드폰", "휴대폰", "폰"
        ]):
            obj["behavior_metric"] = None

    # intensity: 0~10 범위를 벗어나면 None
    if "intensity" in obj:
        val = obj.get("intensity")
        if isinstance(val, (int, float)):
            if not (0 <= val <= 10):
                obj["intensity"] = None
        elif isinstance(val, str):
            s = val.strip().replace("점", "")
            try:
                n = float(s)
                if not (0 <= n <= 10):
                    obj["intensity"] = None
            except Exception:
                obj["intensity"] = None

    # immediate_goal / behavioral_reaction은
    # "추가로 생성"할 수는 없으므로 여기서는 건들지 않고,
    # FT에서 정확도 개선을 노린다.
    return obj


async def extract_intake_from_text(
    text: str,
    client: httpx.AsyncClient,
) -> Dict[str, Any]:
    """
    자연어 user_text에서 인테이크 정보(JSON)를 추출하는 LLM 레이어.
    실패 시 빈 dict 반환.
    """
    if not text or not text.strip():
        return {}

    prompt = _build_intake_extractor_prompt(text)

    payload = {
        "model": ENGINE_A_MODEL,  # 또는 별도 추출용 모델로 교체 가능
        "messages": [
            {"role": "system", "content": "You are a Korean intake JSON extractor."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.0,
        "top_p": 1.0,
        "max_tokens": 512,
        "stream": False,
        "response_format": {"type": "json_object"},
    }

    try:
        res = await client.post(
            ENGINE_A_URL,
            json=payload,
            headers={"Content-Type": ENGINE_CONTENT_TYPE},
            timeout=ENGINE_HTTP_TIMEOUT,
        )
        res.raise_for_status()
        data = res.json()
        content = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        ) or ""

        # response_format 덕분에 이미 JSON일 확률이 높지만, 방어적으로 처리
        try:
            obj = json.loads(content)
        except json.JSONDecodeError:
            obj = json.loads(content.strip())

        if not isinstance(obj, dict):
            return {}

        # 우리가 아는 키만 필터링
        cleaned: Dict[str, Any] = {}
        for k in INTAKE_EXTRA_KEYS:
            if k in obj:
                cleaned[k] = obj[k]

        # 🔹 룰 기반 안전망 한 번 더 적용
        cleaned = _sanitize_intake_nl_output(text, cleaned)
        return cleaned
    except Exception as e:
        logger.warning(f"[intake_extractor] failed: {e}")
        return {}


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
        "max_tokens": 2048, # 1024에서 2048로 늘려서 JSON 잘림 방지
        "stream": False,
    }
    if force_json:
        payload["response_format"] = {"type": "json_object"}
    return payload

def build_checklist_prompt(user_message: str, session_state: SessionState) -> str:
    """
    메인 LLM이 1) 공감 요약, 2) 체크리스트 value 일부 보정, 3) 다음 질문까지 수행하도록 하는 프롬프트.
    - 이미 채워진 값은 최대한 존중하고,
    - 사용자 메시지에 '명확히 드러난' 정보만 value에 반영한다.
    - 정보가 없는 항목은 추측하지 말고 그대로 null로 둔다.
    """
    checklist_json = session_state.model_dump_json(indent=2)
    return f"""
You are a highly empathetic and structured Korean counselor.

# Mission
1) Carefully read the `User message` and `Current checklist`.
2) If some checklist items have `value` = null but the information is **clearly present** in the user message,
   you may fill the `value` using the user's words (e.g. "불안해서 잠이 잘 안 와요" → core_emotion: "불안").
   - If the information is NOT clearly given, keep `value` as null. Do NOT guess or fabricate.
3) Then write `response_for_user` in Korean:
   - First, 1–3 empathetic sentences summarizing what the user is going through (no questions here).
   - Then append ONE short follow-up question that asks about exactly ONE still-missing important item.
4) In `updated_checklist`, return the checklist items you want to update in this turn
   (you may return the full list or only the changed items).
5) Output ONLY a single JSON object that follows the schema below. No extra text, comments or Markdown.

# Input
- User message:
{user_message}

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

# core_emotion이 빈 문자열 / "null" / "None" 같은 상태인지 체크
def _is_empty_or_null(v: Any) -> bool:
    if v is None:
        return True
    s = str(v).strip()
    return s == "" or s.lower() in ("null", "none")

#===============================

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
    session_key = f"session:compare:{session_id}"  # Redis 키 이름 정의

    # 0) 세션 로드
    if redis_client:
        session_data = redis_client.get(session_key)
        if not session_data:
            session_state = create_new_session_state()
        else:
            # Redis에서 가져온 JSON 문자열을 Pydantic 모델 객체로 복원
            session_state = SessionState(**json.loads(session_data))
    else:  # Redis 연결 실패 시 비상용 딕셔너리 사용
        if session_id not in session_storage_fallback:
            session_storage_fallback[session_id] = create_new_session_state()
        session_state = session_storage_fallback[session_id]

    # 0.1) 사용자 텍스트에서 선-채움 (>>>> / #key: 처리 - DSL 우선)
    kv_user = _extract_kv_from_text(req.message)
    if kv_user:
        for item in session_state.checklist:
            if item.key in kv_user and kv_user[item.key]:
                item.value = _merge_values(item.value, kv_user[item.key])

        present = {
            i.key for i in session_state.checklist
            if (i.value is not None and str(i.value).strip() != "")
            and i.key not in AI_ONLY_KEYS
        }
        if REQUIRED_KEYS.issubset(present):
            session_state.first_turn_done = True

        # kv_user 처리 후 세션 저장 (Redis or fallback)
        if redis_client:
            redis_client.set(session_key, session_state.model_dump_json(), ex=3600)
        else:
            session_storage_fallback[session_id] = session_state

    # 0.2) 자연어 기반 인테이크 추출 (LLM 레이어, Feature Flag)
    natural_kv: Dict[str, Any] = {}
    if os.getenv("INTAKE_NL_EXTRACTION", "0") == "1":
        try:
            async with httpx.AsyncClient(timeout=ENGINE_HTTP_TIMEOUT) as _client:
                natural_kv = await extract_intake_from_text(req.message, _client)
        except Exception as e:
            logger.warning(f"[compare] natural intake extraction failed: {e}")
            natural_kv = {}

    # 🔹 자연어 추출 결과를 "비어 있는 칸만" 채우는 fill-in 전략으로 반영
    if natural_kv:
        state_updated = False

        for item in session_state.checklist:
            if item.key in natural_kv:
                cur = item.value
                # 이미 값이 있으면(DSL/이전 턴) 건드리지 않음
                if cur is None or str(cur).strip() == "":
                    item.value = natural_kv[item.key]
                    state_updated = True

        if state_updated:
            present = {
                i.key for i in session_state.checklist
                if (i.value is not None and str(i.value).strip() != "")
                and i.key not in AI_ONLY_KEYS
            }
            if REQUIRED_KEYS.issubset(present):
                session_state.first_turn_done = True

            if redis_client:
                redis_client.set(session_key, session_state.model_dump_json(), ex=3600)
            else:
                session_storage_fallback[session_id] = session_state        

    # 1) 첫 턴 여부
    is_first_message = not session_state.first_turn_done

    # 2) 프롬프트/페이로드
    # FIX: 들여쓰기 8칸 → 4칸 (IndentationError 예방)
    # (첫 턴 공감 전용 분기 제거: 항상 체크리스트 JSON 경로 사용)
    #system_prompt = build_checklist_prompt(req.message, session_state)  # FIX 아래로 대체 

    system_prompt = _build_system_prompt_for_compare(
        req.message,
        session_state,
        tier=os.getenv("PROMPT_TIER", "free")
    )

    #======공개 API 재정의 + 호출부 마이그레이션 시 이거 삭제 필요========
    
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
    debug_ck: Dict[str, Any] = {}  # 🔹 기본값 (로그용)

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

            # 1) 먼저 기존 세션 상태를 기반으로 ck 초기화 (이전 누적 값 로딩!)
            ck: Dict[str, Optional[str]] = {
                it.key: (it.value if it.value is not None else None)
                for it in session_state.checklist
            }

            # 2) AI updated_checklist를 기존 값 위에 merge
            for it in ai_response.updated_checklist:
                if isinstance(it, dict):
                    key = it.get("key")
                    val = it.get("value") if "value" in it else None
                else:
                    key = getattr(it, "key", None)
                    val = getattr(it, "value", None)

                if key is None:
                    continue
                
                # (옵션) AI가 value에 "#key:" 라벨을 실수로 넣으면 잘라낸다.
                if isinstance(val, str):
                    raw = val.strip()
                    prefix = f"#{key}:"
                    if raw.startswith(prefix):
                        val = raw[len(prefix):].lstrip()

                # AI가 준 값을 기존 값에 누적 (merge)
                if key in _CANON_KEYS.union(AI_ONLY_KEYS):
                    ck[key] = _merge_values(ck.get(key), val)

            # 3) 이번 턴 사용자 KV (테스트 태그)를 최종적으로 누적
            if kv_user:
                for k, v in kv_user.items():
                    if k in _CANON_KEYS:
                        # 사용자 KV도 덮어쓰기 대신 누적
                        ck[k] = _merge_values(ck.get(k), v)

            # 🔹 3.1 필수 6키에 대해 자연어 추출 결과로 한 번 더 핵심 보정
            #     - 기본: null/빈 문자열이면 natural_kv로 채운다.
            #     - 추가: situation_context / automatic_thought 가 너무 짧은 라벨이면,
            #            자연어 추출 쪽이 더 길고 구체적일 때 자연어 버전으로 교체.
            #
            # CBT 관점:
            # - situation_context  : 사건/상황의 fact, "무슨 일이 벌어졌는가"
            # - automatic_thought  : 그 상황에 대한 내 생각·해석·신념
            core_backfilled = False
            if natural_kv:
                for k in REQUIRED_KEYS:
                    if k not in natural_kv:
                        continue

                    cur = ck.get(k)
                    new = natural_kv[k]

                    text_cur = (str(cur).strip() if cur is not None else "")
                    text_new = (str(new).strip() if new is not None else "")

                    # 새 값 자체가 비어 있으면 아무것도 안 함
                    if not text_new:
                        continue

                    need_override = False

                    # 1) 원래 로직: 비어 있거나 "null"/"None"이면 자연어 추출 값으로 채운다.
                    if text_cur == "" or text_cur.lower() in ("null", "none"):
                        need_override = True

                    # 2) situation_context / automatic_thought 가 너무 짧은 라벨이면 교체
                    if k in ("situation_context", "automatic_thought") and text_cur != "":
                        # 예: "회사 일", "팀 미팅" 같은 10자 미만 라벨은 버리고,
                        # natural_kv 값이 12자 이상이면 더 구체적이라고 보고 교체
                        if len(text_cur) < 10 and len(text_new) >= 12:
                            need_override = True

                    if need_override:
                        ck[k] = text_new
                        core_backfilled = True

                if core_backfilled:
                    logger.debug(
                        "[compare] core keys backfilled/overridden from intake extractor: "
                        f"{ {k: ck.get(k) for k in REQUIRED_KEYS} }"
                    )

                    # 🔍 DEBUG: 최종 병합 결과 확인
                    debug_ck = {k: ck.get(k) for k in sorted({*USER_KEYS, *AI_ONLY_KEYS})}
                    logger.debug(f"[CK_DEBUG] merged ck = {debug_ck}")
    

            # 필수 6개 충족이면 충분 수집으로 간주(요약/브릿지/액션 분기 활성화)
            canon_keys = list(REQUIRED_KEYS)

            def _filled(v):
                return v is not None and str(v).strip() not in ("", "null", "None")

            all_filled = all(_filled(ck.get(k)) for k in canon_keys)

            # 🔹 core_emotion 후보 선택 레이어용 플래그
            # - 상황, 자동적 사고, 강도, 시간, 목표는 다 채워졌는데
            #   core_emotion만 비어 있으면 → 감정 후보 UI로 보내기
            core_emotion_ok = _filled(ck.get("core_emotion"))
            ready_for_emotion_choice = (
                (not core_emotion_ok)
                and all(
                    _filled(ck.get(k))
                    for k in REQUIRED_KEYS
                    if k != "core_emotion"
                )
            )

             # ✅ core_emotion 비어 있고 나머지 필수 키는 다 채워졌으면 → 감정 후보 선택 단계로 바로 리턴
            if ready_for_emotion_choice:
                debug_ck = {k: ck.get(k) for k in sorted({*USER_KEYS, *AI_ONLY_KEYS})}

                # 세션 상태는 그대로 저장 (지금까지 수집된 STRICT6 유지)
                if redis_client:
                    redis_client.set(session_key, session_state.model_dump_json(), ex=3600)
                else:
                    session_storage_fallback[session_id] = session_state

                return JSONResponse(
                    {
                        "response": "지금 느끼는 감정을 한 번 골라볼까요?",
                        "actions": [],
                        "comparison_time": round(time.perf_counter() - started_at, 3),
                        "timestamp": datetime.utcnow().isoformat(),
                        "llama3_response": {
                            "model": ENGINE_A_MODEL,
                            "success": a_success,
                            "response": a_text,
                        },
                        "qwen25_response": {
                            "model": ENGINE_B_MODEL,
                            "success": b_success,
                            "response": b_text,
                        },
                        "faster_model": faster_model,
                        "debug_ck": debug_ck,
                        "needs_emotion_choice": True,
                    },
                    headers={"Cache-Control": "no-store"},
                )
        #=============
            def _parse_intensity_local(val):
                if val is None:
                    return None
                s = str(val).strip().replace("점", "")
                try:
                    n = int(float(s))
                    if 0 <= n <= 10:
                        return n
                    return max(0, min(10, n))
                except:
                    return None

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
                    next_action = {
                        "type": "start_eft",
                        "payload": {"preset": "quick_relief", "intensity": intensity_num, "script_hint": "안전/수용·자책완화"},
                    }
                    bridge_line = "지금은 강도가 높아서, 바로 EFT(감정자유기법)로 짧게 안정화를 시작할게요."
                elif intensity_num is not None:
                    next_action = {
                        "type": "start_breath",
                        "payload": {"style": "box", "duration": "short", "rounds": 3},
                    }
                    bridge_line = "지금은 호흡 안정화(박스 호흡 4-4-4-4)부터 2~3라운드 가볍게 시작할게요."
                else:
                    next_action = {
                        "type": "ask_suds",
                        "payload": {"ui": "banner", "message": "현재 감정 강도(0~10)를 알려주세요."},
                    }
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
                session_state_to_persist = SessionState(
                    checklist=[
                        ChecklistItem(key=k, question="", value=str(ck.get(k) or ""), ask_count=1)
                        for k in persist_keys
                    ],
                    first_turn_done=all_filled
                )
                if redis_client:
                    redis_client.set(session_key, session_state_to_persist.model_dump_json(), ex=3600)
                else:
                    session_storage_fallback[session_id] = session_state_to_persist
                


                # parsed_ok = True  # ✅ NBSP 제거, 레벨 0 또는 상위 블록과 일치하도록

                # if not parsed_ok:
                #     # 일반 경로(질문 지속)
                #     parsed_ok = True
                #     user_facing_response = ai_response.response_for_user
                    
                #     user_facing_response = ai_response.response_for_user

                #     persist_keys = list({*USER_KEYS, *AI_ONLY_KEYS})
                #     session_state_to_persist = SessionState(
                #         checklist=[
                #             ChecklistItem(key=k, question="", value=str(ck.get(k) or ""), ask_count=1)
                #             for k in persist_keys
                #         ],
                #         first_turn_done=True,
                #     )
                    # if redis_client:
                    #     redis_client.set(session_key, session_state_to_persist.model_dump_json(), ex=3600)
                    # else:
                    #     session_storage_fallback[session_id] = session_state_to_persist

                    # is_complete = all(_safe_get_val(item) is not None for item in ai_response.updated_checklist)
                    # if is_complete:
                    #     # 여기서는 intensity가 비었을 때만 묻도록 보정
                    #     if not _filled(ck.get("intensity")):
                    #         user_facing_response = "모든 정보가 수집되었습니다. 현재 느끼시는 감정의 강도를 알려주시겠어요?"
                    #         final_actions = [{"type": "ask_suds",
                    #                         "payload": {"ui": "banner", "message": "대화를 바탕으로, 현재 감정의 강도를 알려주세요."}}]

        except (json.JSONDecodeError, TypeError, KeyError, ValidationError) as e:
            logger.error(f"Failed to parse AI JSON response: {e}\nRaw output: {raw_ai_output}")
            parsed_ok = False


        if not parsed_ok:
            user_facing_response = _fallback_ask_next(session_state)
            session_state.first_turn_done = True
            
            # JSON 파싱 실패 시에도 현재 세션 상태를 Redis에 저장 (누적 보호)
            if redis_client:
                redis_client.set(session_key, session_state.model_dump_json(), ex=3600)
            else:
                session_storage_fallback[session_id] = session_state

    final_result = {
        "response": user_facing_response,
        "actions": final_actions,
        "comparison_time": round(time.perf_counter() - started_at, 3),
        "timestamp": datetime.utcnow().isoformat(),
        "llama3_response": {"model": ENGINE_A_MODEL, "success": a_success, "response": a_text},
        "qwen25_response": {"model": ENGINE_B_MODEL, "success": b_success, "response": b_text},
        "faster_model": faster_model,
        "debug_ck": debug_ck,
        "needs_emotion_choice": bool(locals().get("ready_for_emotion_choice", False)),
    }

    response.headers["Cache-Control"] = "no-store"
    return final_result


