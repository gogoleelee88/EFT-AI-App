from datetime import date

import pytest

from backend.menstrual.drsp_lite import calculate_pmdd_assessment, question_ids_for_length
from backend.menstrual.schemas import PMDDLiteLogRequest


def test_question_ids_for_length_default():
    ids = question_ids_for_length(12)
    assert len(ids) == 12
    assert ids[0] == "depressed_mood"


def test_pmdd_assessment_includes_thresholds():
    answers = [2, 3, 2, 2, 3, 3, 2, 2, 2, 1, 2, 2]
    result = calculate_pmdd_assessment(answers, recent_indices=[35.0, 41.0, 46.0, 43.0, 49.0, 45.0])
    assert 0 <= float(result["pmdd_symptom_index"]) <= 100
    assert result["pms_severity_band"] in {"mild", "moderate", "severe"}
    assert "moderate_min" in result["severity_thresholds"]
    assert "severe_min" in result["severity_thresholds"]


def test_pmdd_question_ids_must_match_answers():
    with pytest.raises(ValueError):
        PMDDLiteLogRequest(
            date=date(2026, 2, 15),
            answers=[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            question_ids=["a", "b"],
        )
