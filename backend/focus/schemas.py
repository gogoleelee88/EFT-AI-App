from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


SourceType = Literal["web", "extension", "mobile", "watch"]
EventType = Literal[
    "activity",
    "camera_presence",
    "geofence",
    "wifi",
    "ble",
    "calendar",
    "timer",
    "interruption_label",
    "reentry",
]
SessionStateType = Literal["working", "micro_drift", "physical_exit", "context_switch", "paused"]
InterruptionType = Literal["break", "meeting", "stuck"]
TimerMode = Literal["pomodoro", "free"]


class SessionCreateIn(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    task_title: str = Field(..., min_length=1, max_length=255)
    goal: str = Field(..., min_length=1, max_length=2000)
    timer_mode: TimerMode = "free"
    duration: Optional[int] = Field(None, ge=1, le=720)
    next_step: Optional[str] = Field(None, max_length=2000)
    sensors_enabled: dict[str, bool] = Field(default_factory=dict)
    planned_break: bool = False
    device_id: Optional[str] = Field(None, min_length=1, max_length=64)
    device_type: Optional[str] = Field(default="web", max_length=32)


class SessionPatchIn(BaseModel):
    status: Optional[str] = Field(None, max_length=32)
    next_step: Optional[str] = Field(None, max_length=2000)
    planned_break: Optional[bool] = None


class SessionOut(BaseModel):
    id: str
    user_id: Optional[str]
    task_title: str
    goal: str
    timer_mode: TimerMode
    duration: Optional[int]
    status: str
    next_step: Optional[str]
    sensors_enabled: dict[str, bool]
    planned_break: bool


class EventEnvelopeIn(BaseModel):
    event_id: str = Field(..., min_length=8, max_length=64)
    ts: int = Field(..., ge=0, description="unix ms")
    user_id: str = Field(..., min_length=1, max_length=64)
    device_id: str = Field(..., min_length=1, max_length=64)
    session_id: str = Field(..., min_length=1, max_length=64)
    source: SourceType
    type: EventType
    payload: dict[str, Any]


class EventsBatchIn(BaseModel):
    events: list[EventEnvelopeIn] = Field(..., min_length=1, max_length=500)


class StateOut(BaseModel):
    state: SessionStateType
    exit_score: float
    last_evidence: dict[str, Any] = Field(default_factory=dict)
    last_next_step: Optional[str] = None


class ReentryCardOut(BaseModel):
    last_context_summary: str
    next_step: Optional[str]
    suggested_sprint: int
    stuck_cta: str


class InterruptionLabelIn(BaseModel):
    interruption_type: InterruptionType
    user_initiated: bool
    notes: Optional[str] = Field(None, max_length=2000)


class SettingsOut(BaseModel):
    user_id: str
    idle_threshold_seconds: int
    camera_enabled: bool
    camera_weight: float
    window_size_seconds: int
    notification_prefs: dict[str, Any] = Field(default_factory=dict)
    data_retention_days: int


class SettingsPatchIn(BaseModel):
    idle_threshold_seconds: Optional[int] = Field(None, ge=30, le=3600)
    camera_enabled: Optional[bool] = None
    camera_weight: Optional[float] = Field(None, ge=0, le=10)
    window_size_seconds: Optional[int] = Field(None, ge=120, le=1800)
    notification_prefs: Optional[dict[str, Any]] = None
    data_retention_days: Optional[int] = Field(None, ge=30, le=90)


class StuckIn(BaseModel):
    stuck_text: str = Field(..., min_length=1, max_length=5000)
    desired_output: str = Field(..., min_length=1, max_length=2000)
    constraints: Optional[str] = Field(None, max_length=4000)
    attachments: Optional[list[str]] = None
    answers: Optional[dict[str, str]] = None
    tone_toggle: Optional[Literal["shorter", "more_logical", "more_creative"]] = None


class UIOption(BaseModel):
    id: str
    title: str
    summary: str


class UICheckItem(BaseModel):
    id: str
    text: str
    eta_minutes: int
    required: bool


class UIOutputSpec(BaseModel):
    type: Literal["options", "checklist", "table", "drafts"]
    options: list[UIOption] = Field(default_factory=list)
    checklist: list[UICheckItem] = Field(default_factory=list)
    cta_buttons: list[str] = Field(
        default_factory=lambda: ["스프린트 5분 시작", "이 프롬프트로 실행", "대안 모델로 재시도"]
    )


class StuckOut(BaseModel):
    detected_category: str
    confidence: float
    required_questions: list[str] = Field(default_factory=list)
    recommended_profiles: list[str]
    prompt_text: str
    ui_output_spec: UIOutputSpec
    next_actions: list[UICheckItem]

