from __future__ import annotations

import json
from pathlib import Path

from scripts.har_core3.config import ANDROID_DIR, L0_LABELS, L1_LABELS, TARGET_HZ, TARGET_T
from scripts.har_core3.l1_flow import (
    DEFAULT_L1_CONFIDENCE_THRESHOLD,
    DEFAULT_L1_MARGIN_THRESHOLD,
    DEFAULT_QUESTION_EXPIRES_MINUTES,
)


def export_android_meta(out_dir: Path | None = None) -> None:
    target = out_dir or ANDROID_DIR
    target.mkdir(parents=True, exist_ok=True)

    label_map = {str(i): label for i, label in enumerate(L0_LABELS)}
    (target / "label_map.json").write_text(json.dumps(label_map, ensure_ascii=False, indent=2), encoding="utf-8")

    preprocess = {
        "sampling_hz": TARGET_HZ,
        "window_t": TARGET_T,
        "expected_channels": [0, 1, 2],  # x,y,z baseline
        "normalization": "zscore_per_window",
    }
    (target / "preprocess_config.json").write_text(
        json.dumps(preprocess, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    l1_policy = {
        "labels": L1_LABELS,
        "unknown_label": "unknown_event",
        "question_gate": {
            "confidence_threshold": DEFAULT_L1_CONFIDENCE_THRESHOLD,
            "margin_threshold": DEFAULT_L1_MARGIN_THRESHOLD,
            "expires_minutes": DEFAULT_QUESTION_EXPIRES_MINUTES,
        },
    }
    (target / "l1_policy.json").write_text(json.dumps(l1_policy, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    export_android_meta()
