# Menstrual Module QA Scenarios

## Scope
- Module endpoints under `/v1/menstrual/*`
- Policy validation: `phase_only_no_fertility`
- Privacy behavior: on-device mode

## Pre-conditions
- User is authenticated with `access_token` cookie.
- DB has at least one user row.
- Test dates use ISO format.

## Core Flow
1. Log bleeding start
- Request: `POST /v1/menstrual/bleeding`
- Expect: `200`, `event_id` present, `date` echoed.

2. Log symptoms
- Request: `POST /v1/menstrual/symptoms`
- Expect: `200`, normalized symptom keys accepted, invalid severity (`>4`) rejected with `422`.

3. Log PMDD-lite
- Request: `POST /v1/menstrual/pmdd-lite` with 12 answers.
- Expect:
  - `200`, `score.pmdd_symptom_index` in `0..100`.
  - `score.pms_severity_band` in `mild|moderate|severe`.
  - `score.question_labels_ko` includes Korean text.
  - `score.medical_disclaimer` present.

4. Calendar and prediction
- Request: `GET /v1/menstrual/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Expect:
  - `fertility_window_visible=false`
  - `phase_policy=phase_only_no_fertility`
  - each `phase_probabilities` object present.
- Request: `GET /v1/menstrual/prediction`
- Expect:
  - range values (`next_period_window_start/end`) or explicit insufficient response
  - `confidence_score`, `why_this`, `data_quality` always present

5. Insights
- Request: `GET /v1/menstrual/insights?from=...&to=...`
- Expect:
  - `symptom_trends`, `pmdd_index_timeline`, `worsening_days`, `top_triggers_in_worsening_days`
  - disclaimer present

6. Export
- Request: `POST /v1/menstrual/export`
- Expect: `job_id`, `status` returned
- Request: `GET /v1/menstrual/export/{jobId}`
- Expect status transitions and `ready_files`
- Request: `GET /v1/menstrual/export/{jobId}?format=csv|pdf`
- Expect downloadable payload

## On-device Mode Scenarios
1. Enable on-device mode
- Request: `PATCH /v1/menstrual/settings` with `{ "on_device_only": true }`
- Expect: `200`, `on_device_only=true`.

2. Sensitive log blocked
- Request: `POST /v1/menstrual/bleeding` (or symptoms/pmdd-lite/journal/meds/triggers)
- Expect: `409` with block message:
  - `On-device only mode is enabled. Sensitive menstrual logs are not accepted by the server.`

3. Export blocked by default
- Request: `POST /v1/menstrual/export` without `allow_server_export`
- Expect: `409`.

4. Export allowed with explicit consent
- Request: `POST /v1/menstrual/export` with `allow_server_export=true`
- Expect: `200`, job created/completed.

## Negative Cases
- Unauthorized call without cookie: `401`.
- `from > to` in query/export body: `400`/`422`.
- Query range > 366 days: `400`/`422`.
- PMDD-lite answers length out of `11..14`: `422`.
- PMDD-lite `question_ids` length mismatch: `422`.
- Export file request before completion: `409`.

## Regression Checks
- Existing Google login still works (`/api/auth/login`, `/api/auth/me`).
- Existing Google Calendar endpoints under `/api/spec/google/*` unaffected.
- No route conflict with existing `/api/spec/*` and `/api/*` paths.
