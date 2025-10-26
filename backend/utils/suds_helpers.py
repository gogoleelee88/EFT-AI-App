from __future__ import annotations
import re
from typing import Dict, Any, Optional

_PAT_KO_CUE = re.compile(r"(0\s*~\s*10|0\s*-\s*10|점수|평가|수치|몇\s*점)", re.IGNORECASE)

def _maybe_emit_ask_suds(*, user_text: str, assistant_text: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    AI 응답/사용자 텍스트에 0~10 점수 유도 신호가 보이면 ask_suds 액션을 생성한다.
    프론트 미구현 상황에서도 안전하게 뜨도록 배너 기본 UI를 포함한다.
    """
    u = (user_text or "").strip()
    a = (assistant_text or "").strip()
    trigger = (
        ("0" in a and "10" in a) or
        bool(_PAT_KO_CUE.search(a)) or
        bool(_PAT_KO_CUE.search(u))
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
