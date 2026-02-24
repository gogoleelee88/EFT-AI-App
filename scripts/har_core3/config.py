from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

RAW_UCI_DIR = ROOT / "data" / "har_core3" / "raw" / "uci_har"
RAW_WISDM_DIR = ROOT / "data" / "har_core3" / "raw" / "wisdm"
RAW_HHAR_DIR = ROOT / "data" / "har_core3" / "raw" / "hhar"

PROCESSED_DIR = ROOT / "data" / "har_core3" / "processed"
MODEL_DIR = ROOT / "models" / "har_core3" / "rf"
REPORT_DIR = ROOT / "models" / "har_core3" / "reports"
ANDROID_DIR = ROOT / "models" / "har_core3" / "android"

TARGET_HZ = 50
WINDOW_SEC = 2.56
STRIDE_SEC = 1.28
TARGET_T = int(TARGET_HZ * WINDOW_SEC)
WINDOW_STANDARDIZE = True
WINDOW_STANDARDIZE_EPS = 1e-6

DATASET_IDS = {"uci": 0, "wisdm": 1, "hhar": 2}

L0_LABELS = [
    "walk",
    "upstairs",
    "downstairs",
    "sit",
    "stand",
    "lay",
    "unknown",
]
L0_TO_IDX = {label: i for i, label in enumerate(L0_LABELS)}

L1_LABELS = [
    "commute",
    "work_focus",
    "meeting",
    "workout",
    "meal",
    "chores",
    "relax",
    "sleep",
    "social",
    "unknown_event",
]
L1_TO_IDX = {label: i for i, label in enumerate(L1_LABELS)}
