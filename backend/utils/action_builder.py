"""액션 생성 유틸리티

부정적 감정 감지 시 SUDS 측정 요청 액션 생성.
문자열 정규화를 통한 안정적인 감정 매칭.
"""

from typing import List, Dict, Any
import logging
from .text_norm import normalize_text
from backend.models.chat_models import EmotionType
from utils.suds_helpers import _maybe_emit_ask_suds

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
    "화", "화나", "화남", "화가", "화나다",
}

# 정규화된 형태로 비교용 세트 구성
NEGATIVE_EMOTIONS = {normalize_text(e) for e in _NEGATIVE_EMOTIONS_RAW}

# 부정적 감정 타입 (EmotionType 기반)
NEGATIVE_EMOTION_TYPES = {
    EmotionType.SADNESS,
    EmotionType.ANGER,
    EmotionType.FEAR,
    EmotionType.DISGUST,
    EmotionType.STRESS,
    EmotionType.ANXIETY,
    EmotionType.LONELINESS,
    EmotionType.FRUSTRATION,
}

# 감정별 맞춤 조언
EMOTION_ADVICE = {
    EmotionType.ANGER: {
        "emotion_name": "분노",
        "advice": "분노는 강한 에너지를 동반하는 감정입니다. EFT 탭핑을 통해 이 에너지를 건강하게 방출할 수 있습니다.",
        "focus": "감정의 에너지 방출"
    },
    EmotionType.SADNESS: {
        "emotion_name": "슬픔",
        "advice": "슬픔은 자연스러운 감정입니다. EFT를 통해 이 감정을 받아들이고 치유할 수 있습니다.",
        "focus": "감정 수용과 치유"
    },
    EmotionType.ANXIETY: {
        "emotion_name": "불안",
        "advice": "불안할 때는 호흡과 함께 EFT 탭핑을 하면 긴장이 풀립니다.",
        "focus": "긴장 완화와 안정"
    },
    EmotionType.STRESS: {
        "emotion_name": "스트레스",
        "advice": "누적된 스트레스는 EFT로 단계적으로 해소할 수 있습니다.",
        "focus": "누적된 긴장 해소"
    },
    EmotionType.FEAR: {
        "emotion_name": "두려움",
        "advice": "두려움을 직면하는 것이 첫걸음입니다. EFT가 그 과정을 도와드립니다.",
        "focus": "두려움 직면과 극복"
    },
    EmotionType.LONELINESS: {
        "emotion_name": "외로움",
        "advice": "외로울 때 자기 자신과 연결되는 것이 중요합니다. EFT가 자기 위로를 도와드립니다.",
        "focus": "자기 연결과 위로"
    },
    EmotionType.FRUSTRATION: {
        "emotion_name": "좌절",
        "advice": "좌절감은 막힌 에너지입니다. EFT로 이 막힘을 풀어줄 수 있습니다.",
        "focus": "막힌 에너지 해소"
    },
    EmotionType.DISGUST: {
        "emotion_name": "혐오",
        "advice": "불편한 감정을 인정하고 EFT로 정화할 수 있습니다.",
        "focus": "감정 정화"
    },
}

# 모듈 로드 확인
logger.info(f"[ACTION_BUILDER] Loaded with {len(NEGATIVE_EMOTIONS)} normalized negative emotions")
logger.info(f"[ACTION_BUILDER] EmotionType-based advice for {len(EMOTION_ADVICE)} emotions")


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


def should_suggest_eft(message: str, meta: Dict[str, Any]) -> tuple[bool, Dict[str, Any]]:
    """EFT 제안 필요 여부 및 감정 정보 반환

    규칙:
        1) EmotionAnalyzer의 emotion_analysis가 있으면 우선 사용
        2) 부정적 감정이면 True + 감정 정보
        3) (백업) 메시지에 부정 감정 키워드 포함 → True + 기본 정보
        4) 그 외 → False + 빈 정보

    Args:
        message: 사용자 메시지
        meta: 메타데이터 (emotion_analysis 포함)

    Returns:
        (EFT 제안 필요 여부, 감정 정보 딕셔너리)
    """
    emotion_info = {}

    # 규칙 1: EmotionAnalyzer 결과 우선 사용
    emotion_analysis = meta.get("emotion_analysis")
    if emotion_analysis:
        # Pydantic 모델인 경우 처리
        if hasattr(emotion_analysis, 'primary_emotion'):
            primary_emotion = emotion_analysis.primary_emotion
            intensity = getattr(emotion_analysis, 'intensity', None) or 0.0
            confidence = getattr(emotion_analysis, 'confidence', None) or 0.0

            # 부정적 감정이면 제안
            if primary_emotion in NEGATIVE_EMOTION_TYPES:
                clamped_intensity = max(0.0, min(1.0, float(intensity)))
                clamped_confidence = max(0.0, min(1.0, float(confidence)))

                # 감정별 맞춤 조언 생성
                advice_data = EMOTION_ADVICE.get(primary_emotion, {
                    "emotion_name": str(primary_emotion.value),
                    "advice": "EFT 탭핑을 통해 감정을 조절할 수 있습니다.",
                    "focus": "감정 조절"
                })

                emotion_info = {
                    "emotion": advice_data["emotion_name"],
                    "emotion_type": primary_emotion.value,
                    "intensity": round(clamped_intensity, 2),
                    "confidence": round(clamped_confidence, 2),
                    "advice": advice_data["advice"],
                    "focus": advice_data["focus"],
                    "detected_by": "EmotionAnalyzer"
                }

                logger.info(
                    "✅ EFT 제안: %s (강도: %.2f, 신뢰도: %.2f)",
                    emotion_info['emotion'],
                    clamped_intensity,
                    clamped_confidence,
                )
                return True, emotion_info

    # 규칙 2 (백업): 메시지에 키워드 포함
    msg_norm = normalize_text(message)
    for keyword in NEGATIVE_EMOTIONS:
        if keyword in msg_norm:
            emotion_info = {
                "emotion": "부정적 감정",
                "keyword": keyword,
                "advice": "감지된 부정적 감정에 대해 EFT 탭핑을 시도해보세요.",
                "detected_by": "keyword_matching"
            }
            logger.info(f"✅ EFT 제안 (백업): keyword='{keyword}' in message")
            return True, emotion_info

    logger.debug("⏭️ EFT 제안 스킵: 부정적 감정 감지 안 됨")
    return False, {}


def build_actions(message: str, meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    """메시지와 메타데이터 기반 액션 리스트 생성

    흐름:
        1. EmotionAnalyzer로 감정 분석
        2. 부정적 감정 감지 → suggest_eft (감정별 맞춤 조언 포함)
        3. SUDS 측정은 별도 (_maybe_emit_ask_suds)

    Args:
        message: 사용자 메시지
        meta: 메타데이터 (emotion_analysis 포함)

    Returns:
        액션 리스트 (감정 정보 및 맞춤 조언 포함)
    """
    try:
        logger.info(f"[BuildActions] 호출됨 - message: '{message[:30]}', meta keys: {list(meta.keys())}")

        actions: List[Dict[str, Any]] = []

        # EFT 제안 필요 여부 확인 + 감정 정보 받기
        should_suggest, emotion_info = should_suggest_eft(message, meta)

        if should_suggest:
            payload = {
                "reason": "negative_emotion_detected",
                **emotion_info,
            }
            logger.info(
                "[BuildActions] ✅ suggest_eft 액션 생성! 감정: %s",
                emotion_info.get("emotion", "N/A"),
            )
            actions.insert(0, {"type": "suggest_eft", "payload": payload})
        else:
            logger.info("[BuildActions] ⚠️ 부정적 감정 감지 안 됨")

        assistant_text = None
        if isinstance(meta, dict):
            assistant_text = meta.get("assistant_text")

        ask = _maybe_emit_ask_suds(user_text=message, assistant_text=assistant_text)
        if ask and not any(
            isinstance(a, dict) and a.get("type") == "ask_suds" for a in actions
        ):
            actions.append(ask)

        return actions
    except Exception as e:
        logger.exception(f"build_actions error: {e}")
        return []
