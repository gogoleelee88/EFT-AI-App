# F3: 저장/응답용 Condition — condition_id, ts 서버 생성 (요청에는 condition_id 없음)
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConditionStored(BaseModel):
    """DB 저장·응답용. 요청(CheckinRequest)에는 condition_id 없음."""

    condition_id: int
    ts: datetime
    source_level: Optional[int] = None
    min_condition_set: Optional[dict[str, Any]] = None
    wearable: Optional[dict[str, Any]] = None
    behavior_inference: Optional[dict[str, Any]] = None
    condition_score: Optional[int] = None
    inferred_flags: Optional[dict[str, Any]] = None
    condition_domain: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None
    data_quality: Optional[str] = None
    confidence: Optional[str] = None

    model_config = {"from_attributes": True}
