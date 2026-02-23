from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


MealState = Literal["FASTING", "ATE"]
TrackType = Literal["AUTO", "A", "B"]
SlotType = Literal["T30", "T90"]
RoleType = Literal["Owner", "Admin", "Member"]
JobType = Literal["POST_CHECK_T30", "POST_CHECK_T90"]
ConfidenceBucket = Literal["low", "med", "high"]
PushChannel = Literal["push", "webpush", "email", "apns"]
PlatformType = Literal["ios", "android", "web"]


class Versions(BaseModel):
    engine_version: str
    model_version: str
    prompt_version: str
    dataset_version: str


class MealCreateRequest(BaseModel):
    meal_state: MealState
    meal_time: Optional[datetime] = None
    fasting_hours: Optional[float] = Field(None, ge=0, le=72)
    source: str = Field(default="manual", min_length=1, max_length=32)


class MealUpdateRequest(BaseModel):
    meal_state: Optional[MealState] = None
    meal_time: Optional[datetime] = None
    fasting_hours: Optional[float] = Field(None, ge=0, le=72)
    source: Optional[str] = Field(default=None, min_length=1, max_length=32)


class MealResponse(BaseModel):
    meal_id: str
    meal_state: MealState
    meal_time: datetime
    fasting_hours: Optional[float] = None
    source: str
    check_windows: Optional[dict[str, datetime]] = None
    status: str


class MealListItem(BaseModel):
    meal_id: str
    meal_state: MealState
    meal_time: datetime
    source: str
    track_selected: Optional[str] = None
    photo_count: int
    has_estimate: bool
    has_post_check: bool


class MealListResponse(BaseModel):
    items: list[MealListItem]


class PhotoInput(BaseModel):
    storage_uri: str = Field(..., min_length=1)
    thumbnail_uri: Optional[str] = None
    embedding_ref: Optional[str] = None
    raw_store: bool = False


class MealPhotoCreateRequest(BaseModel):
    photos: list[PhotoInput] = Field(default_factory=list, max_length=10)


class MealPhotoResponse(BaseModel):
    uploaded: list[dict[str, str]]
    raw_store: bool
    auto_estimate: Optional["MealEstimateResponse"] = None


class MealEstimateRequest(BaseModel):
    track: TrackType = "AUTO"
    barcode: Optional[str] = None
    force_recompute: bool = False


class NutritionPayload(BaseModel):
    calories: int
    carbs_g: float
    protein_g: float
    fat_g: float
    sodium_mg: float


class MealEstimateResponse(BaseModel):
    estimate_id: str
    track_used: Literal["A", "B"]
    nutrition: NutritionPayload
    labels: list[str]
    confidence: float = Field(..., ge=0, le=1)
    uncertainty_reason: list[str]
    source_refs: list[str]
    confidence_bucket: ConfidenceBucket
    versions: Versions


class PostCheckRequest(BaseModel):
    slot: SlotType
    submitted_at: Optional[datetime] = None
    notification_opened_at: Optional[datetime] = None
    sleepiness: int = Field(..., ge=0, le=4)
    focus_drop: int = Field(..., ge=0, le=4)
    sluggishness: int = Field(..., ge=0, le=4)
    gi_discomfort: Optional[int] = Field(None, ge=0, le=4)
    headache: Optional[int] = Field(None, ge=0, le=4)
    caffeine_used: bool = False


class PostCheckResponse(BaseModel):
    check_id: str
    slot: SlotType
    dip_score_partial: int = Field(..., ge=0, le=100)
    late: bool
    check_completion_time_ms: Optional[int] = None


class PostCheckListResponse(BaseModel):
    items: list[dict]


class AdviceResponse(BaseModel):
    advice_id: str
    dip_score: int
    decision_mode: str
    task_mode: str
    next_action: list[str]
    confidence: float
    why_tokens: list[str]
    versions: Versions


class SchedulerJobCreateRequest(BaseModel):
    meal_id: str
    job_type: JobType
    due_at: datetime


class SchedulerJobResponse(BaseModel):
    job_id: str
    status: str
    dedupe_key: str


class SchedulerRunRequest(BaseModel):
    limit: int = Field(default=50, ge=1, le=200)
    quiet_policy: Literal["skip", "next_window"] = "next_window"
    channel: PushChannel = "push"


class SchedulerRunResponse(BaseModel):
    processed: int
    sent: int
    failed: int
    skipped: int
    rescheduled: int


class NotificationTriggerRequest(BaseModel):
    job_id: str
    channel: PushChannel = "push"


class NotificationTriggerResponse(BaseModel):
    delivery_id: str
    status: str
    attempt: int


class DeviceTokenUpsertRequest(BaseModel):
    platform: PlatformType
    push_token: str = Field(..., min_length=8, max_length=4096)
    is_active: bool = True


class DeviceTokenResponse(BaseModel):
    token_id: str
    platform: PlatformType
    is_active: bool
    last_seen_at: Optional[datetime] = None
    created_at: datetime


class DeviceTokenListResponse(BaseModel):
    items: list[DeviceTokenResponse]


class WeeklySummaryResponse(BaseModel):
    week_start: date
    days_logged: int
    avg_dip_score: float
    t30_response_rate: float
    advice_follow_rate: float
    zero_input_meal_rate: float


class ConsentUpsertRequest(BaseModel):
    consent_type: str = Field(..., min_length=2, max_length=64)
    version: str = Field(..., min_length=1, max_length=32)
    granted: bool
    metadata_json: Optional[dict] = None


class ConsentResponse(BaseModel):
    consent_id: str
    status: str


class ConsentRevokeRequest(BaseModel):
    consent_type: str = Field(..., min_length=2, max_length=64)
    effective_at: Optional[datetime] = None


class TenantActor(BaseModel):
    user_id: str
    tenant_id: str
    role: RoleType

# --- Pydantic v2 forward-ref resolution (required when using future annotations) ---
try:
    # rebuild models so ForwardRef like "MealEstimateResponse" resolves correctly
    for _m in [
        Versions,
        MealCreateRequest,
        MealUpdateRequest,
        MealResponse,
        MealListItem,
        MealListResponse,
        PhotoInput,
        MealPhotoCreateRequest,
        MealPhotoResponse,
        MealEstimateRequest,
        NutritionPayload,
        MealEstimateResponse,
        PostCheckRequest,
        PostCheckResponse,
        PostCheckListResponse,
        AdviceResponse,
        SchedulerJobCreateRequest,
        SchedulerJobResponse,
        SchedulerRunRequest,
        SchedulerRunResponse,
        NotificationTriggerRequest,
        NotificationTriggerResponse,
        DeviceTokenUpsertRequest,
        DeviceTokenResponse,
        DeviceTokenListResponse,
        WeeklySummaryResponse,
        ConsentUpsertRequest,
        ConsentResponse,
        ConsentRevokeRequest,
        TenantActor,
    ]:
        _m.model_rebuild()
except Exception:
    # keep startup from crashing here; the real error will show on route registration if still broken
    pass