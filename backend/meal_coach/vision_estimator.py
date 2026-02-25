from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

from openai import AsyncOpenAI

from config.settings import get_settings

logger = logging.getLogger(__name__)

MAX_IMAGES_PER_REQUEST = 3

_PROMPT = (
    "You are a nutrition estimation assistant for meal photos. "
    "Estimate total meal nutrition for the provided photos. "
    "Return compact JSON only."
)


@dataclass(frozen=True)
class MealVisionPhoto:
    content: bytes
    content_type: str


def _as_str_list(value: Any, *, max_items: int = 6) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        text = str(item).strip()
        if text:
            out.append(text)
        if len(out) >= max_items:
            break
    return out


def _as_int(value: Any, default: int, min_value: int, max_value: int) -> int:
    try:
        n = int(round(float(value)))
    except Exception:
        n = default
    return max(min_value, min(max_value, n))


def _as_float(value: Any, default: float, min_value: float, max_value: float) -> float:
    try:
        n = float(value)
    except Exception:
        n = default
    if n < min_value:
        return float(min_value)
    if n > max_value:
        return float(max_value)
    return float(n)


def _response_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "nutrition": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "calories": {"type": "number"},
                    "carbs_g": {"type": "number"},
                    "protein_g": {"type": "number"},
                    "fat_g": {"type": "number"},
                    "sodium_mg": {"type": "number"},
                },
                "required": ["calories", "carbs_g", "protein_g", "fat_g", "sodium_mg"],
            },
            "labels": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 6,
            },
            "confidence": {"type": "number"},
            "uncertainty_reason": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 5,
            },
            "source_refs": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 5,
            },
        },
        "required": ["nutrition", "labels", "confidence", "uncertainty_reason", "source_refs"],
    }


def _resolve_model() -> str:
    env_model = (os.getenv("MEAL_COACH_VISION_MODEL") or "").strip()
    if env_model:
        return env_model
    settings_model = (get_settings().OPENAI_MODEL or "").strip()
    if settings_model:
        return settings_model
    return "gpt-5.2"


def _get_client() -> AsyncOpenAI | None:
    settings = get_settings()
    api_key = (settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return None
    timeout_sec = _as_float(os.getenv("MEAL_COACH_VISION_TIMEOUT_SEC"), 45.0, 5.0, 120.0)
    return AsyncOpenAI(api_key=api_key, timeout=timeout_sec)


async def estimate_nutrition_from_meal_photos(photos: list[MealVisionPhoto]) -> dict[str, Any] | None:
    if not photos:
        return None

    client = _get_client()
    if client is None:
        return None

    content: list[dict[str, Any]] = [{"type": "input_text", "text": _PROMPT}]
    for idx, photo in enumerate(photos[:MAX_IMAGES_PER_REQUEST], start=1):
        if not photo.content:
            continue
        mime = (photo.content_type or "image/jpeg").strip().lower()
        if not mime.startswith("image/"):
            mime = "image/jpeg"
        encoded = base64.b64encode(photo.content).decode("ascii")
        content.append({"type": "input_text", "text": f"photo_{idx}"})
        content.append({"type": "input_image", "image_url": f"data:{mime};base64,{encoded}"})

    if len(content) <= 1:
        return None

    model_name = _resolve_model()
    try:
        response = await client.responses.create(
            model=model_name,
            input=[{"role": "user", "content": content}],
            max_output_tokens=600,
            temperature=0.2,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "meal_photo_nutrition",
                    "schema": _response_schema(),
                    "strict": True,
                }
            },
        )
        raw_output = (response.output_text or "").strip()
        if not raw_output:
            logger.warning("Responses API returned empty output_text for meal photo estimate")
            return None
        parsed = json.loads(raw_output)
        if not isinstance(parsed, dict):
            return None
        nutrition_raw = parsed.get("nutrition")
        if not isinstance(nutrition_raw, dict):
            return None
    except Exception:
        logger.exception("Responses API meal photo estimation failed")
        return None

    nutrition = {
        "calories": _as_int(nutrition_raw.get("calories"), 0, 0, 5000),
        "carbs_g": round(_as_float(nutrition_raw.get("carbs_g"), 0.0, 0.0, 600.0), 1),
        "protein_g": round(_as_float(nutrition_raw.get("protein_g"), 0.0, 0.0, 400.0), 1),
        "fat_g": round(_as_float(nutrition_raw.get("fat_g"), 0.0, 0.0, 300.0), 1),
        "sodium_mg": round(_as_float(nutrition_raw.get("sodium_mg"), 0.0, 0.0, 12000.0), 1),
    }
    labels = _as_str_list(parsed.get("labels"), max_items=6) or ["balanced_range"]
    uncertainty = _as_str_list(parsed.get("uncertainty_reason"), max_items=5)
    source_refs = _as_str_list(parsed.get("source_refs"), max_items=5) or ["openai_responses_vision"]
    confidence = round(_as_float(parsed.get("confidence"), 0.55, 0.0, 1.0), 2)

    return {
        "track_used": "B",
        "nutrition": nutrition,
        "labels": labels,
        "confidence": confidence,
        "uncertainty_reason": uncertainty,
        "source_refs": source_refs,
        "versions": {
            "engine_version": "nutri-responses-vision-1.0.0",
            "model_version": model_name[:64],
            "prompt_version": "meal_photo_v1",
            "dataset_version": "vision_live_2026_02",
        },
    }

