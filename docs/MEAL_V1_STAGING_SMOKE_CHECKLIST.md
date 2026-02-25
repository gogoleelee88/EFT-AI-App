# Meal V1 Staging Smoke Checklist

## 1) Pre-check
- Confirm backend is running and DB migration for meal tables is applied.
- Confirm frontend is deployed with `/meal-coach` and `/checkin`.
- Confirm test user can authenticate and has tenant mapping.

## 2) API smoke flow (manual)
- `POST /api/v1/meals` with `meal_state=ATE`
- `POST /api/v1/meals/{meal_id}/photos/upload` with 1-2 image files (multipart)
- `POST /api/v1/meals/{meal_id}/estimate` with `track=AUTO`
- `POST /api/v1/meals/{meal_id}/post-check` with slot `T30`
- `GET /api/v1/meals/{meal_id}/advice`
- `GET /api/v1/summaries/weekly`

Expected:
- All calls return `2xx`.
- `photos/upload` returns at least 1 uploaded item.
- `advice` returns `decision_mode`, `task_mode`, `next_action`.

## 3) Checkin linkage smoke
- Open `/checkin`.
- Select `DayPlan ID`.
- Select a `meal_id` in the new meal link dropdown.
- Submit checkin.

Expected:
- Checkin succeeds.
- No regression in existing checkin/adapt/simulate flows.
- Linked meal signal is included when meal link toggle is on.

## 4) KPI sanity
- Verify weekly summary values are non-negative:
  - `t30_response_rate`
  - `zero_input_meal_rate`
  - `advice_follow_rate`

## 5) Rollback gate
- If API error rate > 2% or advice route errors occur, rollback frontend to previous build and disable meal link toggle path.

## 6) Suggested local verification commands
```powershell
python -m py_compile backend/meal_coach/router.py backend/meal_coach/schemas.py
npm --prefix frontend run type-check
```

