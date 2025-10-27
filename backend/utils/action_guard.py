from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Tuple

REQUIRED_TYPE_ACTIONS = {"ask_suds", "suggest_eft", "start_eftar"}


def normalize_action(a: Any) -> Dict[str, Any] | None:
    """
    Normalize a single action object.

    - drop anything that is not a dict
    - drop if "type" missing or blank
    - ensure payload exists (defaults to {})
    - provide banner defaults for ask_suds actions
    """

    if not isinstance(a, dict):
        return None
    t = a.get("type")
    if not isinstance(t, str) or not t.strip():
        return None

    payload = a.get("payload") or {}
    normalized = {"type": t.strip(), "payload": payload}

    if normalized["type"] == "ask_suds":
        p = normalized["payload"]
        p.setdefault("ui", "banner")
        p.setdefault("title", "지금 느낌을 0~10으로 평가해 볼까요?")
        p.setdefault("message", "0은 전혀 불편하지 않음, 10은 가장 심함을 뜻해요.")
        p.setdefault("ctaLabel", "지금 평가하기")
        p.setdefault("scale_min", 0)
        p.setdefault("scale_max", 10)
        p.setdefault("measurement_type", "check")

    return normalized


def guard_actions(actions: List[Any]) -> Tuple[List[Dict[str, Any]], str]:
    """Normalize actions list and compute a hash signature."""

    normalized: List[Dict[str, Any]] = []
    for action in actions or []:
        norm = normalize_action(action)
        if norm:
            normalized.append(norm)

    raw = json.dumps(normalized, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    signature = hashlib.sha256(raw).hexdigest()[:16]
    return normalized, signature
