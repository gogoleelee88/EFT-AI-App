"""
STRICT6 ?¸í’‹ ??EFT ?¤í¬ë¦½íŠ¸ ë³€??ë§¤í¼
"""

from typing import List, Dict, Any, Optional
from models.chat_models import StrictIntakeInput


def _map_intensity_label(intensity: int) -> str:
    """ê°•ë„ ?«ì ???ˆì´ë¸?ë³€??""
    if intensity <= 3:
        return "?½í•¨"
    elif intensity <= 6:
        return "ì¤‘ê°„"
    return "ê°•í•¨"


def _truncate(text: str, limit: int) -> str:
    """?ìŠ¤??ê¸¸ì´ ?œí•œ"""
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "??


def _build_setup_phrase(intake: StrictIntakeInput) -> str:
    """?‹ì—… êµ¬ë¬¸ ?ì„±"""
    situation = _truncate(intake.situation_context, 50)
    auto_thought = _truncate(intake.automatic_thought, 40)

    return (
        f"ë¹„ë¡ {situation} ?í™©?ì„œ "
        f"{intake.core_emotion}??ë¥? ?ë¼ê³?"
        f"'{auto_thought}'?¼ê³  ?ê°?˜ì?ë§? "
        "ì§€ê¸????œê°„ë§Œí¼?€ ??ë§ˆìŒ???ˆëŠ” ê·¸ë?ë¡??¸ì •??ë³´ë ¤ê³??œë‹¤."
    )


def _build_focus_words(intake: StrictIntakeInput) -> List[str]:
    """?¬ì»¤???¨ì–´ ?ì„± (??•‘ ì¤?ë°˜ë³µ??ì§§ì? êµ?"""
    focus: List[str] = []

    # 1) ê°ì • ê¸°ë°˜
    if intake.core_emotion:
        focus.append(f"??{intake.core_emotion}")
    focus.append("??ë§ˆìŒ")

    # 2) ?ë™?¬ê³  ê¸°ë°˜ 1~2ê°?    if intake.automatic_thought:
        auto = _truncate(intake.automatic_thought, 18)
        # ?¼í‘œ ê¸°ì??¼ë¡œ ?œë²ˆ ?˜ë¼ë³´ê¸°
        parts = [p.strip() for p in auto.split(",") if p.strip()]
        if parts:
            focus.append(parts[0])
            if len(parts) > 1:
                focus.append(_truncate(parts[1], 12))
        else:
            focus.append(auto)

    # 3) ? ì²´ ê°ê°
    if intake.physical_sensation:
        ps = _truncate(intake.physical_sensation, 14)
        focus.append(f"??{ps}")

    # ì¤‘ë³µ ?œê±° + ê¸¸ì´ ?œí•œ
    seen = set()
    deduped: List[str] = []
    for w in focus:
        if w not in seen:
            seen.add(w)
            deduped.append(w)
        if len(deduped) >= 5:
            break

    return deduped


def _build_situation_summary(intake: StrictIntakeInput) -> str:
    """?í™© ?”ì•½ ?ì„± (UI ?œì‹œ??"""
    label = _map_intensity_label(intake.intensity)
    lines = [
        f"ì§€ê¸??ë¼??ê°ì •: {intake.core_emotion} (ê°•ë„ {intake.intensity}/10, {label})",
        f"?í™©: {intake.situation_context}",
        f"? ì˜¤ë¥´ëŠ” ?ê°: '{intake.automatic_thought}'",
    ]

    if intake.physical_sensation:
        lines.append(f"ëª¸ì—???ê»´ì§€??ê²? {intake.physical_sensation}")

    if intake.behavioral_reaction:
        lines.append(f"ì§€ê¸??˜ê³  ?ˆê±°???˜ê³  ?¶ì? ?‰ë™: {intake.behavioral_reaction}")

    if intake.immediate_goal:
        lines.append(f"ì§€ê¸ˆì˜ ëª©í‘œ: {intake.immediate_goal}")

    return "\n".join(lines)


def _recommend_duration(intensity: int, available_time: Optional[int]) -> int:
    """ê¶Œì¥ ?œê°„ ê³„ì‚°"""
    if available_time is not None and available_time > 0:
        return available_time

    if intensity >= 7:
        return 12
    elif intensity >= 4:
        return 8
    return 5


def build_eft_script_from_strict6(intake: StrictIntakeInput) -> Dict[str, Any]:
    """
    STRICT6 ?¸í’‹ ??EFT ?¤í¬ë¦½íŠ¸ ë³€??
    Returns:
        EFTScript ëª¨ë¸ê³??¼ì¹˜?˜ëŠ” dict
    """
    intensity_label = _map_intensity_label(intake.intensity)
    setup_phrase = _build_setup_phrase(intake)
    focus_words = _build_focus_words(intake)
    situation_summary = _build_situation_summary(intake)
    recommended_duration = _recommend_duration(intake.intensity, intake.available_time)

    return {
        "setup_phrase": setup_phrase,
        "focus_words": focus_words,
        "intensity_label": intensity_label,
        "situation_summary": situation_summary,
        "recommended_duration": recommended_duration,
        "target_emotion": intake.core_emotion,
    }

