from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
import httpx, os, asyncio

router = APIRouter(prefix="/api/chat", tags=["compare"])

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
            
            return {
                "llama3_response": {
                    "model": ENGINE_A_MODEL,
                    "response": data_a.get("choices", [{}])[0].get("message", {}).get("content", "") if res_a.status_code == 200 else f"❌ engine_a 연결 실패: {data_a}",
                    "success": res_a.status_code == 200,
                    "raw": data_a,
                },
                "qwen25_response": {
                    "model": ENGINE_B_MODEL,
                    "response": data_b.get("choices", [{}])[0].get("message", {}).get("content", "") if res_b.status_code == 200 else f"❌ engine_b 연결 실패: {data_b}",
                    "success": res_b.status_code == 200,
                    "raw": data_b,
                },
            }
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Engine connection failed: {str(e)}")
