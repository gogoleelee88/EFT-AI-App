from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


class ExecutionLogEventType(str, Enum):
    TASK_START = "TASK_START"
    TASK_STOP = "TASK_STOP"
    TASK_RESUME = "TASK_RESUME"
    TASK_COMPLETE = "TASK_COMPLETE"
    PLAN_COMMIT = "PLAN_COMMIT"
    ADAPT_APPLIED = "ADAPT_APPLIED"
    MODE_CHANGE = "MODE_CHANGE"
    LOCK_APPLIED = "LOCK_APPLIED"
    LOCK_EXPIRED = "LOCK_EXPIRED"
    PLAN_DELETE = "PLAN_DELETE"
    PLAN_RESTORE = "PLAN_RESTORE"
    MISSION_START = "MISSION_START"
    ALARM_DISMISS = "ALARM_DISMISS"
    BEHAVIOR_CANDIDATE = "BEHAVIOR_CANDIDATE"
    CLARIFY_ASKED = "CLARIFY_ASKED"
    LABEL_CONFIRMED = "LABEL_CONFIRMED"
    TIMELINE_SEGMENT_PATCHED = "TIMELINE_SEGMENT_PATCHED"


class ExecutionLogStored(BaseModel):
    log_id: int
    ts: datetime
    day_id: int
    task_id: Optional[int] = None
    event_type: str
    duration_sec: Optional[int] = None
    mode: Optional[int] = None
    condition_ref: Optional[int] = None
    resistance_event_ref: Optional[int] = None
    metrics: Optional[dict[str, Any]] = None
    context: Optional[dict[str, Any]] = None

    model_config = {"from_attributes": True}

