import json

from backend.spec_loop.condition.schemas import MenstrualQuickCheck, MinConditionSet
from backend.spec_loop.condition.service import compute_condition_score
from backend.spec_loop.condition.summary_service import compute_menstrual_score
from backend.spec_loop.dataset_priors import load_dataset_priors


def test_condition_score_uses_runtime_dataset_priors(monkeypatch, tmp_path):
    priors = {
        "condition_score": {
            "sleep_penalty": {"H6_7": -20},
            "mood_penalty": {"ok": 0},
            "period_penalty": {"none": 0},
            "fatigue_weight": 1,
            "pain_weight": 1,
            "behavior_inference": {
                "require_inferred_flag": True,
                "input_latency": {"threshold_sec": 999, "penalty": 0},
                "app_switch": {"threshold_30min": 999, "penalty": 0},
            },
        }
    }
    path = tmp_path / "dataset_priors.json"
    path.write_text(json.dumps(priors), encoding="utf-8")

    monkeypatch.setenv("DATASET_PRIORS_PATH", str(path))
    load_dataset_priors.cache_clear()

    score = compute_condition_score(
        MinConditionSet(sleep_hours="H6_7", fatigue=5, pain=2, mood="ok", period_status="none"),
        behavior_inference={"inferred": True, "input_latency_sec": 120, "app_switch_count_30min": 10},
    )
    assert score == 73
    load_dataset_priors.cache_clear()


def test_menstrual_score_uses_runtime_dataset_priors(monkeypatch, tmp_path):
    priors = {
        "menstrual": {
            "weights": {
                "cramps_0_4": 0.0,
                "fatigue_0_4": 0.0,
                "irritability_0_4": 0.0,
                "focus_drop_0_4": 1.0,
            }
        }
    }
    path = tmp_path / "dataset_priors.json"
    path.write_text(json.dumps(priors), encoding="utf-8")

    monkeypatch.setenv("DATASET_PRIORS_PATH", str(path))
    load_dataset_priors.cache_clear()

    score = compute_menstrual_score(
        MenstrualQuickCheck(
            cramps_0_4=4,
            fatigue_0_4=4,
            irritability_0_4=4,
            focus_drop_0_4=4,
        )
    )
    assert score == 100
    load_dataset_priors.cache_clear()
