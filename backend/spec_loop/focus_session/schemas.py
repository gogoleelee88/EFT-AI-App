from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FocusSessionCreateIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    schedule_id: Optional[str] = Field(default=None, max_length=128)
    mission_run_id: Optional[str] = Field(default=None, max_length=64)
    schedule_type: str = Field(default="focus", max_length=32)
    auto_end_existing: bool = True


class FocusSessionOut(BaseModel):
    focus_session_id: str
    user_id: Optional[str] = None
    schedule_id: Optional[str] = None
    mission_run_id: Optional[str] = None
    schedule_type: str
    expected_motion: Optional[str] = None
    state: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    soft_nudge_done: bool
    soft_nudge_count: int
    next_allowed_nudge_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class FocusSessionListOut(BaseModel):
    items: list[FocusSessionOut] = Field(default_factory=list)
