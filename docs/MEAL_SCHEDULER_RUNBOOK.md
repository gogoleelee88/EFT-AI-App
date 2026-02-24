# Meal Scheduler Runbook

## 1) Worker execution
- One-shot:
```powershell
$env:PYTHONPATH='.'; python scripts/run_meal_scheduler_worker.py --once --limit 200 --quiet-policy next_window --channel push
```
- Loop mode (daemon):
```powershell
$env:PYTHONPATH='.'; python scripts/run_meal_scheduler_worker.py --interval-sec 60 --limit 200 --quiet-policy next_window --channel push
```

## 2) Windows Task Scheduler example
- Trigger: every 1 minute
- Action:
  - Program: `python`
  - Args: `scripts/run_meal_scheduler_worker.py --once --limit 200 --quiet-policy next_window --channel push`
  - Start in: repo root

## 3) Linux cron example
```cron
* * * * * cd /srv/eft-ai-app && PYTHONPATH=. /usr/bin/python3 scripts/run_meal_scheduler_worker.py --once --limit 200 --quiet-policy next_window --channel push >> /var/log/meal-worker.log 2>&1
```

## 4) Push provider notes
- Current adapter uses Firebase Admin SDK.
- Required:
  - `FIREBASE_CREDENTIALS_JSON` or firebase admin credential file.
  - Valid device tokens saved in `device_tokens` table.
- If Firebase is not initialized, jobs become `failed` with `last_error=FIREBASE_ADMIN_NOT_INITIALIZED`.

## 5) API support
- Register token: `POST /api/v1/device-tokens`
- List token: `GET /api/v1/device-tokens`
- Deactivate token: `DELETE /api/v1/device-tokens/{token_id}`
- Run due jobs: `POST /api/v1/scheduler/run-due`

