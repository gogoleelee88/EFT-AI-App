"""
MoodTalk v2.0 Coach-First TaskAtomChooser.
Lite: default_task from scenario JSON.
Pro: immediate_goal + situation_context driven fallback.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional

from core.interfaces import TaskAtomChooser

if TYPE_CHECKING:
    from backend.models.chat_models import StrictIntakeInput

KEYWORDS = ["start", "small step", "1 minute", "breath", "water"]

CONTEXT_TO_TASK: Dict[str, str] = {
    "start": "start with a small step",
    "small step": "take one small step right now",
    "1 minute": "take 1 minute to breathe",
    "breath": "take 1 minute of slow breathing",
    "water": "drink a glass of water",
    "anxiety": "slow breathing for 1 minute and drink water",
    "sad": "take one minute to reset your energy",
    "stressed": "try a 1-minute grounding reset",
}


class TaskAtomChooserLite(TaskAtomChooser):
    """Lite: uses default_task first, then immediate_goal fallback."""

    def choose(
        self,
        intake: "StrictIntakeInput",
        scenario_id: str,
        default_task: Optional[str],
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        if default_task and default_task.strip():
            return default_task.strip()
        goal = getattr(intake, "immediate_goal", None)
        if goal and isinstance(goal, str) and goal.strip():
            g = goal.strip()
            return g[:80] + ("..." if len(g) > 80 else "")
        return "start with a small step"


class TaskAtomChooserPro(TaskAtomChooser):
    """
    Pro: immediate_goal + situation_context to task mapping.
    If no match, returns immediate_goal or default_task fallback.
    """

    def choose(
        self,
        intake: "StrictIntakeInput",
        scenario_id: str,
        default_task: Optional[str],
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        goal = getattr(intake, "immediate_goal", None) or ""
        situation = getattr(intake, "situation_context", None) or ""
        combined = f"{goal} {situation}".lower()

        for kw, task in CONTEXT_TO_TASK.items():
            if kw in combined:
                return task

        if goal and isinstance(goal, str) and goal.strip():
            g = goal.strip()
            if len(g) <= 80:
                return g
            return g[:77] + "..."

        if default_task and default_task.strip():
            return default_task.strip()

        return "start with a small step"


def get_task_atom_chooser(module_mode: str) -> TaskAtomChooser:
    """Returns an instance of lite/pro chooser."""
    if (module_mode or "lite").lower() == "pro":
        return TaskAtomChooserPro()
    return TaskAtomChooserLite()
