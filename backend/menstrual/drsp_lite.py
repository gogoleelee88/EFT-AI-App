from __future__ import annotations

from collections.abc import Sequence
from typing import TypedDict


class DRSPQuestion(TypedDict):
    id: str
    label_ko: str
    domain: str
    weight: float


DRSP_LITE_QUESTIONS: list[DRSPQuestion] = [
    {"id": "depressed_mood", "label_ko": "우울하거나 슬픈 기분", "domain": "mood", "weight": 1.25},
    {"id": "hopelessness", "label_ko": "희망이 없다고 느낌", "domain": "mood", "weight": 1.25},
    {"id": "self_critical", "label_ko": "자기비난/자책감", "domain": "mood", "weight": 1.2},
    {"id": "anxious_tense", "label_ko": "불안하거나 긴장됨", "domain": "mood", "weight": 1.2},
    {"id": "mood_swings", "label_ko": "기분이 급격히 변함", "domain": "mood", "weight": 1.2},
    {"id": "irritability", "label_ko": "쉽게 짜증/분노가 남", "domain": "mood", "weight": 1.2},
    {"id": "interpersonal_conflict", "label_ko": "대인갈등 증가", "domain": "mood", "weight": 1.1},
    {"id": "fatigue", "label_ko": "피로감/기력저하", "domain": "energy", "weight": 1.0},
    {"id": "sleep_disturbance", "label_ko": "수면 문제(불면/과다수면)", "domain": "energy", "weight": 1.0},
    {"id": "concentration_difficulty", "label_ko": "집중력 저하", "domain": "cognitive", "weight": 1.1},
    {"id": "overeating_craving", "label_ko": "식욕변화/당김", "domain": "appetite", "weight": 0.9},
    {"id": "physical_symptoms", "label_ko": "신체증상(복부팽만/유방통/두통 등)", "domain": "physical", "weight": 1.0},
]


def question_ids_for_length(answer_count: int) -> list[str]:
    if answer_count < 11 or answer_count > 14:
        raise ValueError("DRSP-lite answer count must be 11..14")
    base_ids = [item["id"] for item in DRSP_LITE_QUESTIONS]
    if answer_count <= len(base_ids):
        return base_ids[:answer_count]
    extra = [f"custom_item_{idx + 1}" for idx in range(answer_count - len(base_ids))]
    return base_ids + extra


def question_labels_for_ids(ids: Sequence[str]) -> list[dict[str, str]]:
    label_map = {item["id"]: item["label_ko"] for item in DRSP_LITE_QUESTIONS}
    return [{"id": item_id, "label_ko": label_map.get(item_id, "사용자 정의 항목")} for item_id in ids]


def _percentile(values: Sequence[float], p: float) -> float | None:
    if not values:
        return None
    sorted_values = sorted(float(v) for v in values)
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (len(sorted_values) - 1) * (p / 100.0)
    low_idx = int(rank)
    high_idx = min(len(sorted_values) - 1, low_idx + 1)
    fraction = rank - low_idx
    low = sorted_values[low_idx]
    high = sorted_values[high_idx]
    return low + (high - low) * fraction


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def calculate_pmdd_assessment(
    answers: Sequence[int],
    *,
    recent_indices: Sequence[float] | None = None,
) -> dict[str, object]:
    if len(answers) < 11 or len(answers) > 14:
        raise ValueError("DRSP-lite answer count must be 11..14")

    weights = [item["weight"] for item in DRSP_LITE_QUESTIONS][: len(answers)]
    if len(answers) > len(weights):
        weights.extend([1.0 for _ in range(len(answers) - len(weights))])

    weighted_sum = 0.0
    weighted_max = 0.0
    for idx, raw in enumerate(answers):
        score = float(int(raw))
        weight = float(weights[idx])
        weighted_sum += score * weight
        weighted_max += 4.0 * weight

    weighted_index = (weighted_sum / weighted_max) * 100.0 if weighted_max > 0 else 0.0
    emotional_core = answers[:7]
    high_emotional_count = len([score for score in emotional_core if score >= 3])
    distress_boost = 4.0 if high_emotional_count >= 4 else (2.0 if high_emotional_count >= 2 else 0.0)
    pmdd_index = round(_clamp(weighted_index + distress_boost, 0.0, 100.0), 2)

    moderate_threshold = 36.0
    severe_threshold = 62.0
    baseline = None
    trend_delta = None
    robust_baseline = False

    recent = [float(v) for v in (recent_indices or []) if v is not None]
    if len(recent) >= 4:
        baseline = _percentile(recent, 50.0)
        if baseline is not None:
            trend_delta = round(pmdd_index - baseline, 2)
    if len(recent) >= 6:
        robust_baseline = True
        q25 = _percentile(recent, 25.0) or 0.0
        q75 = _percentile(recent, 75.0) or 0.0
        spread = q75 - q25
        if spread <= 10:
            moderate_threshold += 2.0
            severe_threshold += 2.0
        elif spread >= 25:
            moderate_threshold -= 2.0
            severe_threshold -= 3.0

    if pmdd_index >= severe_threshold:
        band = "severe"
    elif pmdd_index >= moderate_threshold:
        band = "moderate"
    else:
        band = "mild"

    if trend_delta is None:
        interpretation = "기준선 데이터가 충분하지 않아 절대 점수 위주로 해석합니다."
    elif trend_delta >= 10:
        interpretation = "최근 개인 기준선 대비 증상 부담이 뚜렷하게 상승했습니다."
    elif trend_delta <= -10:
        interpretation = "최근 개인 기준선 대비 증상 부담이 완화되었습니다."
    else:
        interpretation = "최근 개인 기준선과 유사한 범위입니다."

    confidence = "fair" if len(recent) < 4 else ("good" if robust_baseline else "fair")

    return {
        "pmdd_symptom_index": pmdd_index,
        "pms_severity_band": band,
        "severity_thresholds": {
            "moderate_min": round(moderate_threshold, 2),
            "severe_min": round(severe_threshold, 2),
        },
        "baseline_index": round(baseline, 2) if baseline is not None else None,
        "trend_delta": trend_delta,
        "confidence": confidence,
        "interpretation": interpretation,
        "scoring_version": "drsp_lite_v1_ko_weighted",
        "high_emotional_count": high_emotional_count,
    }

