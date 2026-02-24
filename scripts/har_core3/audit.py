from __future__ import annotations

import json
from pathlib import Path
import numpy as np

from scripts.har_core3.config import L0_LABELS


def summarize_data(data: dict[str, np.ndarray], dataset_name: str) -> dict:
    y = data["y"]
    sid = data["subject_id"]
    ds = data["dataset_id"]
    counts = {}
    for i, label in enumerate(L0_LABELS):
        counts[label] = int((y == i).sum())
    unknown_count = counts.get("unknown", 0)
    return {
        "dataset_name": dataset_name,
        "num_samples": int(data["X"].shape[0]),
        "num_subjects": int(len(set(sid.astype(int).tolist()))),
        "dataset_ids": sorted(set(ds.astype(int).tolist())),
        "label_counts": counts,
        "unknown_ratio": float(unknown_count / max(1, data["X"].shape[0])),
        "shape": [int(v) for v in data["X"].shape],
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

