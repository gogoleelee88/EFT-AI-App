# F3: CheckinRequest에 condition_id 없음. CheckinResponse에 condition_id, ts, condition_score, final_mode, adapt_applied, updated_day_plan
# 결정 4: 30초 체크인 = UX 목표, 백엔드 검증 없음 (30초 필드/검증 없음)
from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# F4 sleep_hours bands
SleepHours = Literal["LT5", "H5_6", "H6_7", "H7_8", "GT8"]
# F4 mood
Mood = Literal["calm", "ok", "anxious", "low", "irritated"]
# F4 period_status
PeriodStatus = Literal["on", "pre", "post", "none"]

ConditionDomain = Literal["GENERAL", "MENSTRUAL"]
ConfidenceLevel = Literal["low", "med", "high"]

# Slice 7: 모드 하향 1줄 문구 및 70/40 보호/최적화 문구(B1, D)
MODE_DOWN_REASON_LINE = "수면/피로/통증 신호로 인해 시작 성공률을 우선합니다."
MODE_TEXT_PROTECT = "보호 모드 (70/40)"
MODE_TEXT_OPTIMIZE = "최적화 모드 (70/40)"


class MinConditionSet(BaseModel):
    """min_condition_set: 필수 sleep_hours, fatigue, pain, mood; period_status 선택 (F2, F3)."""

    sleep_hours: SleepHours
    fatigue: int = Field(..., ge=0, le=10)
    pain: int = Field(..., ge=0, le=10)
    mood: Mood
    period_status: Optional[PeriodStatus] = None


class MenstrualQuickCheck(BaseModel):
    """Menstrual Quick Check (하루 1회 빠른 입력)."""

    bleeding_level_0_2: Optional[int] = Field(None, ge=0, le=2)
    cramps_0_4: int = Field(..., ge=0, le=4)
    fatigue_0_4: int = Field(..., ge=0, le=4)
    irritability_0_4: int = Field(..., ge=0, le=4)
    focus_drop_0_4: Optional[int] = Field(None, ge=0, le=4)
    notes: Optional[str] = Field(None, min_length=0, max_length=60)


class DriverSummary(BaseModel):
    driver: str
    score: int = Field(..., ge=0, le=100)
    confidence: ConfidenceLevel
    evidence: list[str] = Field(default_factory=list)


class DailyConditionSummaryView(BaseModel):
    drivers: list[DriverSummary] = Field(default_factory=list)
    drivers_top2: list[DriverSummary] = Field(default_factory=list)
    confidence: ConfidenceLevel = "low"
    evidence_snapshot: list[str] = Field(default_factory=list)
    menstrual_score_0_100: int = Field(default=0, ge=0, le=100)
    data_quality: str = "low"


class CheckinRequest(BaseModel):
    """POST /condition/checkin 요청.

    - condition_id 없음 (F3, 요청에는 id 미포함)
    - day_id **필수** (해당 DayPlan에 대해 내부 adapt 수행)
    """

    ts: Optional[datetime] = None  # 없으면 서버 now
    source_level: Optional[int] = Field(None, ge=0, le=2)
    min_condition_set: MinConditionSet
    wearable: Optional[dict[str, Any]] = None
    behavior_inference: Optional[dict[str, Any]] = None
    previous_condition_id: Optional[int] = None  # pain_delta 계산용 (2h 내 이전)
    day_id: int  # 해당 DayPlan에 대해 adapt 시도(모드 다를 때)
    user_id: Optional[str] = None
    condition_domain: Optional[ConditionDomain] = None
    menstrual_quick_check: Optional[MenstrualQuickCheck] = None
    period_start_date: Optional[date] = None


class CheckinResponse(BaseModel):
    """POST /condition/checkin 응답 (결정 1: adapt_applied, updated_day_plan 포함)."""

    condition_id: int
    ts: datetime
    source_level: Optional[int] = None
    condition_score: Optional[int] = None
    final_mode: int  # 100 | 70 | 40
    inferred_flags: Optional[dict[str, Any]] = None
    adapt_applied: bool = False
    updated_day_plan: Optional[dict[str, Any]] = None
    condition_domain: Optional[ConditionDomain] = None
    confidence: Optional[ConfidenceLevel] = None
    daily_summary: Optional[DailyConditionSummaryView] = None
    medical_attention_notice: Optional[str] = None
    google_calendar_synced: bool = False
    google_calendar_sync_message: Optional[str] = None
