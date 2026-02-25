"""
YouTube recommendation schema for meditation candidates.
"""
from __future__ import annotations

from typing import List
from pydantic import BaseModel, Field


class YouTubeCandidate(BaseModel):
    video_id: str = Field(..., description="YouTube video ID")
    title: str = Field(..., description="Video title")
    channel_title: str = Field(..., description="Channel title")
    duration_sec: int = Field(..., ge=0, description="Duration in seconds")
    url: str = Field(..., description="Embed-ready URL")
    thumbnail_url: str = Field(..., description="Thumbnail URL")
    reason: str = Field(..., description="Recommendation rationale")
    tags: List[str] = Field(default_factory=list, description="Keyword tags")
