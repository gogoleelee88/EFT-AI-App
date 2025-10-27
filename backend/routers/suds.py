from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Any, Dict, Optional

from backend.utils.action_contract import StartEFTARv1

router = APIRouter(tags=["suds"])


class SUDSRecord(BaseModel):
    value: int


def _build_response(value: int) -> Dict[str, Any]:
    start = StartEFTARv1.build(
        script="standard_relief",
        suds=value,
        route="/eftar",
        params={"entry": "compare_flow"},
    )
    return {"ok": True, "actions": [start.model_dump()]}


def _cors_headers(origin: Optional[str], requested_headers: Optional[str]) -> Dict[str, str]:
    headers = {
        "Allow": "POST, GET, OPTIONS",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": requested_headers or "Authorization, Content-Type",
        "Access-Control-Allow-Credentials": "true",
    }
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
    return headers


@router.post("/api/suds/record")
async def record_suds(payload: SUDSRecord) -> Dict[str, Any]:
    return _build_response(payload.value)


@router.get("/api/suds/record")
async def record_suds_get(value: int) -> Dict[str, Any]:
    """Fallback GET handler for environments where POST is blocked upstream."""
    return _build_response(value)


@router.options("/api/suds/record")
async def options_record(request: Request) -> Response:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get("access-control-request-headers")
    return Response(status_code=204, headers=_cors_headers(origin, requested_headers))
