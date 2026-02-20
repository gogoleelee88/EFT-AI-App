"""
Utility functions for STRICT6-to-EFT script conversion.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.models.chat_models import StrictIntakeInput


def _map_intensity_label(intensity: int) -> str:
    """Return a short text label from an intensity score."""
    if intensity <= 3:
        return "low"
    if intensity <= 6:
        return "medium"
    return "high"


def _truncate(text: str, limit: int) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _build_setup_phrase(intake: StrictIntakeInput) -> str:
    situation = _truncate(intake.situation_context, 50)
    auto_thought = _truncate(intake.automatic_thought, 40)

    return (
        f"상황: {situation}. 핵심 감정은 "
        f"{intake.core_emotion}이고, 자동사고는 '{auto_thought}'. "
        "아래 4개 축을 중심으로 EFT를 구성합니다."
    )


def _build_focus_words(intake: StrictIntakeInput) -> List[str]:
    focus: List[str] = []

    if intake.core_emotion:
        focus.append(intake.core_emotion)
    focus.append("완화")

    if intake.automatic_thought:
        auto = _truncate(intake.automatic_thought, 18)
        parts = [p.strip() for p in auto.split(",") if p.strip()]
        if parts:
            focus.append(parts[0])
            if len(parts) > 1:
                focus.append(_truncate(parts[1], 12))
        else:
            focus.append(auto)

    if intake.physical_sensation:
        focus.append(_truncate(intake.physical_sensation, 14))

    seen = set()
    deduped: List[str] = []
    for token in focus:
        if token not in seen:
            seen.add(token)
            deduped.append(token)
        if len(deduped) >= 5:
            break

    return deduped


def _build_situation_summary(intake: StrictIntakeInput) -> str:
    label = _map_intensity_label(intake.intensity)
    lines = [
        f"정서 요약: {intake.core_emotion} (강도 {intake.intensity}/10, {label})",
        f"상황: {intake.situation_context}",
        f"자동사고: '{intake.automatic_thought}'",
    ]

    if intake.physical_sensation:
        lines.append(f"신체 느낌: {intake.physical_sensation}")
    if intake.behavioral_reaction:
        lines.append(f"행동 반응: {intake.behavioral_reaction}")
    if intake.immediate_goal:
        lines.append(f"즉시 목표: {intake.immediate_goal}")

    return "\n".join(lines)


def _recommend_duration(intensity: int, available_time: Optional[int]) -> int:
    if available_time is not None and available_time > 0:
        return available_time

    if intensity >= 7:
        return 12
    if intensity >= 4:
        return 8
    return 5


def build_eft_script_from_strict6(intake: StrictIntakeInput) -> Dict[str, Any]:
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
