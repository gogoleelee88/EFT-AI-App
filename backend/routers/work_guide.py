from __future__ import annotations

from fastapi import APIRouter

from work_guide.log_store import append_confirm_log, list_logs
from work_guide.schemas import (
    DomPlanRequest,
    DomPlanResponse,
    ScreenshotPlanRequest,
    ScreenshotPlanResponse,
    WorkGuideLogRequest,
)
from work_guide.service import build_dom_plan, build_screenshot_plan

router = APIRouter(prefix="/api/work-guide", tags=["work-guide"])


@router.post("/plan/screenshot", response_model=ScreenshotPlanResponse)
async def post_work_guide_plan_screenshot(body: ScreenshotPlanRequest) -> ScreenshotPlanResponse:
    return await build_screenshot_plan(body)


@router.post("/plan/dom", response_model=DomPlanResponse)
async def post_work_guide_plan_dom(body: DomPlanRequest) -> DomPlanResponse:
    return await build_dom_plan(body)


@router.post("/logs/confirm")
async def post_work_guide_confirm_log(body: WorkGuideLogRequest) -> dict:
    item = append_confirm_log(body)
    return {"ok": True, "item": item.model_dump()}


@router.get("/logs")
async def get_work_guide_logs(limit: int = 100) -> dict:
    return {"items": [row.model_dump() for row in list_logs(limit)]}


