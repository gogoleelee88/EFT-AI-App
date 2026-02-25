from __future__ import annotations

from typing import Any

from backend.spec_loop.condition.schemas import MenstrualQuickCheck, MinConditionSet
from backend.spec_loop.dataset_priors import get_dataset_priors

_DEFAULT_PRIORS: dict[str, Any] = {
    "drivers": {
        "sleep_debt": {
            "base_score_by_band": {"LT5": 92, "H5_6": 82, "H6_7": 62, "H7_8": 24, "GT8": 12},
            "fatigue_boost_per_point": 2,
            "high_conf_sleep_bands": ["LT5", "H5_6"],
        },
        "stress": {
            "mood_base_score": {"calm": 14, "ok": 28, "anxious": 84, "low": 72, "irritated": 78},
            "inferred_stress_weight": 7,
            "high_conf_moods": ["anxious", "irritated"],
            "high_conf_inferred_threshold": 3,
        },
        "post_meal_dip": {
            "scale_max": 100,
            "high_conf_threshold": 3,
            "med_conf_threshold": 2,
        },
    },
    "menstrual": {
        "weights": {
            "cramps_0_4": 0.35,
            "fatigue_0_4": 0.25,
            "irritability_0_4": 0.25,
            "focus_drop_0_4": 0.15,
        },
        "confidence_thresholds": {"med_score_min": 35},
        "self_report_confidence_cap": "med",
    },
    "disambiguation": {
        "blocker_drivers": ["SLEEP_DEBT_LOAD", "POST_MEAL_DIP", "STRESS_LOAD"],
        "blocker_confidence": "high",
        "blocker_min_score": 70,
        "menstrual_score_penalty": 18,
    },
    "quality_gate": {
        "menstrual_self_report": {
            "required_fields": ["cramps_0_4", "fatigue_0_4", "irritability_0_4"],
            "optional_fields": ["bleeding_level_0_2", "focus_drop_0_4"],
            "confidence_by_coverage": [
                {"min_coverage": 0.6, "confidence": "med"},
                {"min_coverage": 0.0, "confidence": "low"},
            ],
        }
    },
}

_DRIVER_LABELS = {
    "MENSTRUAL_SYMPTOM_LOAD": "생리 증상 부담",
    "SLEEP_DEBT_LOAD": "수면 부채",
    "STRESS_LOAD": "스트레스",
    "POST_MEAL_DIP": "식후 저하",
}



def _clamp(n: int, min_v: int = 0, max_v: int = 100) -> int:
    return max(min_v, min(max_v, n))


def _confidence_rank(conf: str) -> int:
    return {"low": 0, "med": 1, "high": 2}.get(conf, 0)


def _rank_to_conf(rank: int) -> str:
    return {0: "low", 1: "med", 2: "high"}.get(rank, "low")


def _cfg() -> dict[str, Any]:
    return get_dataset_priors(_DEFAULT_PRIORS)


def compute_menstrual_score(m: MenstrualQuickCheck | None) -> int:
    if m is None:
        return 0

    menstrual_cfg = (_cfg().get("menstrual") or {})
    weights = menstrual_cfg.get("weights") or {}
    w_cramps = float(weights.get("cramps_0_4", 0.35))
    w_fatigue = float(weights.get("fatigue_0_4", 0.25))
    w_irritability = float(weights.get("irritability_0_4", 0.25))
    w_focus = float(weights.get("focus_drop_0_4", 0.15))

    focus = m.focus_drop_0_4 or 0
    weighted = (
        m.cramps_0_4 * w_cramps
        + m.fatigue_0_4 * w_fatigue
        + m.irritability_0_4 * w_irritability
        + focus * w_focus
    )
    return _clamp(int(round((weighted / 4.0) * 100)))


def _sleep_driver(min_set: MinConditionSet, cfg: dict[str, Any]) -> dict[str, Any]:
    sleep_cfg = ((cfg.get("drivers") or {}).get("sleep_debt") or {})
    base_by_band = sleep_cfg.get("base_score_by_band") or {}
    fatigue_boost = int(sleep_cfg.get("fatigue_boost_per_point", 2))
    high_conf_bands = {str(v) for v in (sleep_cfg.get("high_conf_sleep_bands") or [])}

    score = _clamp(int(base_by_band.get(min_set.sleep_hours, 30)) + min_set.fatigue * fatigue_boost)
    conf = "high" if min_set.sleep_hours in high_conf_bands else ("med" if score >= 45 else "low")
    return {
        "driver": "SLEEP_DEBT_LOAD",
        "score": score,
        "confidence": conf,
        "evidence": [
            f"?챘짤쨈 챗쨉짭챗째: {min_set.sleep_hours}",
            f"챗쨍째챘쨀쨍 ?쩌챘징 ?챘짜: {min_set.fatigue}/10",
        ],
    }


def _stress_driver(min_set: MinConditionSet, behavior_inference: dict[str, Any] | None, cfg: dict[str, Any]) -> dict[str, Any]:
    stress_cfg = ((cfg.get("drivers") or {}).get("stress") or {})
    mood_base = stress_cfg.get("mood_base_score") or {}
    weight = int(stress_cfg.get("inferred_stress_weight", 7))
    high_conf_moods = {str(v) for v in (stress_cfg.get("high_conf_moods") or [])}
    high_conf_threshold = int(stress_cfg.get("high_conf_inferred_threshold", 3))

    inferred_stress = 0
    if behavior_inference:
        inferred_stress = int(behavior_inference.get("stress_level_0_4") or behavior_inference.get("stress_0_4") or 0)
    score = _clamp(int(mood_base.get(min_set.mood, 30)) + inferred_stress * weight)
    conf = "high" if (min_set.mood in high_conf_moods or inferred_stress >= high_conf_threshold) else ("med" if score >= 45 else "low")

    evidence = [f"챗쨍째챘쨋 ?챘짜: {min_set.mood}"]
    if inferred_stress:
        evidence.append(f"챙쨋챙 ?짚챠쨍?챙짚: {inferred_stress}/4")
    return {
        "driver": "STRESS_LOAD",
        "score": score,
        "confidence": conf,
        "evidence": evidence,
    }


def _post_meal_driver(behavior_inference: dict[str, Any] | None, cfg: dict[str, Any]) -> dict[str, Any]:
    dip_cfg = ((cfg.get("drivers") or {}).get("post_meal_dip") or {})
    scale_max = int(dip_cfg.get("scale_max", 100))
    high_t = int(dip_cfg.get("high_conf_threshold", 3))
    med_t = int(dip_cfg.get("med_conf_threshold", 2))

    if not behavior_inference:
        return {
            "driver": "POST_MEAL_DIP",
            "score": 8,
            "confidence": "low",
            "evidence": ["?챠 ????챘짜 ?챙"],
        }

    dip = int(behavior_inference.get("post_meal_dip_0_4") or behavior_inference.get("meal_dip_0_4") or 0)
    score = _clamp(int(round((dip / 4.0) * scale_max)))
    if dip >= high_t:
        conf = "high"
    elif dip >= med_t:
        conf = "med"
    else:
        conf = "low"
    return {
        "driver": "POST_MEAL_DIP",
        "score": score,
        "confidence": conf,
        "evidence": [f"?챠 ???챙쨋챙챗째? {dip}/4"],
    }


def _pick_coverage_confidence(coverage: float, quality_cfg: dict[str, Any]) -> str:
    rows = list(quality_cfg.get("confidence_by_coverage") or [])
    rows.sort(key=lambda x: float(x.get("min_coverage", 0.0)), reverse=True)
    for row in rows:
        if coverage >= float(row.get("min_coverage", 0.0)):
            value = str(row.get("confidence") or "low")
            if value in {"low", "med", "high"}:
                return value
    return "low"


def _menstrual_driver(m: MenstrualQuickCheck | None, cfg: dict[str, Any]) -> tuple[dict[str, Any], str]:
    if m is None:
        return (
            {
                "driver": "MENSTRUAL_SYMPTOM_LOAD",
                "score": 0,
                "confidence": "low",
                "evidence": ["?챘짝짭 ?쨉챙짼쨈???챘짜 ?챙"],
            },
            "self_report_low",
        )

    quality_cfg = (((cfg.get("quality_gate") or {}).get("menstrual_self_report") or {})
                   )
    required_fields = [str(v) for v in (quality_cfg.get("required_fields") or [])]
    optional_fields = [str(v) for v in (quality_cfg.get("optional_fields") or [])]
    total_fields = len(required_fields) + len(optional_fields)
    present_required = sum(1 for key in required_fields if getattr(m, key, None) is not None)
    present_optional = sum(1 for key in optional_fields if getattr(m, key, None) is not None)
    coverage = ((present_required + present_optional) / total_fields) if total_fields > 0 else 0.0
    coverage_conf = _pick_coverage_confidence(coverage, quality_cfg)

    menstrual_cfg = (cfg.get("menstrual") or {})
    conf_cfg = menstrual_cfg.get("confidence_thresholds") or {}
    med_threshold = int(conf_cfg.get("med_score_min", 35))
    cap_conf = str(menstrual_cfg.get("self_report_confidence_cap", "med"))
    cap_rank = _confidence_rank(cap_conf)

    score = compute_menstrual_score(m)
    score_conf = "med" if score >= med_threshold else "low"
    final_rank = min(_confidence_rank(score_conf), _confidence_rank(coverage_conf), cap_rank)
    final_conf = _rank_to_conf(final_rank)
    data_quality = "self_report_med" if final_conf in {"med", "high"} else "self_report_low"

    evidence = [f"챗짼쩍챘짢/?쩌챘징/?챘? 챙짠?? {m.cramps_0_4}/{m.fatigue_0_4}/{m.irritability_0_4}"]
    if m.focus_drop_0_4 is not None:
        evidence.append(f"챙짠챙짚 ??? {m.focus_drop_0_4}/4")
    if m.bleeding_level_0_2 is not None:
        evidence.append(f"챙쨋챠 챗째챘: {m.bleeding_level_0_2}/2")

    return (
        {
            "driver": "MENSTRUAL_SYMPTOM_LOAD",
            "score": score,
            "confidence": final_conf,
            "evidence": evidence[:3],
        },
        data_quality,
    )


def _apply_disambiguation(drivers: list[dict[str, Any]], cfg: dict[str, Any]) -> None:
    disamb_cfg = (cfg.get("disambiguation") or {})
    blocker_names = {str(v) for v in (disamb_cfg.get("blocker_drivers") or [])}
    blocker_conf = str(disamb_cfg.get("blocker_confidence") or "high")
    blocker_min_score = int(disamb_cfg.get("blocker_min_score", 70))
    menstrual_penalty = int(disamb_cfg.get("menstrual_score_penalty", 18))

    menstrual = next((d for d in drivers if d.get("driver") == "MENSTRUAL_SYMPTOM_LOAD"), None)
    if not menstrual or int(menstrual.get("score") or 0) <= 0:
        return

    blockers = [
        d
        for d in drivers
        if str(d.get("driver")) in blocker_names
        and str(d.get("confidence")) == blocker_conf
        and int(d.get("score") or 0) >= blocker_min_score
    ]
    if not blockers:
        return

    max_blocker = max(int(d.get("score") or 0) for d in blockers)
    penalized = _clamp(int(menstrual.get("score") or 0) - menstrual_penalty)
    if penalized >= max_blocker:
        penalized = max(0, max_blocker - 1)

    menstrual["score"] = penalized
    menstrual["evidence"] = list(menstrual.get("evidence") or []) + [
        "?챘짤쨈/?짚챠쨍?챙짚/?챠 ?챠쨍챗째 챗째챠쨈 ?챘짝짭 ?챙쨍 ?째챙?챙챘짜?챘쨀쨈챙?챙쩌챘징?챙징째챙?챙쨉?챘짚."
    ]


def _build_evidence_snapshot(top2: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    for d in top2:
        driver_name = _DRIVER_LABELS.get(str(d.get("driver")), str(d.get("driver")))
        evidence = (d.get("evidence") or ["챗쨌쩌챗짹째 ?째챙쨈???챙"])[0]
        lines.append(f"{driver_name}: {evidence} (?챘짖째??{d.get('confidence', 'low')})")
    while len(lines) < 2:
        lines.append("?챘짜 ?째챙쨈?째챗? ?챠?챙쨈??챘쨀쨈챙?챙쩌챘징?챙쨋챙?챙쨉?챘짚.")
    return lines[:2]


def build_daily_condition_summary(
    min_condition_set: MinConditionSet,
    menstrual_quick_check: MenstrualQuickCheck | None,
    behavior_inference: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = _cfg()
    menstrual_driver, data_quality = _menstrual_driver(menstrual_quick_check, cfg)
    drivers = [
        menstrual_driver,
        _sleep_driver(min_condition_set, cfg),
        _stress_driver(min_condition_set, behavior_inference, cfg),
        _post_meal_driver(behavior_inference, cfg),
    ]

    _apply_disambiguation(drivers, cfg)
    drivers.sort(key=lambda x: (int(x.get("score") or 0), _confidence_rank(str(x.get("confidence") or "low"))), reverse=True)
    top2 = drivers[:2]

    overall_rank = max((_confidence_rank(str(d.get("confidence") or "low")) for d in top2), default=0)
    if any(str(d.get("driver")) == "MENSTRUAL_SYMPTOM_LOAD" for d in top2):
        overall_rank = min(overall_rank, _confidence_rank(str(menstrual_driver.get("confidence") or "low")))
    overall_confidence = _rank_to_conf(overall_rank)

    return {
        "drivers": drivers,
        "drivers_top2": top2,
        "confidence": overall_confidence,
        "evidence_snapshot": _build_evidence_snapshot(top2),
        "menstrual_score_0_100": int(menstrual_driver.get("score") or 0),
        "data_quality": data_quality,
    }


