from __future__ import annotations

from typing import Optional

from scripts.har_core3.config import L0_TO_IDX


UCI_MAP = {
    "WALKING": "walk",
    "WALKING_UPSTAIRS": "upstairs",
    "WALKING_DOWNSTAIRS": "downstairs",
    "SITTING": "sit",
    "STANDING": "stand",
    "LAYING": "lay",
}

WISDM_MAP = {
    "walking": "walk",
    "upstairs": "upstairs",
    "downstairs": "downstairs",
    "sitting": "sit",
    "standing": "stand",
    "jogging": "unknown",
    # Common preprocessed WISDM index mapping (0..5).
    "0": "walk",
    "1": "unknown",  # jogging
    "2": "upstairs",
    "3": "downstairs",
    "4": "sit",
    "5": "stand",
}

HHAR_MAP = {
    "walk": "walk",
    "walking": "walk",
    "stairsup": "upstairs",
    "upstairs": "upstairs",
    "stairsdown": "downstairs",
    "downstairs": "downstairs",
    "sit": "sit",
    "sitting": "sit",
    "stand": "stand",
    "standing": "stand",
    "bike": "unknown",
    "biking": "unknown",
}


def _norm(raw: str) -> str:
    return str(raw or "").strip().lower()


def to_l0(dataset_name: str, raw_label: str) -> str:
    dataset = dataset_name.strip().lower()
    if dataset == "uci":
        return UCI_MAP.get(str(raw_label).strip().upper(), "unknown")
    if dataset == "wisdm":
        return WISDM_MAP.get(_norm(raw_label), "unknown")
    if dataset == "hhar":
        return HHAR_MAP.get(_norm(raw_label), "unknown")
    return "unknown"


def to_idx(l0_label: str) -> int:
    return L0_TO_IDX.get(l0_label, L0_TO_IDX["unknown"])


def raw_to_idx(dataset_name: str, raw_label: str) -> int:
    return to_idx(to_l0(dataset_name, raw_label))


def maybe_label(raw_label: Optional[str]) -> str:
    if raw_label is None:
        return "unknown"
    return str(raw_label)
