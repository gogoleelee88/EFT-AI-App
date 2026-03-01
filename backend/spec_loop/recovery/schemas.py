from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SessionState = Literal["start", "in_progress", "completed"]
EntryPoint = Literal["schedule_start", "progress_blocked", "distraction_detected", "session_summary"]
RecoveryAction = Literal["open_web", "ignore"]
IosSignalType = Literal["background", "screen_off"]


class RecoveryEventIn(BaseModel):
    user_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    focus_session_id: Optional[str] = Field(default=None, max_length=64)
    schedule_id: Optional[str] = Field(default=None, max_length=128)
    schedule_name: Optional[str] = Field(default=None, max_length=120)
    session_state: SessionState = "in_progress"
    entry_point: EntryPoint
    blocked_min: Optional[int] = Field(default=None, ge=0, le=24 * 60)
    distraction_type: Optional[str] = Field(default=None, max_length=32)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    source: Optional[str] = Field(default=None, max_length=32)
    timestamp: Optional[datetime] = None
    cooldown_minutes: Optional[int] = Field(default=None, ge=1, le=180)

    # additive fields (all optional, backward compatible)
    mismatch_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    distraction_app_category: Optional[str] = Field(default=None, max_length=32)
    observed_apps: Optional[list[dict[str, Any]]] = None
    context_version: Optional[str] = Field(default=None, max_length=16)
    source_detail: Optional[str] = Field(default=None, max_length=32)
    summary_reason: Optional[str] = Field(default=None, max_length=32)
    unknown_ratio: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    system_ratio: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    top_categories: Optional[list[str]] = None
    switch_count: Optional[int] = Field(default=None, ge=0, le=100000)
    duration_ratio: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class RecoveryEventOut(BaseModel):
    event_id: str
    action: RecoveryAction
    entry_sentence: str
    recovery_url: Optional[str] = None
    suppressed_reason: Optional[str] = None
    focus_session_id: Optional[str] = None
    schedule_id: Optional[str] = None
    entry_point: EntryPoint
    created_at: datetime


class IosSignalIn(BaseModel):
    user_id: Optional[str] = Field(default=None, min_length=1, max_length=64)
    focus_session_id: Optional[str] = Field(default=None, max_length=64)
    schedule_id: Optional[str] = Field(default=None, max_length=128)
    schedule_name: Optional[str] = Field(default=None, max_length=120)
    signal_type: IosSignalType
    confidence: Optional[float] = Field(default=0.66, ge=0.0, le=1.0)
    timestamp: Optional[datetime] = None
    cooldown_minutes: Optional[int] = Field(default=None, ge=1, le=180)


class RecoveryJournalEventItem(BaseModel):
    event_id: str
    created_at: datetime
    entry_point: EntryPoint
    session_state: SessionState
    schedule_id: Optional[str] = None
    schedule_name: Optional[str] = None
    distraction_type: Optional[str] = None
    blocked_min: Optional[int] = None
    action: RecoveryAction
    entry_sentence: str

    # optional extras in journal (safe)
    mismatch_score: Optional[float] = None
    distraction_app_category: Optional[str] = None
    observed_apps: Optional[list[dict[str, Any]]] = None
    context_version: Optional[str] = None


class RecoveryJournalOut(BaseModel):
    user_id: str
    from_ts: datetime
    to_ts: datetime
    total_events: int
    open_web_count: int
    ignored_count: int
    entry_point_counts: dict[str, int] = Field(default_factory=dict)
    distraction_type_counts: dict[str, int] = Field(default_factory=dict)
    schedule_counts: dict[str, int] = Field(default_factory=dict)
    summary_lines: list[str] = Field(default_factory=list)
    events: list[RecoveryJournalEventItem] = Field(default_factory=list)


class RecoveryJournalSummaryInputOut(BaseModel):
    user_id: str
    from_ts: datetime
    to_ts: datetime
    focus_sessions_count: int = 0
    entry_point_counts: dict[str, int] = Field(default_factory=dict)
    top_distraction_categories: list[str] = Field(default_factory=list)
    avg_mismatch_score: Optional[float] = None
    mismatch_by_schedule: dict[str, float] = Field(default_factory=dict)
    avg_unknown_ratio: Optional[float] = None
    avg_system_ratio: Optional[float] = None
    top_categories_counts: dict[str, int] = Field(default_factory=dict)
