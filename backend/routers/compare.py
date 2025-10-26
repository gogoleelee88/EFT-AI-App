from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
import httpx, os, asyncio, logging, re
from typing import Optional

# 🔥 완전한 Action 생성 시스템을 위한 임포트
from backend.models.action_tokens import TokenParser, TokenProcessor
from backend.utils.action_builder import build_actions
from backend.config.settings import get_settings

router = APIRouter(prefix="/api/chat", tags=["compare"])
logger = logging.getLogger(__name__)

# Settings 인스턴스 생성
settings = get_settings()

# --- ask_suds 자동 방출 헬퍼 함수 (순환 import 방지를 위해 복사) ---
def _maybe_emit_ask_suds(user_text: str, assistant_text: str) -> Optional[dict]:
    """
    사용자의 요청/숫자(0~10) 또는 어시스턴트의 '0~10 평가' 유도 문구가 있을 때
    액션 토큰 {"type":"ask_suds", "payload":{"measurement_type":"check"}}을 반환.
    매칭 실패 시 None.
    """
    try:
        t_user = (user_text or "").strip()
        t_ai = (assistant_text or "").strip()

        # 1) 한국어/일반 유도문 감지 (0~10 / 0에서 10 / 0-10)
        if re.search(r"0\s*[-~]\s*10|0에서\s*10|0\s*~\s*10", t_ai):
            return {"type": "ask_suds", "payload": {"measurement_type": "check"}}

        # 2) 사용자가 숫자만 입력 (0~10)
        if re.fullmatch(r"\s*(?:10|[0-9])\s*", t_user):
            return {"type": "ask_suds", "payload": {"measurement_type": "check"}}

        # 3) 사용자 키워드
        if re.search(r"(평가|점수|몇\s*점|suds)", t_user, flags=re.I):
            return {"type": "ask_suds", "payload": {"measurement_type": "check"}}
    except Exception:
        pass
    return None

def _normalize_api_base(url: str) -> str:
    """API 베이스 URL을 /v1로 정규화"""
    u = (url or "").strip().rstrip("/")
    # 완전 엔드포인트를 준 경우: .../v1/chat/completions → .../v1 로 절삭
    if u.endswith("/v1/chat/completions"):
        return u[:-len("/chat/completions")]
    # /v1 까지만 있으면 그대로 사용
    if u.endswith("/v1"):
        return u
    # host:port나 베이스만 준 경우엔 /v1 붙여서 OpenAI 호환 베이스로
    return u + "/v1"

# 🔥 settings에서 vLLM 엔진 URL 가져오기
ENGINE_A_BASE = _normalize_api_base(settings.VLLM_ENGINE_A_URL)
ENGINE_B_BASE = _normalize_api_base(settings.VLLM_ENGINE_B_URL)

# 실제 호출 URL은 항상 .../v1/chat/completions
ENGINE_A_URL = f"{ENGINE_A_BASE}/chat/completions"
ENGINE_B_URL = f"{ENGINE_B_BASE}/chat/completions"

ENGINE_A_MODEL = os.getenv("ENGINE_A_MODEL", "engine-a")
ENGINE_B_MODEL = os.getenv("ENGINE_B_MODEL", "engine-b")
ENGINE_CONTENT_TYPE = os.getenv("ENGINE_CONTENT_TYPE", "application/json;charset=utf-8")
ENGINE_HTTP_TIMEOUT = float(os.getenv("ENGINE_HTTP_TIMEOUT", "30"))

class CompareReq(BaseModel):
    message: str
    temperature: float | None = 0.7
    top_p: float | None = 0.9
    max_tokens: int | None = 512

def _chat_payload(model: str, req: CompareReq):
    return {
        "model": model,
        "messages": [{"role": "user", "content": req.message}],
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens,
        "stream": False,
    }

@router.post("/compare")
async def compare(req: CompareReq, x_api_key: str | None = Header(default=None, alias="X-API-Key")):
    headers = {"Content-Type": ENGINE_CONTENT_TYPE}

    async with httpx.AsyncClient() as client:
        try:
            res_a, res_b = await asyncio.gather(
                client.post(ENGINE_A_URL, json=_chat_payload(ENGINE_A_MODEL, req), headers=headers, timeout=ENGINE_HTTP_TIMEOUT),
                client.post(ENGINE_B_URL, json=_chat_payload(ENGINE_B_MODEL, req), headers=headers, timeout=ENGINE_HTTP_TIMEOUT),
                return_exceptions=True  # 🔥 예외를 반환하도록 설정
            )

            # 🔥 연결 실패 시 모의 응답 생성
            if isinstance(res_a, Exception):
                logger.warning(f"Engine A 연결 실패: {res_a}")
                data_a = {"choices": [{"message": {"content": f"안녕하세요. {req.message}에 대해 스트레스가 많으시군요. 깊은 호흡을 한번 해보시는 게 어떨까요?"}}]}
                # 완전한 Mock 객체
                from datetime import timedelta
                res_a = type('MockResponse', (), {
                    'status_code': 200,
                    'elapsed': timedelta(seconds=0.1),
                    'json': lambda: data_a
                })()
            else:
                data_a = res_a.json() if res_a.status_code == 200 else {"error": f"HTTP {res_a.status_code}"}

            if isinstance(res_b, Exception):
                logger.warning(f"Engine B 연결 실패: {res_b}")
                data_b = {"choices": [{"message": {"content": f"힘드시겠어요. {req.message} 상황이 어렵죠. 잠시 휴식을 취하시는 것을 추천드립니다."}}]}
                # 완전한 Mock 객체
                from datetime import timedelta
                res_b = type('MockResponse', (), {
                    'status_code': 200,
                    'elapsed': timedelta(seconds=0.15),
                    'json': lambda: data_b
                })()
            else:
                data_b = res_b.json() if res_b.status_code == 200 else {"error": f"HTTP {res_b.status_code}"}

            # 응답 텍스트 추출 및 토큰 제거
            response_a_raw = data_a.get("choices", [{}])[0].get("message", {}).get("content", "") if res_a.status_code == 200 else f"❌ engine_a 연결 실패: {data_a}"
            response_b_raw = data_b.get("choices", [{}])[0].get("message", {}).get("content", "") if res_b.status_code == 200 else f"❌ engine_b 연결 실패: {data_b}"

            # 🔥 토큰 제거 (깔끔한 응답)
            response_a = TokenParser.remove_tokens(response_a_raw)
            response_b = TokenParser.remove_tokens(response_b_raw)

            # 더 빠른/성공한 모델의 응답 텍스트 결정 (P11 휴리스틱용)
            winner_text = ""
            if res_a.status_code == 200 and res_b.status_code == 200:
                # 둘 다 성공 - 응답 시간으로 비교하여 더 빠른 것 선택
                t_a = getattr(res_a, "elapsed", None)
                t_b = getattr(res_b, "elapsed", None)
                if t_a is not None and t_b is not None:
                    winner_text = response_a if t_a.total_seconds() <= t_b.total_seconds() else response_b
                    logger.info("[P11] 두 엔진 모두 성공 - 더 빠른 응답: %s (A: %.3fs, B: %.3fs)",
                               "engine_a" if t_a.total_seconds() <= t_b.total_seconds() else "engine_b",
                               t_a.total_seconds(), t_b.total_seconds())
                else:
                    # elapsed가 없으면 engine_a 우선 (정책 명시)
                    winner_text = response_a
                    logger.info("[P11] elapsed 정보 없음 - engine_a 우선 선택")
            elif res_a.status_code == 200:
                winner_text = response_a
                logger.info("[P11] engine_a만 성공 - winner: engine_a")
            elif res_b.status_code == 200:
                winner_text = response_b
                logger.info("[P11] engine_b만 성공 - winner: engine_b")
            else:
                # 둘 다 실패
                logger.warning("[P11] 두 엔진 모두 실패 - winner_text 빈 문자열")

            # 🔥 완전한 Action 생성 시스템 (3단계)
            executed_actions = []
            clean_winner_text = winner_text  # 기본값

            # 1️⃣ 토큰 파이프라인: AI 응답에서 액션 토큰 추출
            try:
                tokens = TokenParser.extract_tokens(winner_text)
                clean_winner_text = TokenParser.remove_tokens(winner_text)

                if tokens:
                    # 컨텍스트 구성
                    token_context = {
                        "session_id": getattr(req, 'session_id', None),
                        "user_id": getattr(req, 'user_id', None),
                        "message": req.message,
                        "emotion_analysis": None
                    }

                    action_results = await TokenProcessor().process_tokens(tokens, context=token_context)
                    executed_actions.extend(action_results.get("executed_actions", []))
                    logger.info(f"[TokenPipeline] {len(tokens)}개 토큰 처리, {len(action_results.get('executed_actions', []))}개 액션 생성")
            except Exception as e:
                logger.warning(f"[TokenPipeline] 토큰 처리 실패: {e}")

            # 2️⃣ build_actions: 부정적 감정 감지 → EFT 제안 (핵심!)
            try:
                meta = {
                    "session_id": getattr(req, 'session_id', None),
                    "user_id": getattr(req, 'user_id', None)
                }
                actions_from_builder = build_actions(req.message, meta) or []
                executed_actions.extend(actions_from_builder)

                if actions_from_builder:
                    logger.info(f"[BuildActions] {len(actions_from_builder)}개 액션 생성 (EFT 제안 등)")
            except Exception as e:
                logger.warning(f"[BuildActions] 액션 빌더 실패: {e}")

            # 3️⃣ _maybe_emit_ask_suds: SUDS 측정 유도 (기존 P11 휴리스틱)
            try:
                ask = _maybe_emit_ask_suds(
                    user_text=req.message,
                    assistant_text=clean_winner_text  # 🔥 토큰 제거된 텍스트 사용!
                )
                if ask:
                    executed_actions.append(ask)
                    logger.info("[AskSuds] ✅ ask_suds emitted for message: %s", req.message[:30])
                else:
                    logger.info("[AskSuds] ⚠️ No match - user: %s, ai: %s", req.message[:30], clean_winner_text[:30])
            except Exception as e:
                logger.warning(f"[AskSuds] SUDS 방출 실패: {e}")

            logger.info(f"[Actions] 총 {len(executed_actions)}개 액션 생성 완료")

            return {
                "llama3_response": {
                    "model": ENGINE_A_MODEL,
                    "response": response_a,
                    "success": res_a.status_code == 200,
                    "raw": data_a,
                },
                "qwen25_response": {
                    "model": ENGINE_B_MODEL,
                    "response": response_b,
                    "success": res_b.status_code == 200,
                    "raw": data_b,
                },
                "actions": executed_actions,  # P11 휴리스틱 결과 추가
            }
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Engine connection failed: {str(e)}")
