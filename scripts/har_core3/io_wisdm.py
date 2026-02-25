from __future__ import annotations

from pathlib import Path
from typing import List
import numpy as np

from scripts.har_core3.common import RawSample
from scripts.har_core3.config import DATASET_IDS


def _as_label(v) -> str:
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="ignore")
    return str(v)


def _decode_labels(y: np.ndarray) -> list[str]:
    if y.ndim == 1:
        return [_as_label(v) for v in y]
    if y.ndim == 2 and y.shape[1] == 1:
        return [_as_label(v[0]) for v in y]
    if y.ndim == 2 and np.issubdtype(y.dtype, np.number):
        idx = y.argmax(axis=1)
        return [str(int(i)) for i in idx]
    return [_as_label(v) for v in y.reshape(-1)]


def _normalize_x(x: np.ndarray) -> np.ndarray:
    if x.ndim == 2:
        x = x[:, :, None]
    if x.ndim != 3:
        raise ValueError(f"Unsupported WISDM X shape: {x.shape}")
    return x.astype(np.float32)


def _load_pair(root: Path, split: str) -> tuple[np.ndarray, list[str]]:
    x_path = root / f"x_{split}.npy"
    y_path = root / f"y_{split}.npy"
    x = np.load(x_path, allow_pickle=True)
    y = np.load(y_path, allow_pickle=True)
    return _normalize_x(x), _decode_labels(y)


def _load_subjects(root: Path, split: str, n: int) -> tuple[np.ndarray, str]:
    # Preferred: explicit subject file if dataset export includes it.
    explicit = root / f"subject_{split}.npy"
    if explicit.exists():
        s = np.load(explicit, allow_pickle=True)
        s = np.asarray(s).reshape(-1)
        if s.shape[0] == n:
            return s.astype(np.int32), "explicit_subject_file"
    # Fallback: deterministic pseudo-groups to reduce optimistic leakage.
    # Not equivalent to true subject-wise split, but better than per-sample IDs.
    group_size = 256
    # Keep train/test pseudo groups disjoint without using very large IDs.
    offset = 50_000 if split == "test" else 0
    groups = np.arange(n, dtype=np.int32) // group_size
    groups = groups + 1 + offset
    return groups.astype(np.int32), "pseudo_subject_group_256"


def get_wisdm_subject_policy(root: Path) -> str:
    if (root / "subject_train.npy").exists() and (root / "subject_test.npy").exists():
        return "explicit_subject_file"
    return "pseudo_subject_group_256"


def load_wisdm(root: Path) -> List[RawSample]:
    samples: List[RawSample] = []
    for split in ("train", "test"):
        X, labels = _load_pair(root, split)
        subjects, _subject_policy = _load_subjects(root, split, X.shape[0])
        if len(labels) != X.shape[0]:
            raise ValueError(f"WISDM label count mismatch split={split}: X={X.shape[0]} y={len(labels)}")
        for i in range(X.shape[0]):
            samples.append(
                RawSample(
                    sequence=X[i],
                    label_raw=labels[i],
                    subject_id=int(subjects[i]),
                    dataset_id=DATASET_IDS["wisdm"],
                    sampling_hz=20,  # common WISDM setting
                )
            )
    return samples
