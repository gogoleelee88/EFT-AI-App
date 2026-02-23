from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from backend.models.chat_models import (
    EmotionAnalysis,
    EmotionType,
    EFTRecommendation,
    EFTPoint,
    SuggestedAction,
)
from utils.logger import get_logger

logger = get_logger(__name__)


class PromptStyle(str, Enum):
    EMPATHETIC = "empathetic"
    DIRECT = "direct"
    GENTLE = "gentle"
    PROFESSIONAL = "professional"
    CASUAL = "casual"


class EFTPromptManager:
    def __init__(self) -> None:
        self.base_system_prompt = self._load_base_system_prompt()

    def build_eft_prompt(
        self,
        user_message: str,
        emotion_state: EmotionAnalysis,
        conversation_history: Optional[List] = None,
        user_profile: Optional[object] = None,
        style: PromptStyle = PromptStyle.EMPATHETIC,
        tier: str = "free",
    ) -> str:
        emotion_name = getattr(emotion_state, "primary_emotion", "unknown")
        intensity = getattr(emotion_state, "intensity", 0.0)
        confidence = getattr(emotion_state, "confidence", 0.0)
        style_text = style.value if isinstance(style, PromptStyle) else str(style)

        return (
            "MOMENTARY EFT PROMPT\n"
            f"message: {user_message}\n"
            f"emotion: {emotion_name}\n"
            f"intensity: {intensity}\n"
            f"emotion_confidence: {confidence}\n"
            f"style: {style_text}\n"
            f"tier: {tier}\n"
            f"history_count: {len(conversation_history or [])}\n"
            f"system_base: {self.base_system_prompt}"
        )

    def recommend_eft_techniques(self, emotion_state: EmotionAnalysis) -> List[EFTRecommendation]:
        emotion_name = getattr(emotion_state, "primary_emotion", EmotionType.NEUTRAL)

        if emotion_name == EmotionType.STRESS:
            return [
                EFTRecommendation(
                    technique_name="Stress Relief Tap",
                    tapping_points=[EFTPoint.CROWN, EFTPoint.EYEBROW, EFTPoint.COLLARBONE],
                    setup_phrase="Breathe slowly and tap gently on each point.",
                    reminder_phrase="Release control with calm breathing.",
                    duration_minutes=6,
                    difficulty_level="beginner",
                    effectiveness_score=0.86,
                    additional_notes="Stress-focused sequence.",
                )
            ]

        if emotion_name in (EmotionType.ANXIETY, EmotionType.FEAR):
            return [
                EFTRecommendation(
                    technique_name="Calm Grounding Tap",
                    tapping_points=[EFTPoint.UNDER_NOSE, EFTPoint.SIDE_OF_EYE, EFTPoint.UNDER_ARM],
                    setup_phrase="Name your fear, then tap with steady rhythm.",
                    reminder_phrase="Keep exhale longer than inhale.",
                    duration_minutes=5,
                    difficulty_level="beginner",
                    effectiveness_score=0.84,
                    additional_notes="Use grounding phrases while tapping.",
                )
            ]

        if emotion_name in (EmotionType.SADNESS, EmotionType.LONELINESS):
            return [
                EFTRecommendation(
                    technique_name="Soothing Tap",
                    tapping_points=[EFTPoint.UNDER_EYE, EFTPoint.EYEBROW, EFTPoint.UNDER_NOSE],
                    setup_phrase="Acknowledge sadness, then tap compassionately.",
                    reminder_phrase="Allow feelings without judging.",
                    duration_minutes=7,
                    difficulty_level="beginner",
                    effectiveness_score=0.82,
                    additional_notes="Focus on emotional safety while tapping.",
                )
            ]

        if emotion_name in (EmotionType.ANGER, EmotionType.FRUSTRATION):
            return [
                EFTRecommendation(
                    technique_name="Discharge Tap",
                    tapping_points=[EFTPoint.SIDE_OF_EYE, EFTPoint.CHIN, EFTPoint.UNDER_ARM],
                    setup_phrase="Describe anger in one sentence, then tap with steady pace.",
                    reminder_phrase="Notice body tension and soften it.",
                    duration_minutes=6,
                    difficulty_level="beginner",
                    effectiveness_score=0.81,
                    additional_notes="Good for sudden tension spikes.",
                )
            ]

        return [
            EFTRecommendation(
                technique_name="Balanced EFT Tap",
                tapping_points=[EFTPoint.CROWN, EFTPoint.COLLARBONE],
                setup_phrase="State the feeling, breathe, and tap slowly.",
                reminder_phrase="Stay present and keep it simple.",
                duration_minutes=4,
                difficulty_level="beginner",
                effectiveness_score=0.7,
                additional_notes="General supportive sequence.",
            )
        ]

    def post_process_response(
        self,
        ai_response: str,
        emotion_analysis: EmotionAnalysis,
        tier: str = "free",
    ) -> Dict[str, Any]:
        cleaned_response = self._clean_ai_response(ai_response)
        eft_recommendations = self.recommend_eft_techniques(emotion_analysis)
        suggested_actions = self._generate_suggested_actions(emotion_analysis)

        confidence = self._calculate_response_confidence(
            cleaned_response,
            emotion_analysis,
        )

        return {
            "text": cleaned_response,
            "eft_recommendations": eft_recommendations,
            "suggested_actions": suggested_actions,
            "confidence": confidence,
        }

    def _load_base_system_prompt(self) -> str:
        return "Use supportive prompts and safety-first responses for EFT guidance."

    def _clean_ai_response(self, response: str) -> str:
        if not response:
            return ""

        cleaned = response.strip()
        prefixes_to_remove = ["EFT Assistant:", "Assistant:", "AI:"]
        for prefix in prefixes_to_remove:
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):].strip()
        if len(cleaned) > 900:
            cleaned = cleaned[:900].rstrip()
        return cleaned

    def _generate_suggested_actions(self, emotion: EmotionAnalysis) -> List[SuggestedAction]:
        intensity = float(getattr(emotion, "intensity", 0.0) or 0.0)
        emotion_name = getattr(emotion, "primary_emotion", EmotionType.NEUTRAL)

        actions: List[SuggestedAction] = []

        if emotion_name in (EmotionType.STRESS, EmotionType.ANXIETY):
            actions.append(
                SuggestedAction(
                    action_type="breathing",
                    title="4-7-8 breathing",
                    description="Inhale 4 seconds, hold 7 seconds, exhale 8 seconds.",
                    priority="high",
                    estimated_time_minutes=5,
                )
            )

        actions.append(
            SuggestedAction(
                action_type="eft_session",
                title="Start EFT session",
                description="Run one short EFT round with the recommended points.",
                priority="medium",
                estimated_time_minutes=10,
            )
        )

        if intensity >= 0.8:
            actions.append(
                SuggestedAction(
                    action_type="professional_help",
                    title="Consider professional support",
                    description="If this feeling escalates, contact a counselor or counselor line.",
                    priority="high",
                    estimated_time_minutes=60,
                )
            )

        return actions

    def _calculate_response_confidence(self, response: str, emotion: EmotionAnalysis) -> float:
        score = 0.7
        if 50 <= len(response) <= 500:
            score += 0.1
        if 0 <= float(getattr(emotion, "confidence", 0.0)) <= 1:
            score += 0.2 * float(getattr(emotion, "confidence", 0.0))
        return min(score, 1.0)

