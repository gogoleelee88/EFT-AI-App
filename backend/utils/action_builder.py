"""액션 생성 유틸리티"""
from typing import List, Dict, Any
import re

def should_ask_suds(message: str, meta: Dict[str, Any]) -> bool:
    """SUDS 측정 요청 필요 여부 판단(자연스러운 대화 흐름 반영)"""
    raw = (message or "").strip()
    msg = raw.lower()

    # 1) 숫자만 입력 (0~10)
    if re.fullmatch(r"\s*(?:10|[0-9])\s*", msg):
        return True

    # 2) EFT 시작 의사/가이드 요청
    eft_triggers = ["eft", "탭핑", "두드리기", "시작하고 싶", "시작해보", "해보고 싶", "첫 단계", "어떡게 시작", "안내해줘"]
    if any(kw in msg for kw in eft_triggers):
        return True

    # 3) 감정 고조 + 도움/가이드 요청 동시
    emotion_kw = ["불안", "초조", "긴장", "짜증", "화가", "우울", "답답", "막막", "서럽", "눈물", "두근", "공황", "패닉"]
    help_kw = ["도와줘", "도움", "가라앉히", "진정", "뭐부터", "어떻게 해야", "어떻게 해"]
    if any(k in raw for k in emotion_kw) and any(k in raw for k in help_kw):
        return True

    # 4) 기존 SUDS/점수 직접 언급
    if any(kw in msg for kw in ["suds", "점수", "평가", "몇 점", "기분", "감정"]):
        return True

    # 5) 메타 플래그
    if (meta or {}).get("request_suds"):
        return True

    return False

def build_actions(message: str, meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    """메시지와 메타데이터 기반 액션 리스트 생성"""
    result: List[Dict[str, Any]] = []
    try:
        if should_ask_suds(message, meta):
            result.append({"type": "ask_suds", "payload": {"measurement_type": "check"}})
    except Exception:
        return []
    return result
