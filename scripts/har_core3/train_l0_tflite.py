from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import random
import shutil
import sys
from typing import Any

import numpy as np

# Allow direct script execution as well as `python -m scripts.har_core3.train_l0_tflite`.
if __package__ in (None, ""):
    _ROOT = Path(__file__).resolve().parents[2]
    if str(_ROOT) not in sys.path:
        sys.path.insert(0, str(_ROOT))

from scripts.har_core3.config import ANDROID_DIR, L0_LABELS, RAW_HHAR_DIR, RAW_UCI_DIR, RAW_WISDM_DIR, ROOT
from scripts.har_core3.io_hhar import load_hhar
from scripts.har_core3.io_uci_har import load_uci_har
from scripts.har_core3.io_wisdm import load_wisdm
from scripts.har_core3.preprocess import build_npz, merge_npz
from scripts.har_core3.split_subject import make_subject_split


def _resolve_uci_root(p: Path) -> Path:
    if (p / "train").exists() and (p / "test").exists():
        return p
    child = p / "UCI HAR Dataset"
    if (child / "train").exists() and (child / "test").exists():
        return child
    nested = child / "UCI HAR Dataset"
    if (nested / "train").exists() and (nested / "test").exists():
        return nested
    for cand in p.rglob("*"):
        if not cand.is_dir():
            continue
        if "__MACOSX" in str(cand):
            continue
        if (cand / "train").exists() and (cand / "test").exists():
            return cand
    return p


def _uniquify_subjects(data: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    sid = data["subject_id"].astype(np.int64)
    ds = data["dataset_id"].astype(np.int64)
    data["subject_id"] = (ds * 1_000_000 + sid).astype(np.int32)
    return data


def _validate_data(data: dict[str, np.ndarray], name: str) -> None:
    if data["X"].ndim != 3:
        raise ValueError(f"{name}: X must be 3D, got {data['X'].shape}")
    if int(data["X"].shape[0]) <= 0:
        raise ValueError(f"{name}: no samples")
    if int(data["X"].shape[2]) < 3:
        raise ValueError(f"{name}: expected at least 3 channels, got {data['X'].shape[2]}")


def _mask_by_subject(subject_id: np.ndarray, subjects: list[int]) -> np.ndarray:
    allow = {int(v) for v in subjects}
    return np.asarray([int(v) in allow for v in subject_id.tolist()], dtype=bool)


def _ensure_nonempty_subject_split(split: dict[str, list[int]]) -> dict[str, list[int]]:
    train = list(split.get("train_subjects", []))
    val = list(split.get("val_subjects", []))
    test = list(split.get("test_subjects", []))
    if not train and val:
        train.append(val.pop())
    if not val and len(train) >= 2:
        val.append(train.pop())
    if not test and len(train) >= 2:
        test.append(train.pop())
    if not test and val:
        test.append(val[0])
    return {
        "train_subjects": sorted({int(v) for v in train}),
        "val_subjects": sorted({int(v) for v in val}),
        "test_subjects": sorted({int(v) for v in test}),
    }


def _load_core3(uci_root: Path, wisdm_root: Path, hhar_root: Path) -> dict[str, dict[str, np.ndarray]]:
    pool = {
        "uci": _uniquify_subjects(build_npz(load_uci_har(uci_root), "uci")),
        "wisdm": _uniquify_subjects(build_npz(load_wisdm(wisdm_root), "wisdm")),
        "hhar": _uniquify_subjects(build_npz(load_hhar(hhar_root), "hhar")),
    }
    for name, data in pool.items():
        _validate_data(data, name)
    ch = {name: int(data["X"].shape[2]) for name, data in pool.items()}
    if len(set(ch.values())) != 1:
        raise ValueError(f"Channel mismatch across datasets: {ch}")
    return pool


def _split_for_mode(pool: dict[str, dict[str, np.ndarray]], mode: str, holdout: str, seed: int) -> tuple[dict[str, np.ndarray], dict[str, list[int]], str]:
    if mode == "merged":
        data = merge_npz([pool["uci"], pool["wisdm"], pool["hhar"]])
        split = make_subject_split(data["subject_id"], seed=seed, train_ratio=0.7, val_ratio=0.15)
        split = _ensure_nonempty_subject_split(split)
        return data, split, "merged"

    if mode == "lodo":
        train_parts = [v for k, v in pool.items() if k != holdout]
        test_part = pool[holdout]
        train_data = merge_npz(train_parts)
        train_split = make_subject_split(train_data["subject_id"], seed=seed, train_ratio=0.85, val_ratio=0.0)
        train_subjects = list(train_split.get("train_subjects", []))
        val_subjects = list(train_split.get("test_subjects", []))
        if not val_subjects and len(train_subjects) >= 2:
            val_subjects.append(train_subjects.pop())
        split = {
            "train_subjects": sorted({int(v) for v in train_subjects}),
            "val_subjects": sorted({int(v) for v in val_subjects}),
            "test_subjects": sorted({int(v) for v in test_part["subject_id"].astype(int).tolist()}),
        }
        split = _ensure_nonempty_subject_split(split)
        data = merge_npz([train_data, test_part])
        return data, split, f"lodo_{holdout}"

    raise ValueError(f"Unsupported mode: {mode}")


def _compute_class_weight(y: np.ndarray) -> dict[int, float]:
    counts = np.bincount(y.astype(np.int64), minlength=len(L0_LABELS))
    total = int(np.sum(counts))
    if total <= 0:
        return {}
    out: dict[int, float] = {}
    for cls_idx, cnt in enumerate(counts.tolist()):
        if cnt <= 0:
            continue
        out[int(cls_idx)] = float(total / (len(L0_LABELS) * cnt))
    return out


def _build_model(input_shape: tuple[int, int], num_classes: int):
    try:
        import tensorflow as tf
    except Exception as exc:
        raise RuntimeError(
            "TensorFlow is required for L0 TFLite training. Install from scripts/har_core3/requirements_tflite.txt"
        ) from exc

    inputs = tf.keras.Input(shape=input_shape, name="acc_window")
    x = tf.keras.layers.Conv1D(32, 5, padding="same", use_bias=False)(inputs)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.ReLU()(x)
    x = tf.keras.layers.Conv1D(64, 5, strides=2, padding="same", use_bias=False)(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.ReLU()(x)
    x = tf.keras.layers.Conv1D(96, 3, strides=2, padding="same", use_bias=False)(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.ReLU()(x)
    x = tf.keras.layers.GlobalAveragePooling1D()(x)
    x = tf.keras.layers.Dense(96, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax", name="l0_probs")(x)
    return tf.keras.Model(inputs=inputs, outputs=outputs, name="har_l0_cnn")


def _macro_f1(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    try:
        from sklearn.metrics import f1_score
    except Exception as exc:
        raise RuntimeError("scikit-learn is required to compute macro_f1") from exc
    return float(f1_score(y_true, y_pred, average="macro"))


def _write_confusion_csv(path: Path, y_true: np.ndarray, y_pred: np.ndarray) -> None:
    try:
        from sklearn.metrics import confusion_matrix
    except Exception as exc:
        raise RuntimeError("scikit-learn is required to compute confusion matrix") from exc
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(L0_LABELS))))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow([""] + L0_LABELS)
        for idx, label in enumerate(L0_LABELS):
            writer.writerow([label] + [int(v) for v in cm[idx]])


def _predict(model, x: np.ndarray) -> np.ndarray:
    probs = model.predict(x, verbose=0)
    return np.argmax(probs, axis=1).astype(np.int64)


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run(args) -> None:
    random.seed(args.seed)
    np.random.seed(args.seed)

    uci_root = _resolve_uci_root(Path(args.uci_root))
    wisdm_root = Path(args.wisdm_root)
    hhar_root = Path(args.hhar_root)

    pool = _load_core3(uci_root, wisdm_root, hhar_root)
    data, split, tag = _split_for_mode(pool, args.mode, args.holdout, args.seed)
    _validate_data(data, tag)

    x = data["X"].astype(np.float32)
    y = data["y"].astype(np.int64)
    sid = data["subject_id"].astype(np.int64)

    train_mask = _mask_by_subject(sid, split["train_subjects"])
    val_mask = _mask_by_subject(sid, split.get("val_subjects", []))
    test_mask = _mask_by_subject(sid, split["test_subjects"])

    if not train_mask.any():
        raise ValueError("No training samples after subject split.")
    if not test_mask.any():
        raise ValueError("No test samples after subject split.")

    x_train = x[train_mask]
    y_train = y[train_mask]
    x_val = x[val_mask]
    y_val = y[val_mask]
    x_test = x[test_mask]
    y_test = y[test_mask]

    model = _build_model(input_shape=(x.shape[1], x.shape[2]), num_classes=len(L0_LABELS))
    try:
        import tensorflow as tf
    except Exception as exc:
        raise RuntimeError("TensorFlow import failed during compile step") from exc

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=float(args.lr)),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(),
        metrics=[tf.keras.metrics.SparseCategoricalAccuracy(name="acc")],
    )

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_acc" if x_val.shape[0] > 0 else "acc",
            patience=int(args.patience),
            restore_best_weights=True,
            mode="max",
        )
    ]

    class_weight = _compute_class_weight(y_train)
    fit_kwargs: dict[str, Any] = {
        "x": x_train,
        "y": y_train,
        "batch_size": int(args.batch_size),
        "epochs": int(args.epochs),
        "callbacks": callbacks,
        "verbose": 2,
        "class_weight": class_weight,
    }
    if x_val.shape[0] > 0:
        fit_kwargs["validation_data"] = (x_val, y_val)
    else:
        fit_kwargs["validation_split"] = 0.1
    history = model.fit(**fit_kwargs)

    pred_val = _predict(model, x_val) if x_val.shape[0] > 0 else np.asarray([], dtype=np.int64)
    pred_test = _predict(model, x_test)

    val_macro_f1 = _macro_f1(y_val, pred_val) if x_val.shape[0] > 0 else None
    test_macro_f1 = _macro_f1(y_test, pred_test)
    test_acc = float((pred_test == y_test).mean())
    val_acc = float((pred_val == y_val).mean()) if x_val.shape[0] > 0 else None

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    model_out = out_dir / args.model_name
    labels_out = out_dir / "l0_labels.txt"

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    if args.float16:
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]
    tflite_model = converter.convert()
    model_out.write_bytes(tflite_model)
    labels_out.write_text("\n".join(L0_LABELS) + "\n", encoding="utf-8")

    _write_confusion_csv(out_dir / f"confusion_l0_{tag}.csv", y_test, pred_test)

    history_last = {k: _safe_float(v[-1]) for k, v in history.history.items() if v}
    meta = {
        "tag": tag,
        "mode": args.mode,
        "holdout": args.holdout if args.mode == "lodo" else None,
        "paths": {
            "uci_root": str(uci_root),
            "wisdm_root": str(wisdm_root),
            "hhar_root": str(hhar_root),
            "out_dir": str(out_dir),
        },
        "input_shape": [int(x.shape[1]), int(x.shape[2])],
        "num_classes": len(L0_LABELS),
        "labels": L0_LABELS,
        "split": split,
        "counts": {
            "train": int(x_train.shape[0]),
            "val": int(x_val.shape[0]),
            "test": int(x_test.shape[0]),
        },
        "metrics": {
            "val_macro_f1": val_macro_f1,
            "test_macro_f1": test_macro_f1,
            "val_acc": val_acc,
            "test_acc": test_acc,
        },
        "history_last": history_last,
        "model_name": args.model_name,
        "float16": bool(args.float16),
    }
    _write_json(out_dir / f"train_l0_meta_{tag}.json", meta)

    if not args.skip_android_copy:
        asset_dir = Path(args.android_asset_dir)
        asset_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(model_out, asset_dir / "har_l0.tflite")
        shutil.copy2(labels_out, asset_dir / "l0_labels.txt")
        _write_json(
            out_dir / f"android_copy_{tag}.json",
            {
                "asset_dir": str(asset_dir),
                "model": str(asset_dir / "har_l0.tflite"),
                "labels": str(asset_dir / "l0_labels.txt"),
            },
        )

    print(f"[done] model={model_out}")
    print(f"[done] labels={labels_out}")
    print(f"[done] test_macro_f1={test_macro_f1:.6f}, test_acc={test_acc:.6f}")


def parse_args():
    p = argparse.ArgumentParser(description="Train Core-3 L0 HAR CNN and export TFLite for Android.")
    p.add_argument("--mode", choices=["merged", "lodo"], default="merged")
    p.add_argument("--holdout", choices=["uci", "wisdm", "hhar"], default="hhar")
    p.add_argument("--uci-root", default=str(RAW_UCI_DIR))
    p.add_argument("--wisdm-root", default=str(RAW_WISDM_DIR))
    p.add_argument("--hhar-root", default=str(RAW_HHAR_DIR))
    p.add_argument("--epochs", type=int, default=20)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--patience", type=int, default=4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--float16", action="store_true", help="Enable float16 post-training quantization.")
    p.add_argument("--out-dir", default=str(ANDROID_DIR))
    p.add_argument("--model-name", default="har_l0.tflite")
    p.add_argument(
        "--android-asset-dir",
        default=str(ROOT / "mobile-agent-android" / "app" / "src" / "main" / "assets" / "behavior"),
    )
    p.add_argument("--skip-android-copy", action="store_true")
    return p.parse_args()


if __name__ == "__main__":
    run(parse_args())
