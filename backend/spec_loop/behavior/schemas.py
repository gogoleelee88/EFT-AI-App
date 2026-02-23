from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

LabelType = Literal["work", "rest", "move", "exercise", "other"]
QuestionStatus = Literal["asked", "answered", "dismissed", "expired"]
LabelSource = Literal["inferred", "question", "manual_edit"]


class ActivityCandidateIn(BaseModel):
    user_id: Optional[str] = None
    day_id: Optional[int] = Field(default=None, description="Optional. If omitted and user_id exists, server auto-resolves today's day_id.")
    focus_session_id: Optional[str] = Field(default=None, max_length=64)
    schedule_id: Optional[str] = Field(default=None, max_length=128)
    schedule_type: Optional[str] = Field(default=None, max_length=32)
    ts_start: datetime
    ts_end: datetime
    top1: str = Field(..., min_length=1, max_length=64)
    activity_topk: list[dict] = Field(default_factory=list)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    margin_top1_top2: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    screen_state: Optional[str] = Field(default=None, max_length=32)
    orientation: Optional[str] = Field(default=None, max_length=32)
    pickup_flag: Optional[bool] = None
    mismatch_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    trigger_reasons: list[str] = Field(default_factory=list)
    dedupe_key: Optional[str] = Field(default=None, max_length=128)


class ActivityCandidateOut(BaseModel):
    candidate_id: int
    dedupe_hit: bool = False
    user_id: Optional[str] = None
    day_id: Optional[int] = None
    focus_session_id: Optional[str] = None
    schedule_id: Optional[str] = None
    schedule_type: Optional[str] = None
    ts_start: datetime
    ts_end: datetime
    top1: str
    confidence: Optional[float] = None
    margin_top1_top2: Optional[float] = None
    mismatch_score: Optional[float] = None
    auto_question_id: Optional[int] = None
    auto_question_created: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class ClarificationQuestionCreateIn(BaseModel):
    user_id: Optional[str] = None
    candidate_id: int
    question_text: Optional[str] = Field(default=None, max_length=255)
    trigger_reasons: list[str] = Field(default_factory=list)
    cooldown_key: Optional[str] = Field(default=None, max_length=128)
    cooldown_minutes: Optional[int] = Field(default=None, ge=1, le=240)
    expires_minutes: int = Field(default=30, ge=1, le=240)
    max_daily_questions: int = Field(default=8, ge=1, le=100)


class ClarificationQuestionOut(BaseModel):
    question_id: int
    user_id: Optional[str] = None
    candidate_id: int
    focus_session_id: Optional[str] = None
    schedule_id: Optional[str] = None
    schedule_type: Optional[str] = None
    status: QuestionStatus
    question_text: str
    trigger_reasons: list[str] = Field(default_factory=list)
    recovery_url: Optional[str] = None
    cooldown_key: str
    asked_at: datetime
    expires_at: Optional[datetime] = None
    cooldown_skipped: bool = False

    model_config = {"from_attributes": True}


class ClarificationAnswerIn(BaseModel):
    user_id: Optional[str] = None
    label: LabelType
    note: Optional[str] = Field(default=None, max_length=255)


class ClarificationAnswerOut(BaseModel):
    question_id: int
    status: QuestionStatus
    label_id: int
    timeline_segment_id: int
    final_label: LabelType


class ClarificationQuestionTransitionOut(BaseModel):
    question_id: int
    status: QuestionStatus


class TimelineSegmentOut(BaseModel):
    segment_id: int
    user_id: Optional[str] = None
    day_id: Optional[int] = None
    candidate_id: Optional[int] = None
    ts_start: datetime
    ts_end: datetime
    inferred_label: Optional[str] = None
    final_label: Optional[str] = None
    label_source: LabelSource | str
    mismatch_score_avg: Optional[float] = None
    resume_hint_emitted: bool
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TimelineSegmentListOut(BaseModel):
    items: list[TimelineSegmentOut] = Field(default_factory=list)


class TimelineSegmentPatchIn(BaseModel):
    user_id: Optional[str] = None
    final_label: LabelType
    note: Optional[str] = Field(default=None, max_length=255)
