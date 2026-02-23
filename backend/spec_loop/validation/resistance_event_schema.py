# E, PM 결정 2: 저장용 — technique_end_ts, action(duration_sec 30–90, lock_sec=120)
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ResistanceEventAction(BaseModel):
    technique: Optional[str] = None
    duration_sec: Optional[int] = Field(None, ge=30, le=90)
    lock_sec: Optional[int] = Field(None, description="const 120")
    micro_step: Optional[Any] = None


class ResistanceEventStored(BaseModel):
    event_id: int
    ts: datetime
    day_id: int
    task_id: Optional[int] = None
    trigger: Optional[str] = None
    intensity: Optional[int] = Field(None, ge=0, le=10)
    context: Optional[dict[str, Any]] = None
    action: Optional[dict[str, Any]] = None
    technique_end_ts: Optional[datetime] = None
    chosen_technique: Optional[str] = None
    lock_applied: Optional[int] = None
    outcome: Optional[dict[str, Any]] = None

    model_config = {"from_attributes": True}
