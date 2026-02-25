import pytest

from backend.spec_loop.mission.router import (
    _fallback_micro_action_suggestions,
    _normalize_suggestions,
)


def test_suggest_normalizes_payload():
    payload = {
        "suggestions": [
            {
                "title": "Start with 2-min prep",
                "why": "Reduce friction to begin.",
                "duration_min": "2",
                "trigger": "Open the task and clear the desk.",
            },
            {
                "title": "Set a 5-min timer",
                "why": "Short timebox helps focus.",
                "duration_min": 5,
                "trigger": "Start a timer and begin.",
            },
            {
                "title": "Write the first line",
                "why": "Tiny step builds momentum.",
                "duration_min": 3,
                "trigger": "Write the first sentence.",
            },
        ]
    }

    suggestions = _normalize_suggestions(payload)
    assert suggestions is not None
    assert len(suggestions) == 3
    assert suggestions[0]["duration_min"] == 2


def test_suggest_fallback_on_invalid_payload():
    payload = {"suggestions": [{"title": "Only title"}]}
    assert _normalize_suggestions(payload) is None

    fallback = _fallback_micro_action_suggestions([{"title": "Study"}])
    assert len(fallback) == 3
