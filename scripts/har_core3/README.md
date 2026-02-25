# HAR Core-3 Week1 (RF Baseline)

This folder contains a standalone Week1 baseline pipeline for:
- Core-3 datasets: UCI HAR + WISDM + HHAR
- L0 labels: `walk, upstairs, downstairs, sit, stand, lay, unknown`
- Model: RandomForest (subject-wise split policy)

## 1) Minimal Environment

Use a separate virtual environment to avoid impacting other project features.

```powershell
python -m venv .venv-har
.\.venv-har\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r scripts/har_core3/requirements.txt
```

Notes:
- `pyarrow` is used for parquet prediction output.
- If parquet export fails, the pipeline automatically falls back to CSV and logs the format in metrics.
- This requirement set pins `numpy<2` for binary compatibility with common sklearn/pandas wheels.

For Android L0 TFLite training/export:

```powershell
python -m pip install -r scripts/har_core3/requirements_tflite.txt
```

## 2) Data Paths

Recommended raw data layout:

```text
data/har_core3/raw/uci_har/...
data/har_core3/raw/wisdm/...
data/har_core3/raw/hhar/...
```

Or pass absolute paths via CLI:
- UCI HAR root: either folder containing `train/`, `test/` or parent containing `UCI HAR Dataset/`
- WISDM root: folder containing `x_train.npy`, `y_train.npy`, `x_test.npy`, `y_test.npy`
- HHAR root: extracted folder containing CSV files (e.g. `Phones_accelerometer.csv`)

## 3) Run Commands

Preferred:

```powershell
python -m scripts.har_core3.run_week1_rf --mode dataset_only `
  --uci-root "C:\Users\lco20\Downloads\human+activity+recognition+using+smartphones (1)" `
  --wisdm-root "C:\Users\lco20\OneDrive\바탕 화면\archive\wisdm" `
  --hhar-root "C:\Users\lco20\Downloads\heterogeneity+activity+recognition"
```

Other modes:

```powershell
python -m scripts.har_core3.run_week1_rf --mode merged --uci-root "<UCI>" --wisdm-root "<WISDM>" --hhar-root "<HHAR>"
python -m scripts.har_core3.run_week1_rf --mode lodo --holdout hhar --uci-root "<UCI>" --wisdm-root "<WISDM>" --hhar-root "<HHAR>"
```

Faster subset run (useful when HHAR is large):

```powershell
python -m scripts.har_core3.run_week1_rf --mode dataset_only --datasets uci,wisdm --uci-root "<UCI>" --wisdm-root "<WISDM>" --hhar-root "<HHAR>"
```

Direct script execution is also supported:

```powershell
python scripts/har_core3/run_week1_rf.py --help
```

## 4) Outputs

Generated artifacts:

- Processed data:
  - `data/har_core3/processed/l0_windows_*.npz`
  - `data/har_core3/processed/l0_features_rf_*.npz`
  - `data/har_core3/processed/split_subject_*.json`
- Models:
  - `models/har_core3/rf/model_*.joblib`
  - `models/har_core3/rf/train_meta_*.json`
- Reports:
  - `models/har_core3/reports/metrics_*.csv`
    - includes `macro_f1` and `macro_f1_active` (support>0 classes)
  - `models/har_core3/reports/per_class_*.csv`
  - `models/har_core3/reports/confusion_*.csv`
  - `models/har_core3/reports/confusion_*.png` (optional if matplotlib available)
  - `models/har_core3/reports/predictions_*.parquet` (or `.csv` fallback)
  - `models/har_core3/reports/data_audit_*.json`
  - `models/har_core3/reports/run_manifest.json`
- Android metadata:
  - `models/har_core3/android/label_map.json`
  - `models/har_core3/android/preprocess_config.json`

## 5) Validation Checklist

Before trusting metrics:

1. Confirm `run_manifest.json` path values are correct.
2. Check `data_audit_*.json` for unknown label ratio and subject counts.
3. Ensure subject overlap is not present across train/test in split files.
4. Verify confusion matrix classes align with L0 label order.

## 6) Known Limits (Week1 Scope)

- WISDM subject IDs are used if `subject_train.npy` / `subject_test.npy` exist.
- If subject files are missing, fallback policy is `pseudo_subject_group_256`, which is safer than per-sample IDs but not equivalent to true subject IDs.
- WISDM numeric labels (`0..5`) are mapped using a common preprocessed convention:
  - `0:walk, 1:jogging->unknown, 2:upstairs, 3:downstairs, 4:sit, 5:stand`
- UCI uses `total_acc_{x,y,z}` first (fallback to `body_acc_{x,y,z}` only if missing).
- Preprocessing applies per-window, per-channel z-score normalization.
- Core-3 merge uses accelerometer-only channels (`x,y,z`) for channel consistency.
- L1 labels (`commute`, `work_focus`, etc.) are not trained in this Week1 RF pipeline; they belong to an upper context layer.

## 7) L1 Schedule Flow (Rules + Question Gate)

This repo now includes an L1 inference layer on top of L0 HAR output:
- Input: L0 probabilities (`walk...unknown`) + optional context (`hour`, `calendar_hint`, `speed_kmh`, etc.)
- Output: L1 top-k (`commute`, `work_focus`, `meeting`, `workout`, `meal`, `chores`, `relax`, `sleep`, `social`, `unknown_event`)
- Question gate: asks a clarification question when confidence is low or margin is small.

Main files:
- `scripts/har_core3/l1_flow.py`
- `scripts/har_core3/run_l1_flow.py`

Quick run:

```powershell
python -m scripts.har_core3.run_l1_flow `
  --l0-probs-json "{\"walk\":0.62,\"stand\":0.18,\"unknown\":0.20}" `
  --context-json "{\"hour\":8,\"calendar_hint\":\"commute\",\"speed_kmh\":5.8}"
```

From JSON file:

```powershell
python -m scripts.har_core3.run_l1_flow --input-file scripts/har_core3/sample_l1_input.json --out-file models/har_core3/reports/l1_inference_sample.json
```

`run_l1_flow` also emits `behavior_candidate_payload`, which can be posted to:
- `POST /api/spec/behavior/candidates`

If you pass `--candidate-id`, it also emits `behavior_question_payload` for:
- `POST /api/spec/behavior/questions`

## 8) Behavior API Bridge

To post L1 inference directly into behavior APIs:

```powershell
python -m scripts.har_core3.run_l1_behavior_bridge `
  --input-file scripts/har_core3/sample_l1_input.json `
  --api-base "http://127.0.0.1:8000" `
  --user-id "<USER_ID>"
```

Default bridge behavior:
- If `--day-id` is missing and `--user-id` is present, auto upsert `POST /api/spec/plan/day` first.
- POST candidate to `/api/spec/behavior/candidates?auto_ask=false`
- If question gate is open, POST question to `/api/spec/behavior/questions`

Useful options:
- `--server-auto-ask`: let backend auto-question logic handle it on candidate POST.
- `--skip-question-post`: only send candidate.
- `--dry-run`: compute and print payloads without API calls.
- `--no-auto-day-plan`: disable automatic day plan upsert.

Notes:
- If your DB enforces FK on `user_id` / `day_id`, pass valid existing values or omit them.
- `sample_l1_input.json` is FK-safe by default (`user_id`, `day_id` omitted).

Production (personalized) flow:
1. Create or upsert DayPlan first to get `day_id`:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/spec/plan/day" `
  -H "Content-Type: application/json" `
  -d "{\"user_id\":\"<USER_UUID>\",\"date\":\"2026-02-17\",\"mode\":70,\"items\":[]}"
```

2. Run bridge with valid `user_id` and `day_id`:

```powershell
python -m scripts.har_core3.run_l1_behavior_bridge `
  --input-file scripts/har_core3/sample_l1_input.json `
  --api-base "http://127.0.0.1:8000" `
  --user-id "<USER_UUID>" `
  --day-id <DAY_ID>
```

3. If you want cookie-auth user binding, pass:
- `--access-token "<JWT_ACCESS_TOKEN>"`

## 9) Train L0 TFLite for Android

This trains a Core-3 L0 HAR CNN (`walk/upstairs/downstairs/sit/stand/lay/unknown`) and exports:
- `har_l0.tflite`
- `l0_labels.txt`

Merged Core-3 training:

```powershell
python -m scripts.har_core3.train_l0_tflite `
  --mode merged `
  --uci-root "C:\Users\lco20\Downloads\human+activity+recognition+using+smartphones (1)" `
  --wisdm-root "C:\Users\lco20\OneDrive\바탕 화면\archive\wisdm" `
  --hhar-root "C:\Users\lco20\Downloads\heterogeneity+activity+recognition" `
  --epochs 20 `
  --float16
```

Leave-one-dataset-out generalization:

```powershell
python -m scripts.har_core3.train_l0_tflite `
  --mode lodo `
  --holdout hhar `
  --uci-root "<UCI>" `
  --wisdm-root "<WISDM>" `
  --hhar-root "<HHAR>" `
  --epochs 20
```

By default, the script also copies artifacts to Android assets:
- `mobile-agent-android/app/src/main/assets/behavior/har_l0.tflite`
- `mobile-agent-android/app/src/main/assets/behavior/l0_labels.txt`

Disable asset copy if needed:

```powershell
python -m scripts.har_core3.train_l0_tflite --skip-android-copy
```
