# SPEC E: ResistanceEvent 요청/응답, technique/trigger enum
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

# E: technique enum 5종
class TechniqueEnum(str, Enum):
    EFT_TIMER = "EFT_TIMER"
    HOOPONO_TIMER = "HOOPONO_TIMER"
    BREATH_60 = "BREATH_60"
    BODY_SCAN_60 = "BODY_SCAN_60"
    LABEL_30 = "LABEL_30"


# E: trigger enum 7종
class TriggerEnum(str, Enum):
    START_AVERSION = "START_AVERSION"
    OVERWHELM = "OVERWHELM"
    PERFECTIONISM = "PERFECTIONISM"
    PAIN = "PAIN"
    FATIGUE = "FATIGUE"
    CONFLICT = "CONFLICT"
    UNKNOWN = "UNKNOWN"


LOCK_SEC = 120  # B3, E: const
DURATION_SEC_MIN = 30
DURATION_SEC_MAX = 90


class ResistanceEventRequest(BaseModel):
    """POST /resistance/event 요청."""

    day_id: int
    task_id: Optional[int] = None
    trigger: str  # TriggerEnum 값
    intensity: int = Field(..., ge=0, le=10)
    context: Optional[dict[str, Any]] = None


class CoachAction(BaseModel):
    technique: str
    duration_sec: int = Field(..., ge=30, le=90)
    lock_sec: int = Field(default=120, description="const 120")
    micro_step: Optional[str] = None


class ResistanceEventResponse(BaseModel):
    """POST /resistance/event 응답."""

    event_id: int
    ts: datetime
    action: CoachAction
    lock_applied: int = 120
    adapt_required: bool = False  # 연속 3회 또는 저항 폭주 시 True
