from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field


CycleConfidence = Literal["low", "med", "high"]
IrregularityLevel = Literal["LOW", "MED", "HIGH"]


class CycleStateResponse(BaseModel):
    date: date
    last_period_start_date: Optional[date] = None
    avg_cycle_len_days: Optional[int] = None
    cycle_len_std_days: Optional[int] = None
    irregularity_level: IrregularityLevel = "MED"
    phase_prob: dict[str, float] = Field(default_factory=dict)
    next_period_window: Optional[dict[str, str]] = None
    confidence: CycleConfidence = "low"
    evidence_snapshot: list[str] = Field(default_factory=list)


class PeriodStartRequest(BaseModel):
    period_start_date: date
    user_id: Optional[str] = None


class PeriodStartResponse(BaseModel):
    recorded: bool = True
    cycle_state: CycleStateResponse
