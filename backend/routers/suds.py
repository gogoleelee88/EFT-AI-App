from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any

from backend.utils.action_contract import StartEFTARv1

router = APIRouter(prefix="/api/suds", tags=["suds"])


class SUDSRecord(BaseModel):
    score: int
    source: Optional[str] = "compare"
    emotion: Optional[str] = None


@router.post("/record")
async def record_suds(payload: SUDSRecord) -> Dict[str, Any]:
    start = StartEFTARv1.build(
        script="standard_relief",
        suds=payload.score,
        route="/eftar",
        params={"entry": "compare_flow"},
    )
    return {"ok": True, "actions": [start.dict()]}
