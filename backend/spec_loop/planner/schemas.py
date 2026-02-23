# SPEC C2: POST /plan/day 요청/응답 + 미션 설정 확장
from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class PlanItem(BaseModel):
    """Hybrid PlanItem.

    - 기존 방식: task_id만 있는 경우 → 기존 Task 참조
    - 신규 방식: task_id가 없고 task_title/est_minutes가 있으면 → Task를 즉시 생성
    """

    task_id: Optional[int] = None
    task_title: Optional[str] = None
    est_minutes: Optional[int] = None
    priority: Optional[int] = 1
    resistance_level: Optional[int] = Field(
        default=None,
        ge=0,
        le=10,
        description="Schedule resistance level (0-10).",
    )
    planned_block_minutes: int = Field(..., ge=1)
    micro_steps: list[str] = Field(default_factory=list)


class PlanDayRequest(BaseModel):
    date: date
    mode: int = Field(..., description="100 | 70 | 40")
    items: list[PlanItem]
    user_id: Optional[str] = None


class PlanDayResponse(BaseModel):
    day_id: int
    date: date
    mode: int
    items: list[dict]

    model_config = {"from_attributes": True}


# === 🆕 미션 설정 확장 스키마 ===
class MicroActionInput(BaseModel):
    """미세행동 입력 (PlanItem에 포함)"""

    micro_action_id: Optional[int] = None  # 기존 미세행동 재사용
    name: str = Field(..., max_length=512)
    description: Optional[str] = Field(None, max_length=1024)
    start_trigger: Optional[str] = Field(None, max_length=512)
    source: Literal["user_history", "ai_recommendation", "user_custom"] = "user_custom"


class MissionInput(BaseModel):
    """미션 입력 (PlanItem에 포함)"""

    mission_id: Optional[str] = None  # 선택적 ID (원본 스펙 호환)
    type: Literal["photo", "location", "time_check"]
    enabled: bool = True
    config: dict[str, Any]  # PhotoMissionConfig | LocationMissionConfig | TimeMissionConfig


class AlarmInput(BaseModel):
    """알람 입력"""

    time: str = Field(..., description="HH:mm 형식")
    repeat: Literal["once", "daily", "weekdays", "weekends", "custom", "custom_days"] = "daily"
    custom_days: Optional[list[int]] = Field(None, description="커스텀 요일 (0=일~6=토)")


class PlanItemWithMission(BaseModel):
    """미션 포함 PlanItem (하위 호환 유지)"""

    # 기존 필드 (하위 호환)
    task_id: Optional[int] = None
    task_title: Optional[str] = None
    est_minutes: Optional[int] = None
    priority: Optional[int] = 1
    resistance_level: Optional[int] = Field(
        default=None,
        ge=0,
        le=10,
        description="Schedule resistance level (0-10).",
    )
    planned_block_minutes: int = Field(..., ge=1)
    micro_steps: list[str] = Field(default_factory=list)

    # 🆕 신규 필드 (선택적)
    micro_action: Optional[MicroActionInput] = None
    missions: list[MissionInput] = Field(default_factory=list)
    missions_combination_mode: Literal["strict", "basic", "flexible"] = "basic"
    alarm: Optional[AlarmInput] = None


class PlanDayWithMissionRequest(BaseModel):
    """미션 포함 DayPlan 요청 (하위 호환 유지)"""

    date: date
    mode: int = Field(..., description="100 | 70 | 40")
    items: list[PlanItemWithMission]
    user_id: Optional[str] = None
