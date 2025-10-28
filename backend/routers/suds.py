from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from typing import Any, Dict, Literal, Optional

from backend.utils.action_contract import StartEFTARv1

router = APIRouter(tags=["suds"])


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


class SUDSResponse(BaseModel):
    ok: bool = True
    actions: list[StartEFTARv1] = Field(default_factory=list)
    error: Optional[str] = None


def _build_response(score: int) -> SUDSResponse:
    start = StartEFTARv1.build(
        script="standard_relief",
        suds=score,
        route=DEFAULT_EFTAR_ROUTE,
        params=DEFAULT_EFTAR_PARAMS,
    )
    return SUDSResponse(ok=True, actions=[start])


async def save_suds(request: SUDSRequest) -> SUDSResponse:
    return _build_response(request.score)


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
    return SUDSRequest.model_validate({"type": legacy_type, "score": score})


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
