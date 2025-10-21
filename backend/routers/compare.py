from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
import httpx, os, asyncio, logging
from typing import Optional

# P11 휴리스틱 헬퍼를 main.py에서 임포트 (중복 제거)
from backend.main import _maybe_emit_ask_suds

router = APIRouter(prefix="/api/chat", tags=["compare"])
logger = logging.getLogger(__name__)

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

# 환경변수에서 읽되 무엇을 주어도 베이스를 /v1 로 정규화
ENGINE_A_BASE = _normalize_api_base(os.getenv("ENGINE_A_URL", "http://127.0.0.1:8001"))
ENGINE_B_BASE = _normalize_api_base(os.getenv("ENGINE_B_URL", "http://127.0.0.1:8002"))

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
            )

            # 응답 파싱
            data_a = res_a.json() if res_a.status_code == 200 else {"error": f"HTTP {res_a.status_code}"}
            data_b = res_b.json() if res_b.status_code == 200 else {"error": f"HTTP {res_b.status_code}"}

            # 응답 텍스트 추출
            response_a = data_a.get("choices", [{}])[0].get("message", {}).get("content", "") if res_a.status_code == 200 else f"❌ engine_a 연결 실패: {data_a}"
            response_b = data_b.get("choices", [{}])[0].get("message", {}).get("content", "") if res_b.status_code == 200 else f"❌ engine_b 연결 실패: {data_b}"

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

            # P11 휴리스틱: ask_suds 자동 방출
            executed_actions = []
            try:
                ask = _maybe_emit_ask_suds(
                    user_text=req.message,      # 클라이언트가 보낸 원문
                    assistant_text=winner_text   # 비교 결과로 선택된 응답 텍스트
                )
                if ask:
                    executed_actions.append(ask)
                    logger.info("[P11] ✅ ask_suds emitted for message: %s", req.message[:30])
                else:
                    logger.info("[P11] ⚠️ No match - user: %s, ai: %s", req.message[:30], winner_text[:30])
            except Exception:
                logger.exception("[P11] ❌ Error while running heuristic")

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
