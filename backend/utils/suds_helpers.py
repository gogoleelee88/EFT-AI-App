from __future__ import annotations

import re
from typing import Any, Dict, Optional

_PAT_KO_CUE = re.compile(r"(0\s*~\s*10|0\s*-\s*10|점수|평가|수치|몇\s*점)", re.IGNORECASE)
_PAT_NUMERIC_SUDS = re.compile(r"^\s*(\d{1,2}(?:\.\d+)?)\s*$")


def is_suds_numeric_response(text: Optional[str]) -> bool:
    if not text:
        return False
    match = _PAT_NUMERIC_SUDS.match(text)
    if not match:
        return False
    try:
        value = float(match.group(1))
    except (TypeError, ValueError):
        return False
    return 0.0 <= value <= 10.0


def _maybe_emit_ask_suds(*, user_text: str, assistant_text: Optional[str]) -> Optional[Dict[str, Any]]:
    """사용자/어시스턴트 텍스트에서 SUDS 측정 유도 신호를 감지하여 배너 액션을 생성."""
    u = (user_text or "").strip()
    if is_suds_numeric_response(u):
        return None
    a = (assistant_text or "").strip()
    trigger = (
        ("0" in a and "10" in a)
        or bool(_PAT_KO_CUE.search(a))
        or bool(_PAT_KO_CUE.search(u))
    )
    if not trigger:
        return None
    return {
        "type": "ask_suds",
        "payload": {
            "measurement_type": "check",
            "ui": "banner",
            "title": "지금 느낌을 0~10으로 평가해 볼까요?",
            "message": "0은 전혀 불편하지 않음, 10은 가장 심함을 뜻해요.",
            "ctaLabel": "지금 평가하기",
            "scale_min": 0,
            "scale_max": 10,
        },
    }
