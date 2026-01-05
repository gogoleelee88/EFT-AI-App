import httpx

from datetime import datetime, timezone
from uuid import uuid4
import logging
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, Literal, Optional, Tuple

from backend.utils.action_contract import StartEFTARv1
from backend.models.suds import SUDSEntry
from backend.services.suds_logger import append_suds
import os
from supabase import create_client

router = APIRouter(tags=["suds"])

logger = logging.getLogger(__name__)


DEFAULT_EFTAR_ROUTE = "/eftar"
DEFAULT_EFTAR_PARAMS: Dict[str, Any] = {"entry": "compare_flow"}
ALLOWED_METHODS = "GET, POST, OPTIONS"
DEFAULT_ALLOWED_HEADERS = (
    "Accept, Accept-Language, Authorization, Content-Language, Content-Type, X-API-Key"
)
DEFAULT_MAX_AGE = "600"


class SUDSRequest(BaseModel):
    type: Literal["manual", "auto", "system"] = Field(
        description="Origin of the SUDS score submission"
    )
    score: int = Field(description="SUDS score (expected 0-10 scale)", ge=0, le=10)
    session_id: str = Field(description="Session identifier associated with the score")

    user_id: Optional[str] = Field(
        default=None, description="Optional user identifier associated with the score"
    )
    note: Optional[str] = Field(default=None, description="Optional note for SUDS record")


class SUDSResponse(BaseModel):
    ok: bool = True
    actions: list[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    trace_id: Optional[str] = None
    saved_at: Optional[str] = None


class StartBreathV1(BaseModel):
    type: str = "start_breath_page"
    payload: Dict[str, Any]

    @classmethod
    def build(cls, *, suds: int, route: str = "/tri-modal", params: Optional[Dict[str, Any]] = None) -> "StartBreathV1":
        payload = {
            "action": "start_breath_page",
            "route": route,
            "suds": suds,
            "rationale": "breathing_for_moderate_suds"
        }
        if params:
            payload.update(params)
        return cls(type="start_breath_page", payload=payload)


def _build_response(score: int, *, trace_id: Optional[str], saved_at: Optional[str]) -> SUDSResponse:
    eft_action = StartEFTARv1.build(
        script="standard_relief",
        suds=score,
        route=DEFAULT_EFTAR_ROUTE,
        params=DEFAULT_EFTAR_PARAMS,
    )
    
    breath_action = StartBreathV1.build(
        suds=score
    )

    if score >= 7:
        # 7점 이상: EFT 우선 추천
        return SUDSResponse(ok=True, actions=[eft_action.model_dump(), breath_action.model_dump()], trace_id=trace_id, saved_at=saved_at)
    else:  # 6점 이하
        # 6점 이하: 호흡법 우선 추천
        return SUDSResponse(ok=True, actions=[breath_action.model_dump(), eft_action.model_dump()], trace_id=trace_id, saved_at=saved_at)

def _get_supabase():
    """Supabase 클라이언트 생성"""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # 권장 (RLS 영향 최소)
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)

async def _create_notion_emotion_page(notion_base_url: str, body: Dict[str, Any]) -> None:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{notion_base_url}/api/notion/create-emotion-page", json=body)
        r.raise_for_status()
        return r.json()   # (None 방지)



def _persist_suds(request: SUDSRequest) -> tuple[str, str]:
    trace_id = uuid4().hex
    saved_at = datetime.now(timezone.utc).isoformat()

    entry = SUDSEntry(
        trace_id=trace_id,
        type=request.type,  # type: ignore[arg-type]
        score=request.score,
        session_id=request.session_id,
        user_id=request.user_id,
        saved_at=saved_at,
        timestamp=saved_at,
    )

    try:
        append_suds(entry)

        sb = _get_supabase()
        payload = {
            "session_id": request.session_id,
            "score": request.score,
            "user_id": request.user_id
        }
        if request.note is not None:
            payload["note"] = request.note

        res = sb.table("suds_records").insert(payload).execute()
        if getattr(res, "error", None):
            raise RuntimeError(f"Supabase insert failed: {res.error}")

        logger.info("✅ Supabase suds_records inserted", extra={"trace_id": trace_id})

    except Exception:
        logger.exception("Failed to persist SUDS entry", extra={"trace_id": trace_id})
        raise HTTPException(status_code=500, detail="Failed to persist SUDS entry") from None

    return trace_id, saved_at



async def save_suds(request: SUDSRequest) -> SUDSResponse:
    trace_id, saved_at = _persist_suds(request)

    # ✅ 사전(STRICT7) 조회 → Notion 스펙(STRICT6)로 변환 → Notion 페이지 생성
    try:
        sb = _get_supabase()
        checkin_res = (
            sb.table("emotion_checkins")
              .select("*")
              .eq("session_id", request.session_id)
              .order("created_at", desc=True)
              .limit(1)
              .execute()
        )
        rows = getattr(checkin_res, "data", None) or []
        if not rows:
            raise RuntimeError(f"emotion_checkins not found for session_id={request.session_id}")

        checkin = rows[0]
        intensity_before = int(checkin["intensity_before"])
        intensity_after = int(request.score)
        delta = intensity_before - intensity_after  # Notion 응답에도 계산됨

        # user_email은 Notion 요청에서 필수
        user_email = (checkin.get("user_id") or request.user_id or "")
        if "@" not in user_email:
            user_email = "unknown@example.com"  # ✅ 임시(테스트용). 나중에 프론트에서 이메일 보내면 여기 제거 가능.

        notion_body = {
            "user_email": user_email,
            "strict_intake": {
                "core_emotion": checkin["core_emotion"],
                "situation_context": checkin["situation_context"],
                "automatic_thought": checkin["automatic_thought"],
                "physical_sensation": checkin.get("physical_sensation"),
                # Notion 모델이 받는 STRICT6 필드인데 지금 DB에 없으면 None으로
                "behavioral_reaction": None,
                "intensity": intensity_before,
                "available_time": None,
                "immediate_goal": checkin.get("immediate_goal"),
            },
            "intensity_after": intensity_after,
            "solution": "EFT 탭핑 + 박스 호흡",
        }

        notion_result = await _create_notion_emotion_page("http://127.0.0.1:8000", notion_body)
        logger.info("✅ Notion page created", extra={"trace_id": trace_id, "delta": delta})
        return _build_response(request.score, trace_id=trace_id, saved_at=saved_at)

    # except Exception as e:
    #     logger.exception("⚠️ Notion create failed", extra={"trace_id": trace_id})
    #     raise HTTPException(status_code=500, detail=f"Notion create failed: {e}")
    except Exception as e:
        logger.exception("⚠️ Notion create failed", extra={"trace_id": trace_id})
        # raise 하지 않음 (SUDS 저장은 성공 처리)
        return _build_response(request.score, trace_id=trace_id, saved_at=saved_at)

def _cors_headers(origin: Optional[str], requested_headers: Optional[str]) -> Dict[str, str]:
    headers = {
        "Allow": ALLOWED_METHODS,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": requested_headers or DEFAULT_ALLOWED_HEADERS,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": DEFAULT_MAX_AGE,
    }
    headers["Access-Control-Allow-Origin"] = origin or "*"
    headers["Vary"] = "Origin"
    return headers


@router.options("/suds")
async def options_suds(request: Request) -> Response:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    return Response(status_code=200, content="OK", headers=_cors_headers(origin, requested_headers))

@router.post("/suds", response_model=SUDSResponse)
async def record_suds(payload: SUDSRequest, request: Request, response: Response) -> SUDSResponse:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))
    return await save_suds(payload)

def _normalize_legacy_payload(payload: Dict[str, Any]) -> SUDSRequest:
    raw_score = payload.get("score", payload.get("value"))
    if raw_score is None:
        raise HTTPException(status_code=422, detail="score is required")
    
    session_id = payload.get("session_id") or payload.get("sessionId")
    if not session_id:
        raise HTTPException(status_code=422, detail="session_id is required")


    try:
        score = int(raw_score)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid score") from None

    legacy_type = payload.get("type") or ("manual" if payload.get("source") else "manual")
    normalized_payload: Dict[str, Any] = {
        "type": legacy_type,
        "score": score,
        "session_id": session_id,
    }
    for legacy_key, target_key in (("session_id", "session_id"), ("sessionId", "session_id"), ("user_id", "user_id"), ("userId", "user_id")):
        value = payload.get(legacy_key)
        if value is not None and target_key not in normalized_payload:
            normalized_payload[target_key] = value
    return SUDSRequest.model_validate(normalized_payload)

async def record_suds_legacy(
    payload: Dict[str, Any], request: Request, response: Response
) -> SUDSResponse:
    normalized = _normalize_legacy_payload(payload)

    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))
    return await save_suds(normalized)


@router.post("/api/suds/record", response_model=SUDSResponse)
async def record_suds_legacy(payload: Dict[str, Any], request: Request, response: Response) -> SUDSResponse:
    normalized = _normalize_legacy_payload(payload)

    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))

    return await save_suds(normalized)

@router.get("/api/suds/record", response_model=SUDSResponse)
async def record_suds_get(value: int) -> SUDSResponse:
    raise HTTPException(status_code=405, detail="GET not supported. Use POST with session_id.")

@router.options("/api/suds/record")
async def options_record(request: Request) -> Response:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    return Response(status_code=200, content="OK", headers=_cors_headers(origin, requested_headers))
