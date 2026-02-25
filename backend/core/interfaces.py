"""
MoodTalk v2.0 Guidance Pipeline - Contract Interfaces (ABC).
Grand Master v2: Lite/Pro êµì²´ ê°?¥í ëª¨ë ?¤ì¼?í¤.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    from backend.models.chat_models import StrictIntakeInput
    from backend.domain_types.guidance_schema import ThemeRecommendation


class ThemeRecommendationStrategy(ABC):
    """
    ëªì ?ë§ ì¶ì² ?ëµ.
    Lite: ê·ì¹ ê¸°ë° (?¤ì??ê°ë)
    Pro: LLM ê¸°ë° (ë§¥ë½ ?´í´) + ?¤í¨ ??Rule Fallback
    """

    @abstractmethod
    def recommend(
        self,
        intake: "StrictIntakeInput",
        intent: Optional[str] = None,
    ) -> Tuple[List["ThemeRecommendation"], str, List[str]]:
        """
        (themes, default_theme_id, decision_trace) ë°í.
        themes: ì¶ì² ?ë§ 3ì¢?ëª©ë¡
        default_theme_id: ê¸°ë³¸ ?í ?ë§ ID
        decision_trace: ê²°ì ì¶ì ë¡ê·¸
        """
        ...


class TaskAtomChooser(ABC):
    """
    Coach-First Activation: activation ?¨ê³?ì ?¬ì©??task_atom(1ê°??ë) ?í.
    Lite: ?ëë¦¬ì¤ default_task ê³ì.
    Pro: ?¬ì©??ì»¨í?¤í¸/?´ë¥ ê¸°ë° ê°ì¸??(ì¶í KG/RAG ?°ë).
    """

    @abstractmethod
    def choose(
        self,
        intake: "StrictIntakeInput",
        scenario_id: str,
        default_task: Optional[str],
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        task_atom ë¬¸ì??1ê°?ë°í. 30~120ì´??¨ì ?¤í ê°?¥í êµ¬ì²´???ë.
        Args:
            intake: STRICT6 ?¸í?´í¬
            scenario_id: ?í???ëë¦¬ì¤ ID
            default_task: ?ëë¦¬ì¤ JSON??default_task (Lite?ì ê·¸ë?ë¡??¬ì© ê°??
            context: ì¶ê? ì»¨í?¤í¸ (?¸ì ID, ?¬ì©???´ë¥ ?? Pro??
        Returns:
            task_atom ë¬¸ì??(?? "ë¬?????ë§ìê¸?, "ì°½ë¬¸ 5ë¶??´ê¸°")
        """
        ...


