from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Dict, Any

from backend.utils.action_contract import StartEFTARv1

router = APIRouter(prefix="/suds", tags=["suds"])


class SUDSRecord(BaseModel):
    value: int


@router.post("/record")
async def record_suds(payload: SUDSRecord) -> Dict[str, Any]:
    start = StartEFTARv1.build(
        script="standard_relief",
        suds=payload.value,
        route="/eftar",
        params={"entry": "compare_flow"},
    )
    return {"ok": True, "actions": [start.model_dump()]}


@router.options("/record")
async def options_record(request: Request) -> Response:
    origin = request.headers.get("origin")
    requested_headers = request.headers.get(
        "access-control-request-headers",
        "Authorization, Content-Type",
    )
    headers = {
        "Allow": "POST, OPTIONS",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": requested_headers,
        "Access-Control-Allow-Credentials": "true",
    }
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
    return Response(status_code=204, headers=headers)
