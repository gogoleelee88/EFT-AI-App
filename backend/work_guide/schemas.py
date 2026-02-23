from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


GuideMode = Literal["dom", "screenshot"]
TargetType = Literal["selector", "bbox", "text_hint"]


class BBox(BaseModel):
    x: int = Field(..., ge=0)
    y: int = Field(..., ge=0)
    w: int = Field(..., ge=1)
    h: int = Field(..., ge=1)


class Candidate(BaseModel):
    label: str = Field(..., min_length=1, max_length=120)
    selector: Optional[str] = Field(default=None, max_length=512)
    bbox: Optional[BBox] = None
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class StepTarget(BaseModel):
    type: TargetType
    selector: Optional[str] = Field(default=None, max_length=512)
    text_hint: Optional[str] = Field(default=None, max_length=200)
    bbox: Optional[BBox] = None


class StepFallback(BaseModel):
    type: Literal["bbox"] = "bbox"
    bbox: Optional[BBox] = None


class StepConfirm(BaseModel):
    needed: bool = False
    question: Optional[str] = Field(default=None, max_length=300)


class Step(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=120)
    instruction: str = Field(..., min_length=1, max_length=500)
    target: StepTarget
    fallback: StepFallback = Field(default_factory=StepFallback)
    confirm: StepConfirm = Field(default_factory=StepConfirm)
    candidates: list[Candidate] = Field(default_factory=list, max_length=2)


class StepPlan(BaseModel):
    mode: GuideMode
    goal: str = Field(..., min_length=1, max_length=500)
    step_index: int = Field(default=1, ge=1)
    total_steps_hint: int = Field(default=3, ge=1, le=10)
    steps: list[Step] = Field(default_factory=list, min_length=1, max_length=1)


class DomNode(BaseModel):
    id: str = Field(..., min_length=1, max_length=128)
    text: str = Field(default="", max_length=300)
    role: Optional[str] = Field(default=None, max_length=64)
    ariaLabel: Optional[str] = Field(default=None, max_length=300)
    tag: Optional[str] = Field(default=None, max_length=32)
    classes: list[str] = Field(default_factory=list, max_length=16)
    pathHint: Optional[str] = Field(default=None, max_length=400)


class ScreenshotPlanRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=500)
    screenshot_base64: str = Field(..., min_length=20)
    locale: str = Field(default="ko-KR", max_length=20)
    context_text: Optional[str] = Field(default=None, max_length=1000)
    step_index: int = Field(default=1, ge=1, le=10)
    max_steps: int = Field(default=3, ge=1, le=10)


class DomPlanRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=500)
    url: str = Field(..., min_length=1, max_length=1000)
    dom_summary: list[DomNode] = Field(default_factory=list, max_length=200)
    locale: str = Field(default="ko-KR", max_length=20)
    context_text: Optional[str] = Field(default=None, max_length=1000)
    step_index: int = Field(default=1, ge=1, le=10)
    max_steps: int = Field(default=3, ge=1, le=10)


class WorkGuideLogRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=500)
    mode: GuideMode
    step_id: str = Field(..., min_length=1, max_length=64)
    confirm_needed: bool = False
    confirm_answer: Optional[Literal["yes", "no"]] = None
    selected_candidate_index: Optional[int] = Field(default=None, ge=0, le=1)


class WorkGuideLogItem(BaseModel):
    ts: str
    goal: str
    mode: GuideMode
    step_id: str
    confirm_needed: bool
    confirm_answer: Optional[str] = None
    selected_candidate_index: Optional[int] = None


class ScreenshotPlanResponse(BaseModel):
    step_plan: StepPlan
    annotated_image_base64: Optional[str] = None
    img_w: int = Field(..., ge=1)
    img_h: int = Field(..., ge=1)


class DomPlanResponse(BaseModel):
    step_plan: StepPlan
