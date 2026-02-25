# GET /jobs/{job_id} 응답
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class JobStatusResponse(BaseModel):
    job_id: int
    status: str  # pending | completed | failed
    kind: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    created_ts: Optional[datetime] = None

    model_config = {"from_attributes": True}
