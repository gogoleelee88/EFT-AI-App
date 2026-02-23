"""
MoodTalk v2.0 Theme Recommender.
Lite: Rule-based (keywords/intensity)
Pro: LLM-based (context understanding) + Rule fallback on failure.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from config.settings import get_settings
from core.interfaces import ThemeRecommendationStrategy
from core.policy_engine import (
    THEME_LIBRARY,
    VALID_THEME_IDS,
    _get_recommended_theme_id,
    _intent_to_default_theme_id,
    get_theme_recommendations,
)
from backend.models.chat_models import StrictIntakeInput
from backend.types.guidance_schema import ThemeRecommendation
from utils.logger import get_logger

logger = get_logger(__name__)

# LLM ?ë§ ì¶ì²???ì¤???ë¡¬?í¸
THEME_RECOMMENDATION_SYSTEM = """?¹ì? EFT/ëªì ?ë§ ì¶ì² ?ë¬¸ê°?ë??
?¬ì©???ë¥??ë°í?¼ë¡ ê°???í©???ë§ 1ê°ë? ?í?ì¸??

## ì¶ì² ê°?¥í ?ë§ 3ì¢?1. self_compassion: ?ê¸° ?ë¹ - ??¸ì ?ì, ?ì¹?? ?ê? ë¶ì, ê°ëê° ?ì ??2. thought_labeling: ?¸ì???ê±°ë¦¬?ê¸° - ë°ë³µ ?ê°, ê±±ì, ë¯¸ë ë¶ì, ?ë?¬ê³
3. micro_task_bridging: ?¤í ?¸ë¦¬ê±?- ë¬´ê¸°?? ?ë¬´ ë°ë¦? ?ë ?ì, ì¦ì ëª©í

## ì¶ë¥ ê·ì¹ (CRITICAL)
ë°ë???ë JSON ?ì?¼ë¡ë§??ëµ?ì¸?? ?¤ë¥¸ ?ì¤??ê¸ì?.
```json
{"theme_id": "self_compassion|thought_labeling|micro_task_bridging", "reasoning": "??ì¤??´ì", "confidence": 0.0~1.0}
```"""


def _build_theme_user_prompt(intake: StrictIntakeInput) -> str:
    """StrictIntakeInput ??LLM???¬ì©???ë¡¬?í¸"""
    parts = [
        f"- ì£?ê°ì: {intake.core_emotion or 'ë¯¸ì'}",
        f"- ?í© ë§¥ë½: {intake.situation_context or 'ë¯¸ì'}",
        f"- ?ë???ê°: {intake.automatic_thought or 'ë¯¸ì'}",
        f"- ê°ë(1-10): {intake.intensity}",
        f"- ì¦ì ëª©í: {intake.immediate_goal or 'ë¯¸ì'}",
        f"- available_time: {intake.available_time or 'unknown'}",
    ]
    return "\n".join(parts)


def _parse_llm_theme_response(raw: str) -> Optional[Dict[str, Any]]:
    """LLM ?ëµ?ì theme_id, reasoning, confidence ?ì±. ?¤í¨ ??None."""
    try:
        # ```json ... ``` ë¸ë¡ ì¶ì¶
        m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
        if m:
            raw = m.group(1).strip()
        # ?ë {...} ë¸ë¡ ì§ì ê²??        m2 = re.search(r"\{[^{}]*\}", raw)
        if m2:
            raw = m2.group(0)
        data = json.loads(raw)
        theme_id = (data.get("theme_id") or "").strip().lower()
        if theme_id not in VALID_THEME_IDS:
            return None
        reasoning = data.get("reasoning") or ""
        confidence = float(data.get("confidence", 0.5))
        confidence = max(0.0, min(1.0, confidence))
        return {"theme_id": theme_id, "reasoning": reasoning, "confidence": confidence}
    except Exception as e:
        logger.debug(f"LLM theme response parse failed: {e}")
        return None


class RuleBasedThemeRecommender(ThemeRecommendationStrategy):
    """ê¸°ì¡´ ê·ì¹ ê¸°ë° ?ë§ ì¶ì² (Lite ëª¨ë)"""

    def recommend(
        self,
        intake: StrictIntakeInput,
        intent: Optional[str] = None,
    ) -> Tuple[List[ThemeRecommendation], str, List[str]]:
        return get_theme_recommendations(intake, intent=intent)


class LLMThemeRecommender(ThemeRecommendationStrategy):
    """
    LLM ê¸°ë° ?ë§ ì¶ì² (Pro ëª¨ë).
    vLLM ?¸ì¶ ?¤í¨/?ì± ?¤í¨ ??Rule ê¸°ë° Fallback.
    """

    def __init__(self, vllm_client: Any = None) -> None:
        """
        vllm_client: VLLMClient ?¸ì¤?´ì¤. None?´ë©´ import ?ì???ì±.
        """
        self._vllm = vllm_client

    def _get_vllm(self) -> Any:
        if self._vllm is not None:
            return self._vllm
        from services.vllm_client import VLLMClient

        return VLLMClient()

    def recommend(
        self,
        intake: StrictIntakeInput,
        intent: Optional[str] = None,
    ) -> Tuple[List[ThemeRecommendation], str, List[str]]:
        trace: List[str] = []
        # 1. Intentê° ?´ë? ?í¨??theme_idë©?ì¦ì ë°í (?ë¬??ëª©ë¡ ë°í)
        default_id = _intent_to_default_theme_id(intent)
        if default_id is not None:
            themes, default_id, trace = get_theme_recommendations(intake, intent=intent)
            return themes, default_id, trace

        # 2. LLM ?¸ì¶ ?ë
        user_prompt = _build_theme_user_prompt(intake)
        messages = [
            {"role": "system", "content": THEME_RECOMMENDATION_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]
        try:
            vllm = self._get_vllm()
            resp = vllm.chat_completion(
                messages=messages,
                tier="free",
                max_tokens=150,
                temperature=0.3,
            )
            content = ""
            if resp and "choices" in resp and resp["choices"]:
                content = (
                    (resp["choices"][0].get("message") or {}).get("content") or ""
                )
            parsed = _parse_llm_theme_response(content)
            if parsed:
                theme_id = parsed["theme_id"]
                reasoning = parsed.get("reasoning", "")
                conf = parsed.get("confidence", 0.5)
                trace.append(f"LLM selected: theme_id={theme_id} confidence={conf}")
                if reasoning:
                    trace.append(f"LLM reasoning: {reasoning[:80]}...")
                if conf < 0.5:
                    trace.append("Confidence < 0.5, using rule fallback")
                    themes, default_id, extra = get_theme_recommendations(intake, intent=None)
                    trace.extend(extra)
                    return themes, default_id, trace
                default_id = theme_id
                trace.append(f"Selected default_theme_id={default_id}")
                themes, _, _ = get_theme_recommendations(intake, intent=None)
                first = [t for t in themes if t.theme_id == default_id]
                rest = [t for t in themes if t.theme_id != default_id]
                return first + rest, default_id, trace
        except Exception as e:
            logger.warning(f"LLM theme recommendation failed, fallback to rule: {e}")
            trace.append(f"LLM failed: {e}")

        # 3. Rule Fallback (?ì ???ë¬??ëª©ë¡ ë°í)
        themes, default_id, extra = get_theme_recommendations(intake, intent=None)
        trace.extend(extra)
        return themes, default_id, trace


def get_theme_recommender(module_mode: Optional[str] = None) -> ThemeRecommendationStrategy:
    """MODULE_MODE???°ë¼ ThemeRecommendationStrategy ë°í."""
    mode = module_mode or get_settings().MODULE_MODE
    if mode == "pro":
        return LLMThemeRecommender()
    return RuleBasedThemeRecommender()


