from __future__ import annotations

import json
from pathlib import Path
import random
import numpy as np


def make_subject_split(subject_id: np.ndarray, seed: int = 42, train_ratio: float = 0.7, val_ratio: float = 0.1) -> dict:
    uniq = sorted({int(v) for v in subject_id.tolist()})
    rnd = random.Random(seed)
    rnd.shuffle(uniq)
    n = len(uniq)
    n_train = max(1, int(n * train_ratio))
    n_val = max(1, int(n * val_ratio))
    n_train = min(n_train, n - 1)
    n_val = min(n_val, n - n_train - 1) if (n - n_train - 1) > 0 else 0
    train = uniq[:n_train]
    val = uniq[n_train : n_train + n_val]
    test = uniq[n_train + n_val :]
    if not test:
        test = [train.pop()]
    return {"train_subjects": train, "val_subjects": val, "test_subjects": test}


def write_subject_split(path: Path, split: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(split, ensure_ascii=False, indent=2), encoding="utf-8")


def read_subject_split(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))

