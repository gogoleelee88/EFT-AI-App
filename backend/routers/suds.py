from datetime import datetime, timezone
from uuid import uuid4
import logging
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, Literal, Optional, Tuple

from backend.utils.action_contract import StartEFTARv1
from backend.models.suds import SUDSEntry
from backend.services.suds_logger import append_suds

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
    session_id: Optional[str] = Field(
        default=None, description="Optional session identifier associated with the score"
    )
    user_id: Optional[str] = Field(
        default=None, description="Optional user identifier associated with the score"
    )


class SUDSResponse(BaseModel):
    ok: bool = True
    actions: list[StartEFTARv1] = Field(default_factory=list)
    error: Optional[str] = None
    trace_id: Optional[str] = None
    saved_at: Optional[str] = None


def _build_response(score: int, *, trace_id: Optional[str], saved_at: Optional[str]) -> SUDSResponse:
    start = StartEFTARv1.build(
        script="standard_relief",
        suds=score,
        route=DEFAULT_EFTAR_ROUTE,
        params=DEFAULT_EFTAR_PARAMS,
    )
    return SUDSResponse(ok=True, actions=[start], trace_id=trace_id, saved_at=saved_at)


def _persist_suds(request: SUDSRequest) -> Tuple[str, str]:
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
    except Exception:
        logger.exception("Failed to persist SUDS entry", extra={"trace_id": trace_id})
        raise HTTPException(status_code=500, detail="Failed to persist SUDS entry") from None
    return trace_id, saved_at


async def save_suds(request: SUDSRequest) -> SUDSResponse:
    trace_id, saved_at = _persist_suds(request)
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

    try:
        score = int(raw_score)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid score") from None

    legacy_type = payload.get("type") or ("manual" if payload.get("source") else "manual")
    normalized_payload: Dict[str, Any] = {
        "type": legacy_type,
        "score": score,
    }
    for legacy_key, target_key in (("session_id", "session_id"), ("sessionId", "session_id"), ("user_id", "user_id"), ("userId", "user_id")):
        value = payload.get(legacy_key)
        if value is not None and target_key not in normalized_payload:
            normalized_payload[target_key] = value
    return SUDSRequest.model_validate(normalized_payload)


@router.post("/api/suds/record", response_model=SUDSResponse)
async def record_suds_legacy(
    payload: Dict[str, Any], request: Request, response: Response
) -> SUDSResponse:
    normalized = _normalize_legacy_payload(payload)

    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))
    return await save_suds(normalized)


@router.get("/api/suds/record", response_model=SUDSResponse)
async def record_suds_get(value: int, request: Request, response: Response) -> SUDSResponse:
    """Fallback GET handler for environments where POST is blocked upstream."""
    request_payload = SUDSRequest(type="manual", score=value)
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))
    return await save_suds(request_payload)


@router.options("/api/suds/record")
async def options_record(request: Request) -> Response:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    return Response(status_code=200, content="OK", headers=_cors_headers(origin, requested_headers))
