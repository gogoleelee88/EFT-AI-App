from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class CyclePolicy:
    default_cycle_len_days: int = 28
    min_cycle_len_days: int = 18
    max_cycle_len_days: int = 45
    luteal_len_days: int = 14
    low_std_threshold_days: float = 2.0
    high_std_threshold_days: float = 5.0
    low_cv_threshold: float = 0.08
    high_cv_threshold: float = 0.18
    high_confidence_min_cycles: int = 4
    med_confidence_min_cycles: int = 2
    window_margin_low_days: int = 1
    window_margin_med_days: int = 2
    window_margin_high_days: int = 4

    sigma_menstruation_days: float = 1.8
    sigma_follicular_days: float = 3.2
    sigma_ovulation_days: float = 1.1
    sigma_luteal_days: float = 3.8


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def get_cycle_policy() -> CyclePolicy:
    """Environment-parameterized cycle estimation policy."""
    return CyclePolicy(
        default_cycle_len_days=_env_int("CYCLE_DEFAULT_LEN_DAYS", 28),
        min_cycle_len_days=_env_int("CYCLE_MIN_LEN_DAYS", 18),
        max_cycle_len_days=_env_int("CYCLE_MAX_LEN_DAYS", 45),
        luteal_len_days=_env_int("CYCLE_LUTEAL_LEN_DAYS", 14),
        low_std_threshold_days=_env_float("CYCLE_LOW_STD_THRESHOLD_DAYS", 2.0),
        high_std_threshold_days=_env_float("CYCLE_HIGH_STD_THRESHOLD_DAYS", 5.0),
        low_cv_threshold=_env_float("CYCLE_LOW_CV_THRESHOLD", 0.08),
        high_cv_threshold=_env_float("CYCLE_HIGH_CV_THRESHOLD", 0.18),
        high_confidence_min_cycles=_env_int("CYCLE_HIGH_CONF_MIN_CYCLES", 4),
        med_confidence_min_cycles=_env_int("CYCLE_MED_CONF_MIN_CYCLES", 2),
        window_margin_low_days=_env_int("CYCLE_WINDOW_MARGIN_LOW_DAYS", 1),
        window_margin_med_days=_env_int("CYCLE_WINDOW_MARGIN_MED_DAYS", 2),
        window_margin_high_days=_env_int("CYCLE_WINDOW_MARGIN_HIGH_DAYS", 4),
        sigma_menstruation_days=_env_float("CYCLE_SIGMA_MENSTRUATION_DAYS", 1.8),
        sigma_follicular_days=_env_float("CYCLE_SIGMA_FOLLICULAR_DAYS", 3.2),
        sigma_ovulation_days=_env_float("CYCLE_SIGMA_OVULATION_DAYS", 1.1),
        sigma_luteal_days=_env_float("CYCLE_SIGMA_LUTEAL_DAYS", 3.8),
    )
