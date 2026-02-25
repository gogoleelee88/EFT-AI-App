from __future__ import annotations

from datetime import date as DateType
from datetime import datetime as DateTimeType
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


BleedingEventType = Literal["menstruation_start", "menstruation_end", "spotting_start", "spotting_end"]
PainArea = Literal["lower_abdomen", "back", "headache", "breast", "other"]
DataQuality = Literal["insufficient", "fair", "good"]
PhaseType = Literal["menstruation", "follicular", "ovulation_window", "luteal", "unknown"]
PMSSeverityBand = Literal["mild", "moderate", "severe"]
TriggerTag = Literal[
    "conflict",
    "overtime",
    "caffeine",
    "alcohol",
    "travel",
    "sickness",
    "exercise_change",
    "sleep_change",
    "other",
]
MedType = Literal["painkiller", "contraceptive", "ssri", "supplement", "other"]
ExportStatus = Literal["pending", "completed", "failed"]
ExportFormat = Literal["csv", "pdf"]
FertilityWindowMode = Literal["hidden", "range_only"]
BackupMode = Literal["local_encrypted", "e2e_cloud"]
AppLockMethod = Literal["faceid", "touchid", "pin"]


class RecordResponse(BaseModel):
    recorded: bool = True
    event_id: str
    event_date: DateType | None = Field(default=None, alias="date")
    timestamp: DateTimeType | None = None

    model_config = {"populate_by_name": True}


class BleedingLogRequest(BaseModel):
    date: DateType
    type: BleedingEventType = Field(description="menstruation_start/end or spotting_start/end")
    flow_level: int = Field(ge=0, le=4)
    cramp_level: int | None = Field(default=None, ge=0, le=5)
    pain_areas: list[PainArea] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=2000)
    meds_taken: list[str] = Field(default_factory=list)

    @field_validator("meds_taken")
    @classmethod
    def normalize_meds(cls, value: list[str]) -> list[str]:
        out: list[str] = []
        seen = set()
        for item in value:
            norm = item.strip()
            if not norm:
                continue
            key = norm.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(norm[:64])
        return out


class SymptomsLogRequest(BaseModel):
    date: DateType
    symptom_severity_map: dict[str, int] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=2000)
    favorite_symptoms: list[str] = Field(default_factory=list)

    @field_validator("symptom_severity_map")
    @classmethod
    def validate_symptom_map(cls, value: dict[str, int]) -> dict[str, int]:
        normalized: dict[str, int] = {}
        for raw_key, raw_score in value.items():
            key = raw_key.strip().lower().replace(" ", "_")
            if not key:
                continue
            score = int(raw_score)
            if score < 0 or score > 4:
                raise ValueError("symptom severity must be between 0 and 4")
            normalized[key] = score
        if not normalized:
            raise ValueError("symptom_severity_map must include at least one symptom")
        return normalized


class PMDDLiteLogRequest(BaseModel):
    date: DateType
    answers: list[int] = Field(min_length=11, max_length=14)
    question_ids: list[str] | None = Field(default=None, min_length=11, max_length=14)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, value: list[int]) -> list[int]:
        normalized: list[int] = []
        for raw in value:
            score = int(raw)
            if score < 0 or score > 4:
                raise ValueError("PMDD-lite answers must use a 0..4 severity scale")
            normalized.append(score)
        return normalized

    @model_validator(mode="after")
    def validate_question_ids(self) -> "PMDDLiteLogRequest":
        if self.question_ids is None:
            return self
        normalized: list[str] = []
        for raw in self.question_ids:
            key = raw.strip().lower().replace(" ", "_")
            if not key:
                raise ValueError("question_ids must not include empty values")
            normalized.append(key[:64])
        if len(normalized) != len(self.answers):
            raise ValueError("question_ids length must match answers length")
        self.question_ids = normalized
        return self


class TriggerLogRequest(BaseModel):
    date: DateType
    tags: list[TriggerTag] = Field(min_length=1)
    stress_level: int | None = Field(default=None, ge=0, le=10)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("tags")
    @classmethod
    def dedupe_tags(cls, value: list[TriggerTag]) -> list[TriggerTag]:
        out: list[TriggerTag] = []
        seen = set()
        for tag in value:
            if tag in seen:
                continue
            seen.add(tag)
            out.append(tag)
        return out


class MedsLogRequest(BaseModel):
    datetime: DateTimeType
    med_name: str = Field(min_length=1, max_length=120)
    dose: str | None = Field(default=None, max_length=120)
    type: MedType
    effect_rating: int | None = Field(default=None, ge=0, le=5)
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("med_name")
    @classmethod
    def normalize_med_name(cls, value: str) -> str:
        return value.strip()


class JournalLogRequest(BaseModel):
    datetime: DateTimeType
    text: str = Field(min_length=1, max_length=8000)
    tags: list[str] = Field(default_factory=list)
    severity: int | None = Field(default=None, ge=0, le=4)

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        out: list[str] = []
        seen = set()
        for raw in value:
            tag = raw.strip().lower().replace(" ", "_")
            if not tag or tag in seen:
                continue
            seen.add(tag)
            out.append(tag[:40])
        return out


class PMDDLiteScoreResponse(BaseModel):
    pmdd_symptom_index: float = Field(ge=0, le=100)
    pms_severity_band: PMSSeverityBand
    severity_thresholds: dict[str, float] = Field(default_factory=dict)
    baseline_index: float | None = None
    trend_delta: float | None = None
    confidence: Literal["fair", "good"] = "fair"
    interpretation: str
    scoring_version: str
    high_emotional_count: int = 0
    answered_items: int
    question_labels_ko: list[dict[str, str]] = Field(default_factory=list)
    caution: str
    medical_disclaimer: str


class JournalEntry(BaseModel):
    event_id: str
    datetime: DateTimeType
    text: str
    tags: list[str] = Field(default_factory=list)
    severity: int | None = None


class JournalSearchResponse(BaseModel):
    entries: list[JournalEntry] = Field(default_factory=list)


class MenstrualDaySummaryItem(BaseModel):
    day_date: DateType
    bleeding_status: Literal["none", "spotting", "period"] = "none"
    flow_level: int | None = None
    cycle_day_index: int | None = None
    phase: PhaseType = "unknown"
    phase_probabilities: dict[str, float] = Field(default_factory=dict)
    pmdd_symptom_index: float | None = None
    top_symptoms: list[dict[str, int | str]] = Field(default_factory=list)


class CalendarResponse(BaseModel):
    day_summaries: list[MenstrualDaySummaryItem] = Field(default_factory=list)
    fertility_window_visible: bool = False
    phase_policy: str
    medical_disclaimer: str


class PredictionResponse(BaseModel):
    next_period_window_start: DateType | None = None
    next_period_window_end: DateType | None = None
    confidence_score: int = Field(ge=0, le=100)
    why_this: str
    data_quality: DataQuality
    fertility_window_visible: bool = False
    phase_policy: str
    medical_disclaimer: str


class SymptomTrendItem(BaseModel):
    symptom: str
    avg_severity: float
    sample_count: int


class TriggerTimelineItem(BaseModel):
    date: DateType
    pmdd_symptom_index: float | None = None
    trigger_tags: list[str] = Field(default_factory=list)


class InsightsResponse(BaseModel):
    symptom_trends: list[SymptomTrendItem] = Field(default_factory=list)
    pmdd_index_timeline: list[dict[str, str | float]] = Field(default_factory=list)
    worsening_days: list[DateType] = Field(default_factory=list)
    worsening_threshold_p75: float | None = None
    top_triggers_in_worsening_days: list[dict[str, str | int]] = Field(default_factory=list)
    trigger_vs_index_timeline: list[TriggerTimelineItem] = Field(default_factory=list)
    recent_two_week_pattern: str
    medical_disclaimer: str


class ExportJobRequest(BaseModel):
    from_date: DateType = Field(alias="from")
    to_date: DateType = Field(alias="to")
    formats: list[ExportFormat] = Field(default_factory=lambda: ["csv", "pdf"])
    allow_server_export: bool = False

    model_config = {"populate_by_name": True}

    @field_validator("formats")
    @classmethod
    def normalize_formats(cls, value: list[ExportFormat]) -> list[ExportFormat]:
        if not value:
            return ["csv", "pdf"]
        out: list[ExportFormat] = []
        seen = set()
        for fmt in value:
            if fmt in seen:
                continue
            seen.add(fmt)
            out.append(fmt)
        return out

    @model_validator(mode="after")
    def validate_dates(self) -> "ExportJobRequest":
        if self.from_date > self.to_date:
            raise ValueError("from must be <= to")
        if (self.to_date - self.from_date).days > 366:
            raise ValueError("export range must be <= 366 days")
        return self


class ExportJobResponse(BaseModel):
    job_id: str
    status: ExportStatus
    created_at: DateTimeType
    formats: list[ExportFormat] = Field(default_factory=list)
    medical_disclaimer: str


class ExportJobStatusResponse(BaseModel):
    job_id: str
    status: ExportStatus
    formats: list[ExportFormat] = Field(default_factory=list)
    ready_files: list[str] = Field(default_factory=list)
    error_message: str | None = None


class PrivacySettingsResponse(BaseModel):
    on_device_only: bool
    fertility_window_mode: FertilityWindowMode = "hidden"
    app_lock_enabled: bool
    app_lock_method: AppLockMethod | None = None
    backup_mode: BackupMode = "local_encrypted"
    app_lock_recommended: bool
    privacy_notice: str


class PrivacySettingsUpdateRequest(BaseModel):
    on_device_only: bool | None = None
    fertility_window_mode: FertilityWindowMode | None = None
    app_lock_enabled: bool | None = None
    app_lock_method: AppLockMethod | None = None
    backup_mode: BackupMode | None = None
