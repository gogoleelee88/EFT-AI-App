import httpx

from datetime import datetime, timezone
from uuid import uuid4
import logging
from fastapi import APIRouter, Cookie, HTTPException, Request, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, Literal, Optional, Tuple

from utils.action_contract import StartEFTARv1
from backend.models.suds import SUDSEntry
from services.suds_logger import append_suds
from services.auth_service import AuthService
from services.supabase_client import _get_supabase

router = APIRouter(tags=["suds"])

logger = logging.getLogger(__name__)
_auth_service = AuthService()


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
    session_type: Optional[Literal["eftar", "meditation"]] = Field(
        default=None,
        description="Type of session this score belongs to",
    )

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
        # 7???´ì: EFT ?°ì ì¶ì²
        return SUDSResponse(ok=True, actions=[eft_action.model_dump(), breath_action.model_dump()], trace_id=trace_id, saved_at=saved_at)
    else:  # 6???´í
        # 6???´í: ?¸í¡ë²??°ì ì¶ì²
        return SUDSResponse(ok=True, actions=[breath_action.model_dump(), eft_action.model_dump()], trace_id=trace_id, saved_at=saved_at)
def _safe_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    return value or None


def _decode_user_id_from_cookie(access_token: Optional[str]) -> Optional[str]:
    if not access_token:
        return None
    try:
        payload = _auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        return user_id if isinstance(user_id, str) and user_id.strip() else None
    except Exception:
        return None


def _lookup_sud_session_context(sb, session_id: str) -> Dict[str, Any]:
    if not session_id:
        return {}
    try:
        rows = (
            sb.table("emotion_checkins")
            .select("user_id,session_type")
            .eq("session_id", session_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        data = getattr(rows, "data", None) or []
        if data:
            return data[0]
    except Exception:
        logger.exception("Failed to lookup emotion_checkins for session_id=%s", session_id)
    return {}

async def _create_notion_emotion_page(notion_base_url: str, body: Dict[str, Any]) -> None:
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{notion_base_url}/api/notion/create-emotion-page", json=body)
        r.raise_for_status()
        return r.json()   # (None ë°©ì?)



def _persist_suds(request: SUDSRequest, access_token: Optional[str] = None) -> tuple[str, str]:
    trace_id = uuid4().hex
    saved_at = datetime.now(timezone.utc).isoformat()

    sb = _get_supabase()
    checkin_context = _lookup_sud_session_context(sb, request.session_id)
    resolved_user_id = (
        _safe_str(_decode_user_id_from_cookie(access_token))
        or _safe_str(request.user_id)
        or _safe_str(checkin_context.get("user_id"))
    )
    resolved_session_type = _safe_str(request.session_type) or _safe_str(checkin_context.get("session_type"))

    entry = SUDSEntry(
        trace_id=trace_id,
        type=request.type,  # type: ignore[arg-type]
        score=request.score,
        session_id=request.session_id,
        user_id=resolved_user_id,
        saved_at=saved_at,
        timestamp=saved_at,
    )

    try:
        append_suds(entry)

        base_payload = {
            "session_id": request.session_id,
            "score": request.score,
            "trace_id": trace_id,
            "created_at": saved_at,
        }
        if resolved_user_id:
            base_payload["user_id"] = resolved_user_id
        if resolved_session_type is not None:
            base_payload["session_type"] = resolved_session_type
        if request.note is not None:
            base_payload["note"] = request.note

        payload_variants = [base_payload]
        for optional_key in ("session_type", "user_id", "note", "trace_id", "created_at"):
            current = payload_variants[-1]
            if optional_key in current:
                payload_variants.append({k: v for k, v in current.items() if k != optional_key})
        payload_variants.append({"session_id": request.session_id, "score": request.score})
        payload_variants.append({"score": request.score})

        res = None
        used_payload: Dict[str, Any] = {}
        used_attempt: Optional[int] = None
        seen = set()
        last_error: Optional[Exception] = None
        total_attempts = len(payload_variants)

        logger.info(
            "Preparing suds_records insert attempt set",
            extra={
                "trace_id": trace_id,
                "session_id": request.session_id,
                "attempt_count": total_attempts,
            },
        )

        def _describe_error(err: Exception) -> Dict[str, Any]:
            return {
                "type": type(err).__name__,
                "message": str(err),
                "status_code": getattr(err, "status_code", None),
                "code": getattr(err, "code", None),
                "details": getattr(err, "details", None),
            }

        for attempt, payload in enumerate(payload_variants, start=1):
            fingerprint = tuple(sorted(payload.items()))
            if fingerprint in seen:
                logger.debug(
                    "Skipping duplicate suds_records insert variant",
                    extra={
                        "trace_id": trace_id,
                        "session_id": request.session_id,
                        "attempt": attempt,
                        "payload_keys": sorted(payload.keys()),
                    },
                )
                continue
            seen.add(fingerprint)
            try:
                logger.info(
                    "Trying suds_records insert variant",
                    extra={
                        "trace_id": trace_id,
                        "session_id": request.session_id,
                        "attempt": attempt,
                        "payload_keys": sorted(payload.keys()),
                    },
                )
                res = sb.table("suds_records").insert(payload).execute()
                used_payload = payload
                used_attempt = attempt
                break
            except Exception as e:
                last_error = e
                error_info = _describe_error(e)
                logger.warning(
                    "Failed suds_records insert variant",
                    extra={
                        "trace_id": trace_id,
                        "session_id": request.session_id,
                        "attempt": attempt,
                        "attempt_count": total_attempts,
                        "payload_keys": sorted(payload.keys()),
                        "payload": payload,
                        "error": error_info,
                    },
                )
                continue

        if res is None:
            if last_error:
                logger.error(
                    "All suds_records insert variants failed",
                    extra={
                        "trace_id": trace_id,
                        "session_id": request.session_id,
                        "attempt_count": total_attempts,
                        "last_attempt": used_attempt if used_attempt is not None else total_attempts,
                        "last_error": _describe_error(last_error),
                    },
                )
                raise last_error
            raise RuntimeError("Failed to persist SUDS entry")
        if getattr(res, "error", None):
            raise RuntimeError(f"Supabase insert failed: {res.error}")

        logger.info("??Supabase suds_records inserted", extra={"trace_id": trace_id, "payload": used_payload})

    except Exception:
        logger.exception("Failed to persist SUDS entry", extra={"trace_id": trace_id})
        raise HTTPException(status_code=500, detail="Failed to persist SUDS entry") from None

    return trace_id, saved_at



async def save_suds(request: SUDSRequest, access_token: Optional[str] = None) -> SUDSResponse:
    trace_id, saved_at = _persist_suds(request, access_token=access_token)

    # ???¬ì(STRICT7) ì¡°í ??Notion ?¤í(STRICT6)ë¡?ë³????Notion ?ì´ì§ ?ì±
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
        session_type = request.session_type or checkin.get("session_type")
        delta = intensity_before - intensity_after  # Notion ?ë¬ë?ë¨?£ ?¨ê¾©ê¶??

        # user_email? Notion ?ì²?ì ?ì
        user_email = (checkin.get("user_id") or request.user_id or "")
        if "@" not in user_email:
            user_email = "unknown@example.com"  # ???ì(?ì¤?¸ì©). ?ì¤???ë¡?¸ì???´ë©??ë³´ë´ë©??¬ê¸° ?ê±° ê°??

        notion_body = {
            "user_email": user_email,
            "session_type": session_type,
            "strict_intake": {
                "core_emotion": checkin["core_emotion"],
                "situation_context": checkin["situation_context"],
                "automatic_thought": checkin["automatic_thought"],
                "physical_sensation": checkin.get("physical_sensation"),
                # Notion ëª¨ë¸??ë°ë STRICT6 ?ë?¸ë° ì§ê¸?DB???ì¼ë©?None?¼ë¡
                "behavioral_reaction": None,
                "intensity": intensity_before,
                "available_time": None,
                "immediate_goal": checkin.get("immediate_goal"),
            },
            "intensity_after": intensity_after,
            "solution": "EFT ?? + ë°ì¤ ?¸í¡",
        }

        notion_result = await _create_notion_emotion_page("http://127.0.0.1:8000", notion_body)
        logger.info("??Notion page created", extra={"trace_id": trace_id, "delta": delta})
        return _build_response(request.score, trace_id=trace_id, saved_at=saved_at)

    # except Exception as e:
    #     logger.exception("?ï¸ Notion create failed", extra={"trace_id": trace_id})
    #     raise HTTPException(status_code=500, detail=f"Notion create failed: {e}")
    except Exception as e:
        logger.exception("?ï¸ Notion create failed", extra={"trace_id": trace_id})
        # raise ?ì? ?ì (SUDS ??¥ì? ?±ê³µ ì²ë¦¬)
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
async def record_suds(
    payload: SUDSRequest,
    request: Request,
    response: Response,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> SUDSResponse:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))
    return await save_suds(payload, access_token=access_token)

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
    session_type = payload.get("session_type")
    if session_type in ("eftar", "meditation"):
        normalized_payload["session_type"] = session_type
    for legacy_key, target_key in (("session_id", "session_id"), ("sessionId", "session_id"), ("user_id", "user_id"), ("userId", "user_id")):
        value = payload.get(legacy_key)
        if value is not None and target_key not in normalized_payload:
            normalized_payload[target_key] = value
    return SUDSRequest.model_validate(normalized_payload)

async def record_suds_legacy(
    payload: Dict[str, Any],
    request: Request,
    response: Response,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> SUDSResponse:
    normalized = _normalize_legacy_payload(payload)

    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))
    return await save_suds(normalized, access_token=access_token)


@router.post("/api/suds/record", response_model=SUDSResponse)
async def record_suds_legacy(
    payload: Dict[str, Any],
    request: Request,
    response: Response,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> SUDSResponse:
    normalized = _normalize_legacy_payload(payload)

    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    response.headers.update(_cors_headers(origin, requested_headers))

    return await save_suds(normalized, access_token=access_token)

@router.get("/api/suds/record", response_model=SUDSResponse)
async def record_suds_get(value: int) -> SUDSResponse:
    raise HTTPException(status_code=405, detail="GET not supported. Use POST with session_id.")

@router.options("/api/suds/record")
async def options_record(request: Request) -> Response:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    return Response(status_code=200, content="OK", headers=_cors_headers(origin, requested_headers))

