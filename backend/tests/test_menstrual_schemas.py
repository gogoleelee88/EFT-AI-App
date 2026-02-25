from datetime import date

import pytest

from backend.menstrual.schemas import ExportJobRequest, PMDDLiteLogRequest, SymptomsLogRequest


def test_symptom_schema_normalizes_keys():
    payload = SymptomsLogRequest(
        date=date(2026, 2, 1),
        symptom_severity_map={"Mood Swings": 3, " headache ": 2},
    )
    assert payload.symptom_severity_map["mood_swings"] == 3
    assert payload.symptom_severity_map["headache"] == 2


def test_pmdd_lite_validates_scale():
    with pytest.raises(ValueError):
        PMDDLiteLogRequest(date=date(2026, 2, 1), answers=[0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 5])


def test_export_range_limit():
    with pytest.raises(ValueError):
        ExportJobRequest(**{"from": "2025-01-01", "to": "2026-12-31", "formats": ["csv"]})
