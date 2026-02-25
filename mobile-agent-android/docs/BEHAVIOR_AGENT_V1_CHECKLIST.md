# Behavior Agent v1 Checklist

## Goal
- Receive on-device motion samples.
- Build short windows (2.56s).
- Produce temporary L1 activity candidates.
- Send candidates to `POST /api/spec/behavior/candidates`.
- Keep delivery robust with offline queue + retry.

## Scope v1
- Foreground service only (no background scheduler yet).
- Accelerometer only (`TYPE_ACCELEROMETER`).
- Hybrid inference:
  - try direct L1 TFLite first (`assets/behavior/behavior_l1.tflite`)
  - if L1 is missing, try L0 HAR model (`assets/behavior/har_l0.tflite`) and map to L1 on-device
  - fallback heuristic (`workout`, `commute`, `sleep`, `work_focus`) when both models are missing/unavailable
- Candidate upload with `auto_ask=true`.
- No direct `/questions` POST from device in v1.

## Backend Contract
- Endpoint: `/api/spec/behavior/candidates`
- Method: `POST`
- Query:
  - `auto_ask=true`
  - optional `user_id=<uuid>`
- Body fields used:
  - `user_id`, `ts_start`, `ts_end`, `top1`
  - `activity_topk`, `confidence`, `margin_top1_top2`
  - `mismatch_score`, `trigger_reasons`, `pickup_flag`

## Implementation Checklist
- [x] Add behavior models and JSON helpers.
- [x] Add local queue repository (SharedPreferences JSON).
- [x] Add API client (HttpURLConnection).
- [x] Add config store (reuse `alarm_agent_sync` prefs).
- [x] Add foreground service skeleton:
  - sensor listener
  - windowing
  - heuristic inference
  - queue enqueue
  - flush + retry
- [x] Register service in AndroidManifest.
- [x] Connect start/stop controls in UI.
- [x] Add optional behavior access token input and persistence.
- [x] Validate start inputs (user_id/base URL/token) with user-facing errors.
- [x] Add question answer flow (`/questions/{id}/answer`) UI.
- [x] Add on-device direct L1 TFLite inference path.
- [x] Add L0 HAR TFLite inference + L0->L1 mapper fallback path.
- [x] Add external label-order files (`assets/behavior/l1_labels.txt`, `assets/behavior/l0_labels.txt`) support.
- [ ] Package trained `.tflite` model file for production.
- [ ] Add e2e instrumentation tests.

## Runtime Validation
1. Set backend URL + user id in existing main screen.
2. Start service:
   - `BehaviorAgentController.start(context)`
3. Verify queue drain:
   - watch logs for successful 2xx posts.
4. Verify backend:
   - `GET /api/spec/behavior/timeline?user_id=<uuid>`

## Risk Notes
- Foreground service is required for stable sensor collection.
- Missing valid `user_id` means anonymous logs only.
- If both model assets are missing, heuristic inference quality is low by design.
