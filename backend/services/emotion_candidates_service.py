from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel

from config.settings import get_settings
from utils.logger import get_logger

logger = get_logger(__name__)


class EmotionCandidate(BaseModel):
    label: str
    reason: str
    confidence: float


_ALLOWED_EMOTIONS: List[str] = [
    "anxiety",
    "worry",
    "tension",
    "fear",
    "pressure",
    "uncertainty",
    "impatience",
    "anger",
    "irritation",
    "annoyance",
    "resentment",
    "sadness",
    "loneliness",
    "emptiness",
    "fatigue",
    "helplessness",
    "shame",
    "guilt",
    "mixed/unsure",
]


SYSTEM_PROMPT = (
    "You suggest up to 3 candidate emotions from user context. "
    "Do not diagnose. Return JSON only in this shape: "
    '{"candidates":[{"label":"...", "reason":"...", "confidence":0.0}]}. '
    "Use labels from this list only: "
    + ", ".join(_ALLOWED_EMOTIONS)
)


def _normalize_engine(engine: str) -> str:
    value = (engine or "b").strip().lower()
    return "a" if value == "a" else "b"


def _chat_completions_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _engine_target(engine: str) -> tuple[str, str]:
    settings = get_settings()
    normalized = _normalize_engine(engine)
    if normalized == "a":
        url = _chat_completions_url(settings.VLLM_ENGINE_A_URL)
        model = str(settings.FREE_ENGINES.get("engine_a", {}).get("model", "engine-a"))
        return url, model
    url = _chat_completions_url(settings.VLLM_ENGINE_B_URL)
    model = str(settings.FREE_ENGINES.get("engine_b", {}).get("model", "engine-b"))
    return url, model


def _try_parse_json(raw: str) -> Optional[Dict[str, Any]]:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return None


def _coerce_candidates(payload: Dict[str, Any]) -> Optional[List[EmotionCandidate]]:
    items = payload.get("candidates")
    if not isinstance(items, list) or not items:
        return None

    out: List[EmotionCandidate] = []
    for item in items[:3]:
        if not isinstance(item, dict):
            continue

        label = str(item.get("label", "")).strip() or "mixed/unsure"
        reason = str(item.get("reason", "")).strip() or "Context suggests this may fit."

        try:
            confidence = float(item.get("confidence", 0.5))
        except Exception:
            confidence = 0.5
        confidence = max(0.0, min(1.0, confidence))

        out.append(EmotionCandidate(label=label, reason=reason, confidence=confidence))

    return out or None


async def get_emotion_candidates(
    user_input: str,
    strict6_output: Dict[str, Any],
    engine: str = "b",
) -> Optional[List[EmotionCandidate]]:
    """Request candidate emotions from the configured OpenAI-compatible engine."""
    target_url, model = _engine_target(engine)

    user_content = (
        "Input:\n"
        f"{(user_input or '').strip()}\n\n"
        "STRICT6 JSON:\n"
        f"{json.dumps(strict6_output or {}, ensure_ascii=False)}"
    )

    payload = {
        "model": model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(target_url, json=payload)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        logger.warning("emotion-candidates request failed: %s", exc)
        return None

    raw_content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    parsed = _try_parse_json(raw_content)
    if parsed is None:
        return None
    return _coerce_candidates(parsed)


