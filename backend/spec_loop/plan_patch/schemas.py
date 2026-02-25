from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


PatchType = Literal["BUFFER_BLOCK", "SPLIT_DEEP_WORK", "DECISION_DELAY"]


class DriverLite(BaseModel):
    driver: str
    score: int = Field(..., ge=0, le=100)
    confidence: Literal["low", "med", "high"]


class PatchSuggestion(BaseModel):
    patch_type: PatchType
    reason: str
    allowed: bool = True
    blocked_reason: Optional[str] = None
    preview: dict[str, Any] = Field(default_factory=dict)


class PlanPatchSuggestResponse(BaseModel):
    date: date
    confidence: Literal["low", "med", "high"] = "low"
    evidence_snapshot: list[str] = Field(default_factory=list)
    drivers: list[dict[str, Any]] = Field(default_factory=list)
    drivers_top2: list[DriverLite] = Field(default_factory=list)
    data_quality: Optional[str] = None
    suggestions: list[PatchSuggestion] = Field(default_factory=list)


class PlanPatchApplyRequest(BaseModel):
    date: date
    patch_type: PatchType
    day_id: Optional[int] = None
    user_id: Optional[str] = None
    event_id: Optional[str] = None


class PlanPatchApplyResponse(BaseModel):
    applied: bool
    patch_type: PatchType
    message: str
    blocked_reason: Optional[str] = None
    updated_plan: Optional[dict[str, Any]] = None
    calendar_synced: bool = False
    calendar_message: Optional[str] = None
