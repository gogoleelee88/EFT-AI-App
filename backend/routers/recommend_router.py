from __future__ import annotations

from typing import List, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.models.chat_models import StrictIntakeInput
from services.youtube_recommendation_service import recommend_youtube_meditations
from backend.types.youtube_schema import YouTubeCandidate

router = APIRouter(prefix="/api/recommend", tags=["recommend"])


class YouTubeRecommendRequest(BaseModel):
    intake: StrictIntakeInput = Field(..., description="STRICT intake payload")
    selected_theme_id: str = Field(..., description="Selected theme id")
    preferred_duration_bucket: Literal[5, 10, 20, 30] = Field(
        ..., description="Preferred duration bucket in minutes"
    )


class YouTubeRecommendResponse(BaseModel):
    candidates: List[YouTubeCandidate] = Field(default_factory=list)


@router.post("/youtube_meditations", response_model=YouTubeRecommendResponse)
async def recommend_youtube_meditations_endpoint(req: YouTubeRecommendRequest) -> YouTubeRecommendResponse:
    candidates = await recommend_youtube_meditations(
        intake=req.intake,
        selected_theme_id=req.selected_theme_id,
        preferred_duration_bucket=req.preferred_duration_bucket,
        limit=8,
    )
    return YouTubeRecommendResponse(candidates=candidates)


