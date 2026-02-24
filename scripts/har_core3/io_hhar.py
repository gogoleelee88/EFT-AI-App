from __future__ import annotations

from collections import defaultdict
import csv
from pathlib import Path
from typing import List
import numpy as np

from scripts.har_core3.common import RawSample
from scripts.har_core3.config import DATASET_IDS


def _candidate_files(root: Path) -> list[Path]:
    out: list[Path] = []
    for p in root.rglob("*.csv"):
        name = p.name.lower()
        if "acc" in name and ("phone" in name or "watch" in name or "accelerometer" in name):
            out.append(p)
    return out


def _field(row: dict, *keys: str, default: str = "") -> str:
    lower = {k.lower(): v for k, v in row.items()}
    for key in keys:
        if key.lower() in lower:
            return lower[key.lower()]
    return default


def _safe_float(v: str, fallback: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return fallback


def _safe_int(v: str, fallback: int = 0) -> int:
    try:
        return int(float(v))
    except Exception:
        return fallback


def _windowize(seq: np.ndarray, win_t: int = 128, stride_t: int = 64) -> list[np.ndarray]:
    if seq.shape[0] < win_t:
        return []
    out = []
    for s in range(0, seq.shape[0] - win_t + 1, stride_t):
        out.append(seq[s : s + win_t])
    return out


def load_hhar(root: Path) -> List[RawSample]:
    files = _candidate_files(root)
    if not files:
        raise FileNotFoundError(f"No HHAR accelerometer csv files found under: {root}")

    grouped: dict[tuple[str, str, str], list[tuple[int, np.ndarray]]] = defaultdict(list)
    for path in files:
        with path.open("r", encoding="utf-8", errors="ignore", newline="") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                label = _field(row, "gt", "label", default="unknown")
                if not label:
                    label = "unknown"
                user = _field(row, "user", default="unknown_user")
                device = _field(row, "device", "model", default="unknown_device")
                # Arrival_Time is in ms and better suited for gap-based segmentation.
                t = _safe_int(_field(row, "Arrival_Time", "arrival_time", "Creation_Time", "creation_time", default="0"))
                x = _safe_float(_field(row, "x", "acc_x", default="0"))
                y = _safe_float(_field(row, "y", "acc_y", default="0"))
                z = _safe_float(_field(row, "z", "acc_z", default="0"))
                grouped[(user, device, label)].append((t, np.array([x, y, z], dtype=np.float32)))

    samples: List[RawSample] = []
    subject_map: dict[str, int] = {}
    gap_threshold_ms = 1000
    for (user, _device, label), rows in grouped.items():
        if user not in subject_map:
            subject_map[user] = len(subject_map) + 1
        sid = subject_map[user]

        rows.sort(key=lambda x: x[0])
        # Split by temporal discontinuity first, then windowize.
        segments: list[list[np.ndarray]] = []
        cur: list[np.ndarray] = []
        prev_t: int | None = None
        for t, vec in rows:
            if prev_t is not None and (t - prev_t) > gap_threshold_ms and cur:
                segments.append(cur)
                cur = []
            cur.append(vec)
            prev_t = t
        if cur:
            segments.append(cur)

        for seg in segments:
            seq = np.stack(seg, axis=0)
            windows = _windowize(seq, win_t=128, stride_t=64)
            for w in windows:
                samples.append(
                    RawSample(
                        sequence=w,
                        label_raw=label,
                        subject_id=sid,
                        dataset_id=DATASET_IDS["hhar"],
                        sampling_hz=50,
                    )
                )
    return samples
