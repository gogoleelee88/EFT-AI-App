from __future__ import annotations

from pathlib import Path
from typing import List
import numpy as np

from scripts.har_core3.common import RawSample
from scripts.har_core3.config import DATASET_IDS


_UCI_SIGNAL_CANDIDATES = [
    # Prefer raw total acceleration for better cross-dataset alignment.
    ("total_acc_x", "total_acc_y", "total_acc_z"),
    # Backward-compatible fallback.
    ("body_acc_x", "body_acc_y", "body_acc_z"),
]

_IDX_TO_LABEL = {
    1: "WALKING",
    2: "WALKING_UPSTAIRS",
    3: "WALKING_DOWNSTAIRS",
    4: "SITTING",
    5: "STANDING",
    6: "LAYING",
}


def _load_split(root: Path, split: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    base = root / split
    sig_dir = base / "Inertial Signals"

    stacked = None
    for keys in _UCI_SIGNAL_CANDIDATES:
        paths = [sig_dir / f"{key}_{split}.txt" for key in keys]
        if not all(p.exists() for p in paths):
            continue
        mats = [np.loadtxt(path, dtype=np.float32) for path in paths]
        stacked = np.stack(mats, axis=-1)  # (N, T, C)
        break
    if stacked is None:
        wanted = ", ".join("/".join(keys) for keys in _UCI_SIGNAL_CANDIDATES)
        raise FileNotFoundError(f"Missing UCI inertial signal files for split={split}. looked_for={wanted}")

    y_raw = np.loadtxt(base / f"y_{split}.txt", dtype=np.int64)
    subjects = np.loadtxt(base / f"subject_{split}.txt", dtype=np.int64)
    return stacked, y_raw, subjects


def load_uci_har(root: Path) -> List[RawSample]:
    samples: List[RawSample] = []
    for split in ("train", "test"):
        X, y_raw, subjects = _load_split(root, split)
        for i in range(X.shape[0]):
            samples.append(
                RawSample(
                    sequence=X[i],
                    label_raw=_IDX_TO_LABEL.get(int(y_raw[i]), "UNKNOWN"),
                    subject_id=int(subjects[i]),
                    dataset_id=DATASET_IDS["uci"],
                    sampling_hz=50,
                )
            )
    return samples
