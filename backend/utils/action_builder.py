"""?¡ì…˜ ?ì„± ? í‹¸ë¦¬í‹°

ë¶€?•ì  ê°ì • ê°ì? ??SUDS ì¸¡ì • ?”ì²­ ?¡ì…˜ ?ì„±.
ë¬¸ì???•ê·œ?”ë? ?µí•œ ?ˆì •?ì¸ ê°ì • ë§¤ì¹­.
"""

from typing import List, Dict, Any
import logging
from .text_norm import normalize_text
from models.chat_models import EmotionType
from utils.suds_helpers import _maybe_emit_ask_suds

logger = logging.getLogger(__name__)


# ?ë³¸ ë¶€?•ì  ê°ì • ëª©ë¡ (?œì œ??+ ?”í•œ ë³€??
_NEGATIVE_EMOTIONS_RAW = {
    # ?ë¬¸
    "sadness", "anger", "fear", "disgust",
    "stress", "anxiety", "loneliness", "frustration",
    # ?œê? ?œì œ??    "?¬í””", "ë¶„ë…¸", "?ë ¤?€", "?ì˜¤",
    "?¤íŠ¸?ˆìŠ¤", "ë¶ˆì•ˆ", "?¸ë¡œ?€", "ì¢Œì ˆ",
    # ?œê? ?¼ìƒ ?œí˜„ ë³€??    "?¸ë¡­??, "?¸ë¡œ??, "?¸ë¡­ê³?,
    "ë¶ˆì•ˆ??, "ë¶ˆì•ˆ?˜ë‹¤", "ë¶ˆì•ˆ??,
    "?ë µ??, "?ë ¤??,
    "ì§œì¦", "ì§œì¦??, "ì§œì¦??,
    "??, "?”ë‚˜", "?”ë‚¨", "?”ê?", "?”ë‚˜??,
    "?˜ë“¤??, "?˜ë“¤??, "?˜ë“¤?´ìš”", "?˜ë“¤ê³?,
    "?°ìš¸", "?°ìš¸??, "?°ìš¸?˜ë‹¤", "?°ìš¸?˜ê³ ",
    "?ìƒ??, "?ìƒ?˜ë‹¤", "?ìƒ?˜ê³ ",
    "ë¶ˆí¸??, "ë¶ˆí¸?˜ë‹¤", "ë¶ˆí¸?˜ê³ ",
    "ê±±ì •??, "ê±±ì •?¼ìš”", "ê±±ì •??, "ê±±ì •?˜ê³ ",
    "ê´´ë¡­??, "ê´´ë¡œ??, "ê´´ë¡œ?Œìš”",
    "?œëŸ½??, "?œëŸ¬??, "?œëŸ¬?Œìš”",
    "?µë‹µ??, "?µë‹µ?˜ë‹¤", "?µë‹µ?˜ê³ ",
}

# ?•ê·œ?”ëœ ?•íƒœë¡?ë¹„êµ???¸íŠ¸ êµ¬ì„±
NEGATIVE_EMOTIONS = {normalize_text(e) for e in _NEGATIVE_EMOTIONS_RAW}

# ë¶€?•ì  ê°ì • ?€??(EmotionType ê¸°ë°˜)
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

# ê°ì •ë³?ë§ì¶¤ ì¡°ì–¸
EMOTION_ADVICE = {
    EmotionType.ANGER: {
        "emotion_name": "ë¶„ë…¸",
        "advice": "ë¶„ë…¸??ê°•í•œ ?ë„ˆì§€ë¥??™ë°˜?˜ëŠ” ê°ì •?…ë‹ˆ?? EFT ??•‘???µí•´ ???ë„ˆì§€ë¥?ê±´ê°•?˜ê²Œ ë°©ì¶œ?????ˆìŠµ?ˆë‹¤.",
        "focus": "ê°ì •???ë„ˆì§€ ë°©ì¶œ"
    },
    EmotionType.SADNESS: {
        "emotion_name": "?¬í””",
        "advice": "?¬í””?€ ?ì—°?¤ëŸ¬??ê°ì •?…ë‹ˆ?? EFTë¥??µí•´ ??ê°ì •??ë°›ì•„?¤ì´ê³?ì¹˜ìœ ?????ˆìŠµ?ˆë‹¤.",
        "focus": "ê°ì • ?˜ìš©ê³?ì¹˜ìœ "
    },
    EmotionType.ANXIETY: {
        "emotion_name": "ë¶ˆì•ˆ",
        "advice": "ë¶ˆì•ˆ???ŒëŠ” ?¸í¡ê³??¨ê»˜ EFT ??•‘???˜ë©´ ê¸´ì¥???€ë¦½ë‹ˆ??",
        "focus": "ê¸´ì¥ ?„í™”?€ ?ˆì •"
    },
    EmotionType.STRESS: {
        "emotion_name": "?¤íŠ¸?ˆìŠ¤",
        "advice": "?„ì ???¤íŠ¸?ˆìŠ¤??EFTë¡??¨ê³„?ìœ¼ë¡??´ì†Œ?????ˆìŠµ?ˆë‹¤.",
        "focus": "?„ì ??ê¸´ì¥ ?´ì†Œ"
    },
    EmotionType.FEAR: {
        "emotion_name": "?ë ¤?€",
        "advice": "?ë ¤?€??ì§ë©´?˜ëŠ” ê²ƒì´ ì²«ê±¸?Œì…?ˆë‹¤. EFTê°€ ê·?ê³¼ì •???„ì??œë¦½?ˆë‹¤.",
        "focus": "?ë ¤?€ ì§ë©´ê³?ê·¹ë³µ"
    },
    EmotionType.LONELINESS: {
        "emotion_name": "?¸ë¡œ?€",
        "advice": "?¸ë¡œ?€???ë‚„ ???ê¸° ?ì‹ ê³??°ê²°?˜ëŠ” ê²ƒì´ ì¤‘ìš”?©ë‹ˆ?? EFTê°€ ?ê¸° ?„ë¡œë¥??„ì??œë¦½?ˆë‹¤.",
        "focus": "?ê¸° ?°ê²°ê³??„ë¡œ"
    },
    EmotionType.FRUSTRATION: {
        "emotion_name": "ì¢Œì ˆ",
        "advice": "ì¢Œì ˆê°ì? ë§‰íŒ ?ë„ˆì§€?…ë‹ˆ?? EFTë¡???ë§‰í˜???€?´ì¤„ ???ˆìŠµ?ˆë‹¤.",
        "focus": "ë§‰íŒ ?ë„ˆì§€ ?´ì†Œ"
    },
    EmotionType.DISGUST: {
        "emotion_name": "?ì˜¤",
        "advice": "ë¶ˆí¸??ê°ì •???¸ì •?˜ê³  EFTë¡??•í™”?????ˆìŠµ?ˆë‹¤.",
        "focus": "ê°ì • ?•í™”"
    },
}

# ëª¨ë“ˆ ë¡œë“œ ?•ì¸
logger.info(f"[ACTION_BUILDER] Loaded with {len(NEGATIVE_EMOTIONS)} normalized negative emotions")
logger.info(f"[ACTION_BUILDER] EmotionType-based advice for {len(EMOTION_ADVICE)} emotions")


def _to_plain_dict(obj: Any) -> Dict[str, Any]:
    """Pydantic ëª¨ë¸?´ë‚˜ ê°ì²´ë¥??¼ë°˜ ?•ì…”?ˆë¦¬ë¡?ë³€??
    Args:
        obj: ë³€?˜í•  ê°ì²´ (dict, Pydantic ëª¨ë¸, ê¸°í? ê°ì²´)

    Returns:
        ?‰íƒ„?”ëœ ?•ì…”?ˆë¦¬
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

    # ìµœí›„ ?˜ë‹¨: ?ì„± ê¸°ë°˜ ë³€??    try:
        return {k: getattr(obj, k) for k in dir(obj) if not k.startswith("_")}
    except Exception:
        return {}


def should_suggest_eft(message: str, meta: Dict[str, Any]) -> tuple[bool, Dict[str, Any]]:
    """EFT ?œì•ˆ ?„ìš” ?¬ë? ë°?ê°ì • ?•ë³´ ë°˜í™˜

    ê·œì¹™:
        1) EmotionAnalyzer??emotion_analysisê°€ ?ˆìœ¼ë©??°ì„  ?¬ìš©
        2) ë¶€?•ì  ê°ì •?´ë©´ ê°•ë„?€ ë¬´ê??˜ê²Œ True + ê°ì • ?•ë³´
        3) (ë°±ì—…) ë©”ì‹œì§€??ë¶€??ê°ì • ?¤ì›Œ???¬í•¨ ??True + ê¸°ë³¸ ?•ë³´
        4) ê·?????False + ë¹??•ë³´

    Args:
        message: ?¬ìš©??ë©”ì‹œì§€
        meta: ë©”í??°ì´??(emotion_analysis ?¬í•¨)

    Returns:
        (EFT ?œì•ˆ ?„ìš” ?¬ë?, ê°ì • ?•ë³´ ?•ì…”?ˆë¦¬)
    """
    emotion_info = {}

    # ê·œì¹™ 1: EmotionAnalyzer ê²°ê³¼ ?°ì„  ?¬ìš©
    emotion_analysis = meta.get("emotion_analysis")
    if emotion_analysis:
        # Pydantic ëª¨ë¸??ê²½ìš° ì²˜ë¦¬
        if hasattr(emotion_analysis, 'primary_emotion'):
            primary_emotion = emotion_analysis.primary_emotion
            intensity = getattr(emotion_analysis, 'intensity', None) or 0.0
            confidence = getattr(emotion_analysis, 'confidence', None) or 0.0

            # ë¶€?•ì  ê°ì •?´ë©´ ê°•ë„?€ ê´€ê³„ì—†???œì•ˆ (0~1 ë²”ìœ„ë¡??´ë¨??
            if primary_emotion in NEGATIVE_EMOTION_TYPES:
                clamped_intensity = max(0.0, min(1.0, float(intensity)))
                clamped_confidence = max(0.0, min(1.0, float(confidence)))

                # ê°ì •ë³?ë§ì¶¤ ì¡°ì–¸ ?ì„±
                advice_data = EMOTION_ADVICE.get(primary_emotion, {
                    "emotion_name": str(primary_emotion.value),
                    "advice": "EFT ??•‘???µí•´ ê°ì •??ì¡°ì ˆ?????ˆìŠµ?ˆë‹¤.",
                    "focus": "ê°ì • ì¡°ì ˆ"
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
                    "??EFT ?œì•ˆ: %s (ê°•ë„: %.2f, ? ë¢°?? %.2f)",
                    emotion_info['emotion'],
                    clamped_intensity,
                    clamped_confidence,
                )
                return True, emotion_info

    # ê·œì¹™ 2 (ë°±ì—…): ?¤ì›Œ??ë§¤ì¹­
    msg_norm = normalize_text(message)
    for keyword in NEGATIVE_EMOTIONS:
        if keyword in msg_norm:
            emotion_info = {
                "emotion": "ë¶€?•ì  ê°ì •",
                "keyword": keyword,
                "advice": "ê°ì???ë¶€?•ì  ê°ì •???€??EFT ??•‘???œë„?´ë³´?¸ìš”.",
                "detected_by": "keyword_matching"
            }
            logger.info(f"??EFT ?œì•ˆ (ë°±ì—…): keyword='{keyword}' in message")
            return True, emotion_info

    logger.debug(f"??¸  EFT ?œì•ˆ ?¤í‚µ: ë¶€?•ì  ê°ì • ê°ì? ????)
    return False, {}


def build_actions(message: str, meta: Dict[str, Any]) -> List[Dict[str, Any]]:
    """ë©”ì‹œì§€?€ ë©”í??°ì´??ê¸°ë°˜ ?¡ì…˜ ë¦¬ìŠ¤???ì„±

    ?Œë¡œ??
        1. EmotionAnalyzerë¡?ê°ì • ë¶„ì„
        2. ë¶€?•ì  ê°ì • ê°ì? ??suggest_eft (ê°ì •ë³?ë§ì¶¤ ì¡°ì–¸ ?¬í•¨)
        3. SUDS ì¸¡ì •?€ ë³„ë„ (_maybe_emit_ask_suds)

    Args:
        message: ?¬ìš©??ë©”ì‹œì§€
        meta: ë©”í??°ì´??(emotion_analysis ?¬í•¨)

    Returns:
        ?¡ì…˜ ë¦¬ìŠ¤??(ê°ì • ?•ë³´ ë°?ë§ì¶¤ ì¡°ì–¸ ?¬í•¨)
    """
    try:
        logger.info(f"[BuildActions] ?¸ì¶œ??- message: '{message[:30]}', meta keys: {list(meta.keys())}")

        actions: List[Dict[str, Any]] = []

        # EFT ?œì•ˆ ?„ìš” ?¬ë? ?•ì¸ + ê°ì • ?•ë³´ ë°›ê¸°
        should_suggest, emotion_info = should_suggest_eft(message, meta)

        if should_suggest:
            payload = {
                "reason": "negative_emotion_detected",
                **emotion_info,
            }
            logger.info(
                "[BuildActions] ??suggest_eft ?¡ì…˜ ?ì„±! ê°ì •: %s",
                emotion_info.get("emotion", "N/A"),
            )
            actions.insert(0, {"type": "suggest_eft", "payload": payload})
        else:
            logger.info("[BuildActions] ? ï¸ ë¶€?•ì  ê°ì • ê°ì? ????)

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
        logger.exception(f"??build_actions error: {e}")
        return []

