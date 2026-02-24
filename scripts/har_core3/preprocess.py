from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable
import numpy as np

from scripts.har_core3.common import RawSample
from scripts.har_core3.config import TARGET_HZ, TARGET_T, WINDOW_STANDARDIZE, WINDOW_STANDARDIZE_EPS
from scripts.har_core3.label_map import to_l0, to_idx


def _resample_by_hz(x: np.ndarray, src_hz: int, target_hz: int) -> np.ndarray:
    if src_hz <= 0 or src_hz == target_hz:
        return x.astype(np.float32)
    target_len = max(1, int(round(x.shape[0] * float(target_hz) / float(src_hz))))
    return _resample_sequence(x, target_len)


def _resample_sequence(x: np.ndarray, target_t: int) -> np.ndarray:
    t_in, c = x.shape
    if t_in == target_t:
        return x.astype(np.float32)
    src = np.linspace(0.0, 1.0, num=t_in)
    dst = np.linspace(0.0, 1.0, num=target_t)
    out = np.zeros((target_t, c), dtype=np.float32)
    for i in range(c):
        out[:, i] = np.interp(dst, src, x[:, i]).astype(np.float32)
    return out


def _fit_target_window(x: np.ndarray, target_t: int) -> np.ndarray:
    t, c = x.shape
    if t == target_t:
        return x.astype(np.float32)
    if t > target_t:
        start = max(0, (t - target_t) // 2)
        return x[start : start + target_t].astype(np.float32)
    pad = np.zeros((target_t - t, c), dtype=np.float32)
    return np.concatenate([x.astype(np.float32), pad], axis=0)


def _standardize_window(x: np.ndarray, eps: float) -> np.ndarray:
    # Per-window, per-channel z-score normalization to reduce cross-dataset scale drift.
    mean = np.mean(x, axis=0, keepdims=True)
    std = np.std(x, axis=0, keepdims=True)
    std = np.where(std < eps, 1.0, std)
    return ((x - mean) / std).astype(np.float32)


def build_npz(samples: Iterable[RawSample], dataset_name: str) -> dict[str, np.ndarray]:
    xs, ys, subjects, ds_ids = [], [], [], []
    for s in samples:
        seq = np.asarray(s.sequence, dtype=np.float32)
        if seq.ndim != 2:
            continue
        seq = _resample_by_hz(seq, int(s.sampling_hz), TARGET_HZ)
        seq = _fit_target_window(seq, TARGET_T)
        if WINDOW_STANDARDIZE:
            seq = _standardize_window(seq, WINDOW_STANDARDIZE_EPS)
        l0 = to_l0(dataset_name, s.label_raw)
        y = to_idx(l0)
        xs.append(seq)
        ys.append(y)
        subjects.append(int(s.subject_id))
        ds_ids.append(int(s.dataset_id))
    if not xs:
        raise ValueError(f"No valid samples after preprocessing dataset={dataset_name}")
    return {
        "X": np.stack(xs, axis=0).astype(np.float32),
        "y": np.asarray(ys, dtype=np.int64),
        "subject_id": np.asarray(subjects, dtype=np.int32),
        "dataset_id": np.asarray(ds_ids, dtype=np.int8),
    }


def merge_npz(parts: list[dict[str, np.ndarray]]) -> dict[str, np.ndarray]:
    return {
        "X": np.concatenate([p["X"] for p in parts], axis=0),
        "y": np.concatenate([p["y"] for p in parts], axis=0),
        "subject_id": np.concatenate([p["subject_id"] for p in parts], axis=0),
        "dataset_id": np.concatenate([p["dataset_id"] for p in parts], axis=0),
    }


def save_processed(out_path: Path, data: dict[str, np.ndarray], channels: list[str] | None = None) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_path, **data)
    meta = {
        "sampling_hz": TARGET_HZ,
        "window_t": TARGET_T,
        "channels": channels or [],
        "num_samples": int(data["X"].shape[0]),
    }
    meta_path = out_path.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
