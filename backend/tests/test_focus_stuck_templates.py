from backend.focus.stuck_catalog import STUCK_CATEGORIES
from backend.focus.service import _required_questions_for_case


def test_stuck_catalog_has_minimum_25_categories():
    assert len(STUCK_CATEGORIES) >= 25


def test_stuck_category_required_fields_present():
    required_keys = {
        "id",
        "name",
        "when_to_use",
        "required_questions",
        "model_profile_primary",
        "model_profile_alternatives",
        "prompt_template",
        "output_format_spec",
        "next_action_rules",
    }
    for category in STUCK_CATEGORIES:
        assert required_keys.issubset(category.keys())


def test_missing_slots_generate_required_questions():
    category = STUCK_CATEGORIES[0]
    missing = _required_questions_for_case(category, answers={})
    assert len(missing) >= 1
    assert missing == category["required_questions"]

