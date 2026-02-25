# Mission 관련 Pydantic 스키마
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# === 미세행동 (Micro Action) 스키마 ===
class MicroActionBase(BaseModel):
    """미세행동 기본 스키마"""

    name: str = Field(..., max_length=512, description="미세행동 이름")
    description: Optional[str] = Field(None, max_length=1024, description="상세 설명")
    start_trigger: Optional[str] = Field(None, max_length=512, description="시작 행동")
    source: Literal["user_history", "ai_recommendation", "user_custom"] = "user_custom"
    est_minutes: Optional[int] = Field(None, ge=1, description="예상 소요 시간(분)")


class MicroActionResponse(MicroActionBase):
    """미세행동 응답 스키마"""

    micro_action_id: int
    task_id: int
    success_count: int
    total_count: int
    success_rate: float
    last_used_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class MicroActionCreate(MicroActionBase):
    """MicroAction create request."""

    task_id: Optional[int] = Field(None, description="Existing Task ID")
    task_title: Optional[str] = Field(None, max_length=512, description="New Task title")
    task_est_minutes: Optional[int] = Field(
        None, ge=1, le=1440, description="Task estimated minutes"
    )


class PlanItemInput(BaseModel):
    """Plan item used for micro action suggestions."""

    title: str = Field(..., max_length=512, description="Plan item title")
    start: Optional[str] = Field(None, max_length=64, description="Start time (optional)")
    end: Optional[str] = Field(None, max_length=64, description="End time (optional)")


class MicroActionSuggestion(BaseModel):
    """Suggested micro action payload."""

    title: str = Field(..., max_length=64)
    why: str = Field(..., max_length=200)
    duration_min: int = Field(..., ge=1, le=15)
    trigger: str = Field(..., max_length=64)


class MicroActionSuggestRequest(BaseModel):
    """Micro action suggestion request."""

    plan_items: list[PlanItemInput] = Field(default_factory=list)
    mission_type: Optional[str] = Field(None, max_length=64)
    recent_micro_actions: Optional[list[str]] = Field(default_factory=list)


class MicroActionSuggestResponse(BaseModel):
    """Micro action suggestion response."""

    suggestions: list[MicroActionSuggestion] = Field(default_factory=list)


# === 장소 (Place) 스키마 ===
class PlaceCreate(BaseModel):
    """장소 등록 요청"""

    name: str = Field(..., max_length=256, description="장소 이름")
    address: Optional[str] = Field(None, max_length=512, description="주소")
    gps_lat: Optional[float] = Field(None, description="GPS 위도")
    gps_lng: Optional[float] = Field(None, description="GPS 경도")
    gps_radius: int = Field(50, ge=10, le=500, description="GPS 인증 반경(미터)")
    wifi_ssid: Optional[str] = Field(None, max_length=256, description="Wi-Fi SSID")
    bluetooth_beacon_id: Optional[str] = Field(None, max_length=256, description="Bluetooth Beacon ID")
    verification_method: list[Literal["gps", "wifi", "bluetooth"]] = Field(
        default_factory=list, description="인증 방법"
    )


class PlaceUpdate(BaseModel):
    """장소 수정 요청"""

    name: Optional[str] = Field(None, max_length=256)
    address: Optional[str] = Field(None, max_length=512)
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    gps_radius: Optional[int] = Field(None, ge=10, le=500)
    wifi_ssid: Optional[str] = Field(None, max_length=256)
    bluetooth_beacon_id: Optional[str] = Field(None, max_length=256)
    verification_method: Optional[list[Literal["gps", "wifi", "bluetooth"]]] = None


class PlaceResponse(BaseModel):
    """장소 응답 스키마"""

    place_id: int
    name: str
    address: Optional[str]
    gps_lat: Optional[float]
    gps_lng: Optional[float]
    gps_radius: int
    wifi_ssid: Optional[str]
    bluetooth_beacon_id: Optional[str]
    verification_method: Optional[list[str]]
    success_count: int
    total_count: int
    success_rate: float
    last_used_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class PlaceSearchResult(BaseModel):
    """External place search result payload."""

    provider: str = Field("kakao")
    provider_id: Optional[str] = Field(None, description="Provider place ID")
    place_name: str = Field(..., description="Place name")
    address: Optional[str] = Field(None, description="Address text")
    road_address: Optional[str] = Field(None, description="Road address text")
    category_name: Optional[str] = Field(None, description="Category path")
    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")


# === 미션 설정 (Mission Config) 스키마 ===
class PhotoMissionConfig(BaseModel):
    """사진 미션 설정"""

    requirement: str = Field(..., description="필요한 것들")
    description: Optional[str] = Field(None, description="상세 설명")
    ocr_keywords: Optional[list[str]] = Field(default_factory=list, description="OCR 키워드")
    objects_required: Optional[list[str]] = Field(default_factory=list, description="필요 객체")
    verification_method: Optional[str] = Field(None, description="검증 방법 설명")
    example_image_url: Optional[str] = Field(None, description="예시 사진 URL")


class LocationMissionConfig(BaseModel):
    """장소 미션 설정"""

    place_id: int = Field(..., description="장소 ID")
    place_name: str = Field(..., description="장소 이름")
    address: Optional[str] = None
    gps: Optional[dict[str, float]] = Field(None, description="GPS 정보 {lat, lng, radius}")
    wifi_ssid: Optional[str] = None
    bluetooth_beacon_id: Optional[str] = None
    verification_method: list[Literal["gps", "wifi", "bluetooth"]] = Field(
        default_factory=list, description="인증 방법"
    )


class TimeMissionConfig(BaseModel):
    """시간 확인 미션 설정"""

    time: str = Field(..., description="확인 시간 (HH:mm)")
    check_type: list[Literal["screen_capture", "photo"]] = Field(
        default_factory=list, description="확인 방법"
    )
    screen_requirements: Optional[dict[str, Any]] = Field(None, description="화면 확인 요구사항")
    notification_mode: Literal["silent", "push"] = Field("push", description="알림 방식")


class MissionTemplateCreate(BaseModel):
    """미션 템플릿 생성 요청"""

    micro_action_id: int
    mission_type: Literal["photo", "location", "time_check"]
    enabled: bool = True
    config: PhotoMissionConfig | LocationMissionConfig | TimeMissionConfig


class MissionTemplateResponse(BaseModel):
    """미션 템플릿 응답"""

    mission_template_id: int
    micro_action_id: int
    mission_type: str
    enabled: bool
    config: dict[str, Any]
    success_count: int
    total_count: int
    success_rate: float
    last_used_at: Optional[datetime]
    last_result: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# === AI 추천 응답 스키마 ===
class MicroActionRecommendation(BaseModel):
    """미세행동 추천 항목"""

    name: str
    description: str
    start_trigger: Optional[str] = None
    est_minutes: int


class PhotoRecommendation(BaseModel):
    """사진 미션 추천 옵션"""

    label: str
    description: str
    verification_description: str
    config: PhotoMissionConfig


class MissionRecommendResponse(BaseModel):
    """미션 추천 응답"""

    photo_options: Optional[list[PhotoRecommendation]] = Field(
        default_factory=list, description="사진 인증 옵션 (최대 3개)"
    )
    location_suggestion: Optional[dict[str, str]] = Field(None, description="장소 추천")
    time_suggestion: Optional[dict[str, Any]] = Field(None, description="시간 확인 추천")


# === Task 최근 사용 이력 ===
class TaskHistoryResponse(BaseModel):
    """Task 최근 사용 이력"""

    task_id: int
    title: str
    est_minutes: int
    success_count: int
    total_count: int
    success_rate: float
    last_used_at: Optional[datetime]


class TaskClarifySuggestion(BaseModel):
    """Task title rewrite suggestion."""

    title: str = Field(..., max_length=80)
    reason: str = Field(..., max_length=200)


class TaskClarifyRequest(BaseModel):
    """Task title clarify request."""

    title: str = Field(..., max_length=512)
    mission_type: Optional[str] = Field(None, max_length=64)
    recent_tasks: Optional[list[str]] = Field(default_factory=list)
    recent_micro_actions: Optional[list[str]] = Field(default_factory=list)


class TaskClarifyResponse(BaseModel):
    """Task title clarify response."""

    is_ambiguous: bool
    issues: list[str] = Field(default_factory=list)
    rewrite_suggestions: list[TaskClarifySuggestion] = Field(default_factory=list)
