# AdaptRequest, AdaptResult (actions_applied[], updated_plan)
from typing import Any, Optional

from pydantic import BaseModel, Field


class AdaptRequest(BaseModel):
    """POST /adapt/day request."""

    day_id: int
    condition_id: int
    condition_score: Optional[int] = None
    mode: int  # 100 | 70 | 40 (target mode)
    user_id: Optional[str] = None


class AdaptResult(BaseModel):
    """POST /adapt/day response."""

    day_id: int
    actions_applied: list[str] = Field(default_factory=list)
    updated_plan: Optional[dict[str, Any]] = None
    soothe_requested: bool = False
    delay_scheduler_hint: Optional[list[int]] = None
    google_calendar_synced: bool = False
    google_calendar_sync_message: Optional[str] = None
