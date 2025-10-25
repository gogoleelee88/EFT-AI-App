"""액션 생성 유틸리티

부정적 감정 감지 시 SUDS 측정 요청 액션 생성.
문자열 정규화를 통한 안정적인 감정 매칭.
"""

from typing import List, Dict, Any
import logging
from .text_norm import normalize_text

logger = logging.getLogger(__name__)


# 원본 부정적 감정 목록 (표제어 + 흔한 변형)
_NEGATIVE_EMOTIONS_RAW = {
    # 영문
    "sadness", "anger", "fear", "disgust",
    "stress", "anxiety", "loneliness", "frustration",
    # 한글 표제어
    "슬픔", "분노", "두려움", "혐오",
    "스트레스", "불안", "외로움", "좌절",
    # 한글 일상 표현 변형
    "외롭다", "외로워", "외롭고",
    "불안함", "불안하다", "불안해",
    "두렵다", "두려워",
    "짜증", "짜증남", "짜증나",
}

# 정규화된 형태로 비교용 세트 구성
NEGATIVE_EMOTIONS = {normalize_text(e) for e in _NEGATIVE_EMOTIONS_RAW}

# 모듈 로드 확인
logger.info(f"[ACTION_BUILDER] Loaded with {len(NEGATIVE_EMOTIONS)} normalized negative emotions")


def _to_plain_dict(obj: Any) -> Dict[str, Any]:
    """Pydantic 모델이나 객체를 일반 딕셔너리로 변환

    Args:
        obj: 변환할 객체 (dict, Pydantic 모델, 기타 객체)

    Returns:
        평탄화된 딕셔너리
    """
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj

    # Pydantic v2
    if hasattr(obj, "model_dump"):
        return obj.model_dump()

    # Pydantic v1
    if hasattr(obj, "dict"):
        return obj.dict()

    # 최후 수단: 속성 기반 변환
    try:
        return {k: getattr(obj, k) for k in dir(obj) if not k.startswith("_")}
    except Exception:
        return {}


def should_ask_suds(message: str, meta: Dict[str, Any]) -> bool:
    """SUDS 측정 요청 필요 여부 판단

    규칙:
        1) emotion_analysis.primary_emotion이 부정적 감정이고 intensity >= 0.4 → True
        2) (백업) message에 부정 감정 키워드 포함 → True
        3) 그 외 → False

    Args:
        message: 사용자 메시지
        meta: 메타데이터 (emotion_analysis 포함)

    Returns:
        SUDS 측정 필요 여부
    """
    # emotion_analysis를 안전하게 딕셔너리로 변환
    emotion_analysis = _to_plain_dict(meta.get("emotion_analysis"))

    # 감정과 강도 추출 및 정규화
    primary = normalize_text(emotion_analysis.get("primary_emotion"))
    intensity = float(emotion_analysis.get("intensity", 0) or 0)

    # 규칙 1: 부정 감정 + 충분한 강도
    if primary in NEGATIVE_EMOTIONS and intensity >= 0.4:
        logger.info(f"✅ SUDS trigger: emotion='{primary}', intensity={intensity:.2f}")
        return True

    # 규칙 2 (백업): 메시지 자체에 부정 감정 키워드 포함
    msg_norm = normalize_text(message)
    for keyword in NEGATIVE_EMOTIONS:
        if keyword in msg_norm:
            logger.info(f"✅ SUDS trigger (fallback): keyword='{keyword}' in message")
            return True

    logger.debug(f"⏭️  SUDS skip: emotion='{primary}', intensity={intensity:.2f}")
    return False


def build_actions(message: str, meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    """메시지와 메타데이터 기반 액션 리스트 생성

    Args:
        message: 사용자 메시지
        meta: 메타데이터

    Returns:
        액션 리스트
    """
    try:
        if should_ask_suds(message, meta):
            return [{"type": "ask_suds", "payload": {"measurement_type": "check"}}]
        return []
    except Exception as e:
        logger.exception(f"❌ build_actions error: {e}")
        return []
