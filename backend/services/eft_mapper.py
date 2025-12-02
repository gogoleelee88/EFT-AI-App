"""
STRICT6 인풋 → EFT 스크립트 변환 매퍼
"""

from typing import List, Dict, Any, Optional
from backend.models.chat_models import StrictIntakeInput


def _map_intensity_label(intensity: int) -> str:
    """강도 숫자 → 레이블 변환"""
    if intensity <= 3:
        return "약함"
    elif intensity <= 6:
        return "중간"
    return "강함"


def _truncate(text: str, limit: int) -> str:
    """텍스트 길이 제한"""
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _build_setup_phrase(intake: StrictIntakeInput) -> str:
    """셋업 구문 생성"""
    situation = _truncate(intake.situation_context, 50)
    auto_thought = _truncate(intake.automatic_thought, 40)

    return (
        f"비록 {situation} 상황에서 "
        f"{intake.core_emotion}을(를) 느끼고 "
        f"'{auto_thought}'라고 생각하지만, "
        "지금 이 순간만큼은 이 마음을 있는 그대로 인정해 보려고 한다."
    )


def _build_focus_words(intake: StrictIntakeInput) -> List[str]:
    """포커스 단어 생성 (탭핑 중 반복할 짧은 구)"""
    focus: List[str] = []

    # 1) 감정 기반
    if intake.core_emotion:
        focus.append(f"이 {intake.core_emotion}")
    focus.append("이 마음")

    # 2) 자동사고 기반 1~2개
    if intake.automatic_thought:
        auto = _truncate(intake.automatic_thought, 18)
        # 쉼표 기준으로 한번 잘라보기
        parts = [p.strip() for p in auto.split(",") if p.strip()]
        if parts:
            focus.append(parts[0])
            if len(parts) > 1:
                focus.append(_truncate(parts[1], 12))
        else:
            focus.append(auto)

    # 3) 신체 감각
    if intake.physical_sensation:
        ps = _truncate(intake.physical_sensation, 14)
        focus.append(f"이 {ps}")

    # 중복 제거 + 길이 제한
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
    """상황 요약 생성 (UI 표시용)"""
    label = _map_intensity_label(intake.intensity)
    lines = [
        f"지금 느끼는 감정: {intake.core_emotion} (강도 {intake.intensity}/10, {label})",
        f"상황: {intake.situation_context}",
        f"떠오르는 생각: '{intake.automatic_thought}'",
    ]

    if intake.physical_sensation:
        lines.append(f"몸에서 느껴지는 것: {intake.physical_sensation}")

    if intake.behavioral_reaction:
        lines.append(f"지금 하고 있거나 하고 싶은 행동: {intake.behavioral_reaction}")

    if intake.immediate_goal:
        lines.append(f"지금의 목표: {intake.immediate_goal}")

    return "\n".join(lines)


def _recommend_duration(intensity: int, available_time: Optional[int]) -> int:
    """권장 시간 계산"""
    if available_time is not None and available_time > 0:
        return available_time

    if intensity >= 7:
        return 12
    elif intensity >= 4:
        return 8
    return 5


def build_eft_script_from_strict6(intake: StrictIntakeInput) -> Dict[str, Any]:
    """
    STRICT6 인풋 → EFT 스크립트 변환

    Returns:
        EFTScript 모델과 일치하는 dict
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
