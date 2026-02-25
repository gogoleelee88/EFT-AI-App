"""
YouTube meditation recommendation service.
Phase 1: curated list fallback (local JSON).
Phase 2: YouTube Data API fetch when API key is configured.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import httpx

from config.settings import get_settings
from backend.models.chat_models import StrictIntakeInput


_CACHE_TTL_SEC = 24 * 60 * 60
_CACHE: Dict[str, tuple[float, List[Dict[str, Any]]]] = {}

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "youtube_meditations.json"


def _extract_keywords(intake: StrictIntakeInput) -> List[str]:
    raw_parts = [
        intake.core_emotion or "",
        intake.situation_context or "",
        intake.automatic_thought or "",
        intake.immediate_goal or "",
    ]
    raw = " ".join(p for p in raw_parts if p)
    tokens = re.findall(r"[A-Za-z0-9]{2,}", raw.lower())
    keywords: List[str] = []
    for token in tokens:
        if token not in keywords:
            keywords.append(token)
        if len(keywords) >= 6:
            break
    if intake.core_emotion:
        core = intake.core_emotion.strip().lower()
        if core and core not in keywords:
            keywords.insert(0, core)
    return keywords[:6]


def _build_cache_key(theme_id: str, bucket: int, keywords: Sequence[str]) -> str:
    seed = ",".join(keywords[:4])
    return f"{theme_id}|{bucket}|{seed}"


def _get_cached(key: str) -> Optional[List[Dict[str, Any]]]:
    cached = _CACHE.get(key)
    if not cached:
        return None
    expires_at, value = cached
    if time.time() >= expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def _set_cache(key: str, value: List[Dict[str, Any]]) -> None:
    _CACHE[key] = (time.time() + _CACHE_TTL_SEC, value)


def _load_curated() -> List[Dict[str, Any]]:
    if not _DATA_PATH.exists():
        return []
    try:
        with _DATA_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        return []
    return []


def _normalize_candidate(raw: Dict[str, Any], reason: str) -> Optional[Dict[str, Any]]:
    video_id = str(raw.get("video_id", "")).strip()
    if not video_id:
        return None
    duration_sec = int(raw.get("duration_sec", 0) or 0)
    title = str(raw.get("title", "")).strip()
    channel_title = str(raw.get("channel_title", "")).strip()
    tags = raw.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    return {
        "video_id": video_id,
        "title": title or "Untitled",
        "channel_title": channel_title or "Unknown",
        "duration_sec": duration_sec,
        "url": f"https://www.youtube.com/embed/{video_id}",
        "thumbnail_url": raw.get("thumbnail_url")
        or f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
        "reason": reason,
        "tags": [str(t) for t in tags],
    }


def _score_curated(
    item: Dict[str, Any],
    theme_id: str,
    bucket: int,
    keywords: Sequence[str],
) -> int:
    score = 0
    if item.get("theme_id") == theme_id:
        score += 3
    if int(item.get("duration_bucket", 0) or 0) == bucket:
        score += 2
    if keywords:
        tags = {str(t).lower() for t in (item.get("tags") or [])}
        if tags.intersection({k.lower() for k in keywords if k}):
            score += 1
    return score


def _select_curated(
    theme_id: str,
    bucket: int,
    keywords: Sequence[str],
    limit: int,
) -> List[Dict[str, Any]]:
    raw_items = _load_curated()
    if not raw_items:
        return []
    scored = [
        (_score_curated(item, theme_id, bucket, keywords), item)
        for item in raw_items
    ]
    scored.sort(key=lambda x: (-x[0], str(x[1].get("title", ""))))
    selected = [item for score, item in scored if score > 0]
    if not selected:
        selected = [item for _, item in scored]
    reason = f"curated match: theme={theme_id} bucket={bucket}m"
    output: List[Dict[str, Any]] = []
    for item in selected[:limit]:
        normalized = _normalize_candidate(item, reason=reason)
        if normalized:
            output.append(normalized)
    return output


def _duration_filter(bucket: int) -> str:
    if bucket <= 5:
        return "short"
    if bucket <= 20:
        return "medium"
    return "long"


def _parse_iso_duration(value: str) -> int:
    match = re.fullmatch(
        r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or ""
    )
    if not match:
        return 0
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


async def _fetch_from_youtube_api(
    intake: StrictIntakeInput,
    theme_id: str,
    bucket: int,
    keywords: Sequence[str],
    limit: int,
) -> Optional[List[Dict[str, Any]]]:
    settings = get_settings()
    api_key = getattr(settings, "YOUTUBE_API_KEY", None)
    if not api_key:
        return None

    query_parts = ["meditation", theme_id.replace("_", " ")]
    if intake.core_emotion:
        query_parts.append(intake.core_emotion)
    if keywords:
        query_parts.append(keywords[0])
    query = " ".join(query_parts)

    search_params = {
        "part": "snippet",
        "type": "video",
        "maxResults": limit,
        "q": query,
        "videoDuration": _duration_filter(bucket),
        "key": api_key,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            search_resp = await client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params=search_params,
            )
            if search_resp.status_code != 200:
                return None
            search_data = search_resp.json()
            items = search_data.get("items") or []
            video_ids = [
                item.get("id", {}).get("videoId")
                for item in items
                if item.get("id", {}).get("videoId")
            ]
            if not video_ids:
                return []

            videos_resp = await client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "part": "snippet,contentDetails",
                    "id": ",".join(video_ids),
                    "key": api_key,
                },
            )
            if videos_resp.status_code != 200:
                return None
            videos_data = videos_resp.json()
            output: List[Dict[str, Any]] = []
            for item in videos_data.get("items") or []:
                vid = item.get("id")
                snippet = item.get("snippet") or {}
                content = item.get("contentDetails") or {}
                duration_sec = _parse_iso_duration(content.get("duration", ""))
                candidate = {
                    "video_id": vid,
                    "title": snippet.get("title", "") or "Untitled",
                    "channel_title": snippet.get("channelTitle", "") or "Unknown",
                    "duration_sec": duration_sec,
                    "thumbnail_url": (
                        (snippet.get("thumbnails") or {})
                        .get("high", {})
                        .get("url")
                    ),
                    "tags": snippet.get("tags") or [],
                }
                normalized = _normalize_candidate(
                    candidate,
                    reason="youtube_api",
                )
                if normalized:
                    output.append(normalized)
            return output[:limit]
        except Exception:
            return None


async def recommend_youtube_meditations(
    intake: StrictIntakeInput,
    selected_theme_id: str,
    preferred_duration_bucket: int,
    limit: int = 8,
) -> List[Dict[str, Any]]:
    keywords = _extract_keywords(intake)
    cache_key = _build_cache_key(
        selected_theme_id,
        preferred_duration_bucket,
        keywords,
    )
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    api_candidates = await _fetch_from_youtube_api(
        intake,
        selected_theme_id,
        preferred_duration_bucket,
        keywords,
        limit,
    )
    if api_candidates is not None and len(api_candidates) > 0:
        _set_cache(cache_key, api_candidates[:limit])
        return api_candidates[:limit]

    curated = _select_curated(
        selected_theme_id,
        preferred_duration_bucket,
        keywords,
        limit,
    )
    _set_cache(cache_key, curated[:limit])
    return curated[:limit]


