# ChatGPT API 서비스 - 미세행동/미션 AI 추천
import json
import os
import logging
from typing import Any, Optional


logger = logging.getLogger(__name__)


# OpenAI 클라이언트 초기화 (지연 로딩)
_openai_client = None


def get_openai_client():
    """OpenAI 클라이언트 반환 (없으면 생성)"""
    global _openai_client
    if _openai_client is None:
        try:
            import openai

            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not set")

            _openai_client = openai.AsyncOpenAI(api_key=api_key)
        except Exception as e:
            print(f"⚠️  OpenAI 클라이언트 초기화 실패: {e}")
            _openai_client = None
    return _openai_client


def _resolve_openai_model_candidates() -> list[str]:
    primary = os.getenv("OPENAI_MODEL", "gpt-5.2pro").strip()
    candidates = [primary] if primary else []
    fallback = os.getenv("OPENAI_FALLBACK_MODELS", "gpt-5.2pro").split(",")
    for model in fallback:
        model = model.strip()
        if model and model not in candidates:
            candidates.append(model)
    return candidates


async def _create_completion(
    *,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> Any:
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OpenAI client not available")

    last_error: Optional[Exception] = None
    for model in _resolve_openai_model_candidates():
        try:
            token_kwargs: dict[str, Any] = {}
            if model.startswith("gpt-5"):
                token_kwargs["max_completion_tokens"] = max_tokens
            else:
                token_kwargs["max_tokens"] = max_tokens
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=temperature,
                **token_kwargs,
            )
            logger.info("OpenAI completion succeeded on model=%s", model)
            return response
        except Exception as err:
            last_error = err
            logger.warning("OpenAI completion failed on model=%s: %s", model, err)

    raise RuntimeError(f"OpenAI completion failed for all models. Last error: {last_error}")


async def recommend_micro_actions(
    task_title: str, task_context: Optional[dict] = None
) -> list[dict]:
    """
    ChatGPT에게 Task 기반 미세행동 3개 추천 요청

    Args:
        task_title: 할 일 제목
        task_context: 추가 컨텍스트 (선택)

    Returns:
        list[dict]: 추천 미세행동 목록
    """
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OpenAI client not available")

    system_prompt = """당신은 행동 심리학 전문가입니다.
사용자가 할 일을 입력하면, 그 일을 시작하기 위한 가장 작은 첫 행동(미세 행동) 3개를 추천하세요.

규칙:
1. 각 행동은 5분 이내에 완료 가능해야 합니다
2. 구체적이고 즉시 실행 가능해야 합니다
3. "시작 행동(start_trigger)"은 몸을 움직이는 물리적 동작이어야 합니다
4. 한국어로 응답하세요

JSON 형식으로 응답:
{
  "recommendations": [
    {
      "name": "행동 이름",
      "description": "한 줄 설명",
      "start_trigger": "가장 첫 물리적 동작",
      "est_minutes": 5
    }
  ]
}"""

    user_message = f"할 일: {task_title}"
    if task_context:
        user_message += f"\n추가 정보: {json.dumps(task_context, ensure_ascii=False)}"

    try:
        response = await _create_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            max_tokens=500,
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("recommendations", [])

    except Exception as e:
        print(f"❌ ChatGPT 미세행동 추천 실패: {e}")
        raise


async def recommend_missions(
    task_title: str,
    micro_action_name: str,
    start_trigger: Optional[str] = None,
    user_places: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """
    ChatGPT에게 미션(사진/장소/시간) 추천 요청

    Args:
        task_title: 할 일 제목
        micro_action_name: 미세 행동 이름
        start_trigger: 시작 행동
        user_places: 사용자 등록 장소 목록

    Returns:
        dict: 미션 추천 결과
    """
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OpenAI client not available")

    system_prompt = """당신은 습관 형성 전문가입니다.
사용자의 할 일과 미세 행동을 기반으로, 실행을 인증할 미션을 추천하세요.

추천할 미션 종류:
1. 사진 인증: 무엇을 찍을지 3가지 옵션 (각각 검증 방법 포함)
2. 장소 인증: 추천 장소 (사용자 기존 장소 활용)
3. 시간 확인: 추천 확인 시간 및 방법

JSON 형식으로 응답:
{
  "photo_options": [
    {
      "label": "표시 이름",
      "description": "상세 설명",
      "verification_description": "검증: OCR(텍스트) + 객체 검출",
      "config": {
        "requirement": "필요한 것들",
        "description": "설명",
        "objects_required": ["object1", "object2"],
        "ocr_keywords": ["keyword1"],
        "verification_method": "검증 방법 설명"
      }
    }
  ],
  "location_suggestion": {
    "recommendation": "추천 이유 한 줄"
  },
  "time_suggestion": {
    "recommended_time": "19:00",
    "check_type": "screen_capture",
    "reason": "추천 이유"
  }
}

모든 텍스트는 한국어로 작성하세요."""

    user_message = f"""할 일: {task_title}
미세 행동: {micro_action_name}
시작 행동: {start_trigger or '없음'}
사용자 등록 장소: {json.dumps(user_places or [], ensure_ascii=False)}"""

    try:
        response = await _create_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            max_tokens=800,
        )

        result = json.loads(response.choices[0].message.content)
        return result

    except Exception as e:
        print(f"❌ ChatGPT 미션 추천 실패: {e}")
        raise


async def suggest_micro_actions(
    plan_items: list[dict],
    mission_type: Optional[str] = None,
    recent_micro_actions: Optional[list[str]] = None,
) -> dict:
    """Suggest micro actions based on plan items and context."""
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OpenAI client not available")

    system_prompt = """작업 시작을 위한 미세업무(스텝)를 제안합니다.
반드시 한국어로만 답변하고, JSON 형식 이외의 텍스트를 절대 추가하지 마세요.
출력 스키마(반드시):
{
  "suggestions": [
    { "title": string, "why": string, "duration_min": number, "trigger": string }
  ]
}
규칙:
- suggestions는 정확히 3개여야 합니다.
- duration_min은 1~15 사이의 정수여야 합니다.
- title은 짧고 실행 가능한 동작형 문장(예: "로그인 화면 열기", "요청 내용 확인하기")으로 작성하세요.
- why는 추천 이유를 한두 문장으로 작성하고, trigger는 실행할 때의 시작 트리거를 작성하세요.
- 민감한 개인정보/기밀정보는 포함하지 마세요."""

    user_message = json.dumps(
        {
            "plan_items": plan_items,
            "mission_type": mission_type,
            "recent_micro_actions": recent_micro_actions or [],
        },
        ensure_ascii=False,
    )

    try:
        response = await _create_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=320,
        )

        return json.loads(response.choices[0].message.content)

    except Exception as e:
        print(f"??ChatGPT micro action suggest failed: {e}")
        raise


async def clarify_task_title(
    title: str,
    mission_type: Optional[str] = None,
    issues: Optional[list[str]] = None,
    recent_tasks: Optional[list[str]] = None,
    recent_micro_actions: Optional[list[str]] = None,
) -> dict:
    """Rewrite an ambiguous task title into 3 concrete options."""
    client = get_openai_client()
    if client is None:
        raise RuntimeError("OpenAI client not available")

    system_prompt = """You rewrite ambiguous task titles into specific, actionable task titles.
Return ONLY JSON with this schema:
{
  "rewrite_suggestions": [
    { "title": string, "reason": string }
  ]
}
Rules:
- rewrite_suggestions length must be 3
- Each title must include action + output + quantity/time
- Titles should be Korean, 20-40 chars recommended
- Do NOT include sensitive or personal details
- No extra text outside JSON
"""

    user_message = json.dumps(
        {
            "title": title,
            "mission_type": mission_type,
            "issues": issues or [],
            "recent_tasks": recent_tasks or [],
            "recent_micro_actions": recent_micro_actions or [],
        },
        ensure_ascii=False,
    )

    try:
        response = await _create_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
            max_tokens=320,
        )

        return json.loads(response.choices[0].message.content)

    except Exception as e:
        print(f"??ChatGPT task clarify failed: {e}")
        raise
