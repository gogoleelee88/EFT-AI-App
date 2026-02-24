from __future__ import annotations

import json
from pathlib import Path
import numpy as np

from scripts.har_core3.split_subject import read_subject_split


def _mask_by_subject(subjects: np.ndarray, allow: list[int]) -> np.ndarray:
    allow_set = {int(x) for x in allow}
    return np.asarray([int(s) in allow_set for s in subjects], dtype=bool)


def train_rf(feature_npz: Path, split_json: Path, out_model_path: Path, out_meta_path: Path) -> None:
    try:
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.metrics import f1_score
        import joblib
    except Exception as exc:
        raise RuntimeError("train_rf requires scikit-learn and joblib.") from exc

    data = np.load(feature_npz, allow_pickle=True)
    split = read_subject_split(split_json)

    Xf = data["Xf"]
    y = data["y"]
    sid = data["subject_id"]

    train_mask = _mask_by_subject(sid, split["train_subjects"])
    val_mask = _mask_by_subject(sid, split.get("val_subjects", []))
    test_mask = _mask_by_subject(sid, split["test_subjects"])

    model = RandomForestClassifier(
        n_estimators=400,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(Xf[train_mask], y[train_mask])

    val_f1 = None
    if val_mask.any():
        pred_val = model.predict(Xf[val_mask])
        val_f1 = float(f1_score(y[val_mask], pred_val, average="macro"))

    pred_test = model.predict(Xf[test_mask])
    test_f1 = float(f1_score(y[test_mask], pred_test, average="macro"))

    out_model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, out_model_path)

    meta = {
        "n_train": int(train_mask.sum()),
        "n_val": int(val_mask.sum()),
        "n_test": int(test_mask.sum()),
        "val_macro_f1": val_f1,
        "test_macro_f1": test_f1,
        "feature_dim": int(Xf.shape[1]),
    }
    out_meta_path.parent.mkdir(parents=True, exist_ok=True)
    out_meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

