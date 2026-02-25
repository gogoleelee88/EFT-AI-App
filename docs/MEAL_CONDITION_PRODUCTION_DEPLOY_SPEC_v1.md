# Meal Condition Coaching Production Spec v1.0

## 1. Document Control
- Version: `1.0.0`
- Date: `2026-02-14`
- Product Positioning: `식후 컨디션 기반 업무 모드 추천 도구`
- Legal Positioning: `웰니스/컨디션 코칭 (비의료)`
- Scope: Backend API, DB schema, events, scheduler, compliance guardrails

## 2. Product Scope
- User records `FASTING | ATE`.
- Meal capture supports `0~N photos`.
- Track A: barcode/label -> structured nutrition source.
- Track B: photo estimate -> nutrition + confidence.
- T+30~45 required post-check, T+90 optional.
- `dip_score(0~100)` drives decision/task/next action advice.
- No diagnostic/treatment/prevention language.

## 3. System Components
- `Meal Capture`: meal creation/update/photo attachment.
- `Nutrition Engine`: Track A/B estimator with versioned outputs.
- `Post-Meal Scheduler`: T+35 and T+90 jobs with dedupe key.
- `Dip Scoring`: weighted formula from 0~4 Likert inputs.
- `Advice Engine`: deterministic mode mapping with confidence guardrail.
- `Analytics/Event Log`: KPI-ready immutable event stream.
- `Compliance Layer`: idempotency, tenant isolation, RBAC, audit.

## 4. API Contract (Production)

### 4.1 Endpoints
- `POST /api/v1/meals`
- `GET /api/v1/meals/{meal_id}`
- `PATCH /api/v1/meals/{meal_id}`
- `POST /api/v1/meals/{meal_id}/photos`
- `POST /api/v1/meals/{meal_id}/estimate`
- `GET /api/v1/meals/{meal_id}/estimate`
- `POST /api/v1/meals/{meal_id}/post-check`
- `GET /api/v1/meals/{meal_id}/post-checks`
- `GET /api/v1/meals/{meal_id}/advice`
- `POST /api/v1/scheduler/jobs`
- `POST /api/v1/notifications/trigger`
- `GET /api/v1/summaries/weekly`
- `POST /api/v1/consents`
- `POST /api/v1/consents/revoke`

### 4.2 Security and Access
- Auth: `Bearer JWT` or `access_token` cookie.
- Tenant: `X-Tenant-Id` required for team scope; omitted -> personal tenant fallback.
- Roles: `Owner | Admin | Member`.
- Owner/Admin gate: `POST /api/v1/notifications/trigger`.
- Tenant/user row filtering enforced on all meal resources.

### 4.3 Write Safety
- `Idempotency-Key` required on write endpoints.
- Scope key: `(tenant_id, method, path, idempotency_key)`.
- TTL: 48h.
- Same key + different payload -> `409 IDEMPOTENCY_CONFLICT`.

### 4.4 Rate Limits (per user)
- Read: `120/min`.
- Write: `60/min`.
- Estimate: `20/min`.
- Photo upload: `30/min`.
- Weekly summary: `30/min`.

## 5. Scoring and Advice Rules
- `score_t30 = round(((0.40*sleepiness + 0.35*focus_drop + 0.25*sluggishness)/4)*100 + opt_adj)`.
- `opt_adj = +5(gi_discomfort>=2) +5(headache>=2) -3(caffeine_used=true)`.
- `dip_score = score_t30` if T90 absent.
- `dip_score = round(0.7*score_t30 + 0.3*score_t90)` if T90 exists.
- Decision mode:
  - `dip >= 65` -> `DEFER`.
  - else -> `PROCEED_WITH_CAUTION` (or `PROCEED` when dip<=39 and confidence>=0.6).
- Task mode:
  - `>=65`: `RECOVERY`
  - `40~64`: `LIGHT`
  - `<=39`: `DEEP_WORK` when confidence>=0.6, else `LIGHT`.

## 6. Database Schema (Implemented)
- `tenant_memberships`
- `meal_logs`
- `meal_photos`
- `nutrition_estimates`
- `post_meal_checks`
- `meal_post_effects`
- `meal_advice`
- `consent_logs`
- `audit_logs`
- `device_tokens`
- `event_logs`
- `idempotency_keys`
- `meal_scheduler_jobs`

## 7. Event Specification
- `meal_logged`
- `photo_uploaded`
- `nutrition_estimated`
- `post_check_sent`
- `post_check_submitted`
- `advice_generated`
- `weekly_summary_viewed`
- Event payload always includes tenant/user pseudo context.

## 8. Compliance and Safety Controls
- Product copy must use wellness/conditioning language only.
- Medical claims prohibited in all UI/API-generated content.
- Confidence bucketing:
  - `high >= 0.80`
  - `med 0.55~0.79`
  - `low < 0.55`
- If confidence is low, recommendations remain conservative.
- Consent logs persisted with versioning and revoke trail.
- Audit logs capture actor/action/target metadata.

## 9. Deployment Notes
- Tables are auto-created via `Base.metadata.create_all()` at startup.
- New module wired at `backend/main.py` with prefix `/api/v1`.
- Backward compatibility map exposed at `GET /api/v1/compat/version-map`.
- Existing `/api/spec/condition/checkin` can coexist during migration.

## 10. Implementation Map
- Router: `backend/meal_coach/router.py`
- Models: `backend/meal_coach/models.py`
- Business logic: `backend/meal_coach/service.py`
- Auth/RBAC: `backend/meal_coach/authz.py`
- Idempotency: `backend/meal_coach/idempotency.py`
- Rate limit: `backend/meal_coach/rate_limit.py`
- App wiring: `backend/main.py`, `backend/database.py`

## 11. Acceptance Checklist
- [x] 12+ REST endpoints implemented.
- [x] Idempotency for writes.
- [x] Tenant isolation + role checks.
- [x] Required tables added.
- [x] Event logging for core loop.
- [x] Dip score/advice rules codified.
- [x] Weekly KPI summary endpoint implemented.

## Appendix A. JSON Examples

```json
{
  "meal_state": "ATE",
  "meal_time": "2026-02-14T12:10:00+09:00",
  "fasting_hours": 14.5,
  "source": "manual"
}
```

```json
{
  "slot": "T30",
  "sleepiness": 3,
  "focus_drop": 2,
  "sluggishness": 3,
  "gi_discomfort": 1,
  "headache": 0,
  "caffeine_used": false
}
```

```json
{
  "advice_id": "ad_123",
  "dip_score": 63,
  "decision_mode": "PROCEED_WITH_CAUTION",
  "task_mode": "LIGHT",
  "next_action": ["walk_8m", "water_250ml"],
  "confidence": 0.74,
  "why_tokens": ["dip_score_63", "confidence_med"],
  "versions": {
    "engine_version": "adv-2.1.0",
    "model_version": "rulepack-2026.02",
    "prompt_version": "adv_prompt_v5",
    "dataset_version": "coachset_2026w06"
  }
}
```

## Appendix B. No-Go Policy
- Do not output disease names as confirmed state.
- Do not output treatment/prevention claims.
- Do not claim medical-grade diagnosis.
- Do not expose individual employee data in org dashboards.
- Do not store raw photos beyond configured retention without explicit consent.

## Appendix C. Operations Runbook

### C.1 Health Checks
- API root: `GET /`
- Core health: `GET /api/health`
- Smoke path:
  1. `POST /api/v1/meals`
  2. `POST /api/v1/meals/{id}/estimate`
  3. `POST /api/v1/meals/{id}/post-check`
  4. `GET /api/v1/meals/{id}/advice`

### C.2 On-Call Alerts
- API 5xx > 2% for 5 min.
- `RATE_LIMIT_EXCEEDED` spikes (>5x baseline).
- `IDEMPOTENCY_CONFLICT` spikes (>2x baseline).
- Scheduler queue latency p95 > 5 min.
- Notification send failure > 1%.

### C.3 Incident Response
- Step 1: identify affected endpoint + tenant scope.
- Step 2: inspect `audit_logs` and `event_logs`.
- Step 3: activate conservative advice mode if scoring anomaly.
- Step 4: backfill/replay only idempotent-safe operations.
- Step 5: RCA within 48h.

### C.4 Data Retention Ops
- Consent logs: 5 years.
- Audit logs: 3 years.
- Meal/estimate/check/advice/events: 24 months default.
- Raw photo retention policy configurable, default OFF.
- Deletion request: processing stop immediately, deletion workflow ticket issued.

