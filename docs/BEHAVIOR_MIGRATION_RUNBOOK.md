# Behavior Migration Runbook

This runbook applies the behavior clarification/timeline schema migration.

## Target SQL
- `backend/migrations/20260215_add_behavior_tables.sql`

## Local (PostgreSQL) apply
1. Ensure backend DB connection variables are set (`backend/.env`).
2. Apply SQL:
```powershell
psql "$env:DATABASE_URL" -f backend/migrations/20260215_add_behavior_tables.sql
```
3. Verify tables:
```powershell
psql "$env:DATABASE_URL" -c "\dt activity_candidates clarification_questions timeline_segments user_labels"
```
4. Verify indexes:
```powershell
psql "$env:DATABASE_URL" -c "\di ix_activity_candidates_user_ts ix_clarification_questions_user_status ix_timeline_segments_user_time ix_user_labels_user_id"
```

## Staging apply
1. Backup before change:
```powershell
pg_dump "$env:STAGING_DATABASE_URL" -Fc -f staging_pre_behavior_migration.dump
```
2. Apply migration SQL:
```powershell
psql "$env:STAGING_DATABASE_URL" -f backend/migrations/20260215_add_behavior_tables.sql
```
3. Smoke-check endpoints:
```powershell
curl.exe -s -X POST "http://127.0.0.1:8000/api/spec/behavior/candidates?user_id=demo-user" ^
  -H "Content-Type: application/json" ^
  -d "{\"user_id\":\"demo-user\",\"ts_start\":\"2026-02-15T00:00:00Z\",\"ts_end\":\"2026-02-15T00:00:05Z\",\"top1\":\"STILL+SCREEN_ON\",\"confidence\":0.5,\"margin_top1_top2\":0.08,\"mismatch_score\":0.7}"
```

## Rollback
- Tables are additive; rollback is application-level (disable feature flag / stop writing).
- Hard rollback (destructive) should be planned separately; do not drop tables in incident response.

## Post-check
1. Run tests:
```powershell
$env:PYTHONPATH='.'; pytest -q backend/tests/spec_loop/test_behavior_flow.py backend/tests/spec_loop/test_behavior_routes.py
```
2. Frontend type-check:
```powershell
npm --prefix frontend run -s type-check
```

