from __future__ import annotations

import argparse
import json
from pathlib import Path
import random
import sys
import numpy as np

# Allow direct script execution as well as `python -m scripts.har_core3.run_week1_rf`.
if __package__ in (None, ""):
    _ROOT = Path(__file__).resolve().parents[2]
    if str(_ROOT) not in sys.path:
        sys.path.insert(0, str(_ROOT))

from scripts.har_core3.config import (
    RAW_HHAR_DIR,
    RAW_UCI_DIR,
    RAW_WISDM_DIR,
    PROCESSED_DIR,
    MODEL_DIR,
    REPORT_DIR,
)
from scripts.har_core3.io_hhar import load_hhar
from scripts.har_core3.io_uci_har import load_uci_har
from scripts.har_core3.io_wisdm import get_wisdm_subject_policy, load_wisdm
from scripts.har_core3.preprocess import build_npz, merge_npz, save_processed
from scripts.har_core3.features_rf import build_feature_file
from scripts.har_core3.split_subject import make_subject_split, write_subject_split
from scripts.har_core3.train_rf import train_rf
from scripts.har_core3.eval_rf import evaluate_rf
from scripts.har_core3.audit import summarize_data, write_json


def _resolve_uci_root(p: Path) -> Path:
    if (p / "train").exists() and (p / "test").exists():
        return p
    child = p / "UCI HAR Dataset"
    if (child / "train").exists() and (child / "test").exists():
        return child
    nested = child / "UCI HAR Dataset"
    if (nested / "train").exists() and (nested / "test").exists():
        return nested
    # Last fallback: search recursively for a directory that contains train/test.
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
    # Keep dataset-local subject ids disjoint across Core-3 datasets.
    data["subject_id"] = (ds * 1_000_000 + sid).astype(np.int32)
    return data


def _validate_dataset_ready(data: dict[str, np.ndarray], name: str) -> None:
    if data["X"].ndim != 3:
        raise ValueError(f"{name}: X must be 3D, got {data['X'].shape}")
    # Require at least one non-unknown sample for meaningful training.
    non_unknown = int((data["y"] != data["y"].max()).sum()) if data["y"].size else 0
    if non_unknown <= 0:
        raise ValueError(f"{name}: all labels are mapped to unknown. Check label mapping.")


def _assert_same_channels(parts: list[dict[str, np.ndarray]], names: list[str]) -> None:
    ch = [int(p["X"].shape[2]) for p in parts]
    if len(set(ch)) != 1:
        raise ValueError(f"Channel mismatch across datasets: {dict(zip(names, ch))}")


def _run_single(dataset_name: str, samples, tag: str) -> None:
    data = build_npz(samples, dataset_name)
    data = _uniquify_subjects(data)
    _validate_dataset_ready(data, tag)
    write_json(REPORT_DIR / f"data_audit_{tag}.json", summarize_data(data, dataset_name=tag))

    proc_npz = PROCESSED_DIR / f"l0_windows_{tag}.npz"
    save_processed(proc_npz, data)

    feat_npz = PROCESSED_DIR / f"l0_features_rf_{tag}.npz"
    build_feature_file(proc_npz, feat_npz)

    split = make_subject_split(data["subject_id"], seed=42)
    split_path = PROCESSED_DIR / f"split_subject_{tag}.json"
    write_subject_split(split_path, split)

    model_path = MODEL_DIR / f"model_{tag}.joblib"
    meta_path = MODEL_DIR / f"train_meta_{tag}.json"
    train_rf(feat_npz, split_path, model_path, meta_path)
    evaluate_rf(model_path, feat_npz, split_path, REPORT_DIR, tag=tag)


def run_all(args) -> None:
    random.seed(42)
    np.random.seed(42)

    uci_root = _resolve_uci_root(Path(args.uci_root))
    wisdm_root = Path(args.wisdm_root)
    hhar_root = Path(args.hhar_root)

    run_manifest = {
        "mode": args.mode,
        "holdout": args.holdout,
        "paths": {
            "uci_root": str(uci_root),
            "wisdm_root": str(wisdm_root),
            "hhar_root": str(hhar_root),
        },
        "wisdm_subject_policy": get_wisdm_subject_policy(wisdm_root),
    }
    write_json(REPORT_DIR / "run_manifest.json", run_manifest)

    selected = {s.strip().lower() for s in str(args.datasets).split(",") if s.strip()}
    if not selected:
        selected = {"uci", "wisdm", "hhar"}

    uci_samples = load_uci_har(uci_root) if "uci" in selected else []
    wisdm_samples = load_wisdm(wisdm_root) if "wisdm" in selected else []
    hhar_samples = load_hhar(hhar_root) if "hhar" in selected else []

    if args.mode == "dataset_only":
        if "uci" in selected:
            _run_single("uci", uci_samples, "uci")
        if "wisdm" in selected:
            _run_single("wisdm", wisdm_samples, "wisdm")
        if "hhar" in selected:
            _run_single("hhar", hhar_samples, "hhar")
        return

    if args.mode == "merged":
        need = {"uci", "wisdm", "hhar"}
        missing = need - selected
        if missing:
            raise ValueError(f"mode=merged requires datasets=uci,wisdm,hhar. missing={sorted(missing)}")
        u = build_npz(uci_samples, "uci")
        w = build_npz(wisdm_samples, "wisdm")
        h = build_npz(hhar_samples, "hhar")
        _validate_dataset_ready(u, "uci")
        _validate_dataset_ready(w, "wisdm")
        _validate_dataset_ready(h, "hhar")
        _assert_same_channels([u, w, h], ["uci", "wisdm", "hhar"])
        merged = _uniquify_subjects(merge_npz([u, w, h]))
        write_json(REPORT_DIR / "data_audit_merged.json", summarize_data(merged, dataset_name="merged"))
        proc_npz = PROCESSED_DIR / "l0_windows_merged.npz"
        save_processed(proc_npz, merged)
        feat_npz = PROCESSED_DIR / "l0_features_rf_merged.npz"
        build_feature_file(proc_npz, feat_npz)
        split = make_subject_split(merged["subject_id"], seed=42)
        split_path = PROCESSED_DIR / "split_subject_merged.json"
        write_subject_split(split_path, split)
        model_path = MODEL_DIR / "model_merged.joblib"
        meta_path = MODEL_DIR / "train_meta_merged.json"
        train_rf(feat_npz, split_path, model_path, meta_path)
        evaluate_rf(model_path, feat_npz, split_path, REPORT_DIR, tag="merged")
        return

    if args.mode == "lodo":
        need = {"uci", "wisdm", "hhar"}
        missing = need - selected
        if missing:
            raise ValueError(f"mode=lodo requires datasets=uci,wisdm,hhar. missing={sorted(missing)}")
        holdout = args.holdout
        pool = {
            "uci": build_npz(uci_samples, "uci"),
            "wisdm": build_npz(wisdm_samples, "wisdm"),
            "hhar": build_npz(hhar_samples, "hhar"),
        }
        _validate_dataset_ready(pool["uci"], "uci")
        _validate_dataset_ready(pool["wisdm"], "wisdm")
        _validate_dataset_ready(pool["hhar"], "hhar")
        _assert_same_channels([pool["uci"], pool["wisdm"], pool["hhar"]], ["uci", "wisdm", "hhar"])
        train_parts = [v for k, v in pool.items() if k != holdout]
        test_part = pool[holdout]
        merged = _uniquify_subjects(merge_npz(train_parts + [test_part]))
        write_json(REPORT_DIR / f"data_audit_lodo_{holdout}.json", summarize_data(merged, dataset_name=f"lodo_{holdout}"))

        proc_npz = PROCESSED_DIR / f"l0_windows_lodo_{holdout}.npz"
        save_processed(proc_npz, merged)
        feat_npz = PROCESSED_DIR / f"l0_features_rf_lodo_{holdout}.npz"
        build_feature_file(proc_npz, feat_npz)

        test_sid = set((test_part["dataset_id"] * 1_000_000 + test_part["subject_id"]).astype(int).tolist())
        all_sid = set(merged["subject_id"].astype(int).tolist())
        train_sid = sorted(all_sid - test_sid)
        test_sid = sorted(test_sid)
        split = {"train_subjects": train_sid, "val_subjects": [], "test_subjects": test_sid}
        split_path = PROCESSED_DIR / f"split_subject_lodo_{holdout}.json"
        write_subject_split(split_path, split)

        model_path = MODEL_DIR / f"model_lodo_{holdout}.joblib"
        meta_path = MODEL_DIR / f"train_meta_lodo_{holdout}.json"
        train_rf(feat_npz, split_path, model_path, meta_path)
        evaluate_rf(model_path, feat_npz, split_path, REPORT_DIR, tag=f"lodo_{holdout}")
        return

    raise ValueError(f"Unsupported mode: {args.mode}")


def parse_args():
    parser = argparse.ArgumentParser(description="Week1 RF pipeline for Core-3 HAR")
    parser.add_argument("--mode", choices=["dataset_only", "merged", "lodo"], default="dataset_only")
    parser.add_argument("--holdout", choices=["uci", "wisdm", "hhar"], default="hhar")
    parser.add_argument(
        "--datasets",
        default="uci,wisdm,hhar",
        help="Comma-separated subset for mode=dataset_only (default: uci,wisdm,hhar)",
    )
    parser.add_argument("--uci-root", default=str(RAW_UCI_DIR))
    parser.add_argument("--wisdm-root", default=str(RAW_WISDM_DIR))
    parser.add_argument("--hhar-root", default=str(RAW_HHAR_DIR))
    return parser.parse_args()


if __name__ == "__main__":
    run_all(parse_args())
