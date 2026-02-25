# SECURITY_STRICT_MISSION_RUN Rollout

## Flag
- env: `SECURITY_STRICT_MISSION_RUN`
- default: `false`
- behavior when `true`:
  - `POST /api/spec/missions/check-alarm` requires `mission_run_id`
  - `POST /api/spec/missions/dismiss-alarm` requires `mission_run_id`
  - `mission_run_id` must match `day_id` and optional `user_id`

## Stage Plan
1. Stage 0 (current, safe default)
- Set `SECURITY_STRICT_MISSION_RUN=false`.
- Frontend sends `mission_run_id` opportunistically.
- Old clients still work.

2. Stage 1 (pre-cutover monitor)
- Keep `SECURITY_STRICT_MISSION_RUN=false`.
- Monitor API logs for requests without `mission_run_id`.
- Confirm updated frontend deployment reaches expected adoption.

3. Stage 2 (strict enable)
- Set `SECURITY_STRICT_MISSION_RUN=true` in staging, then production.
- Validate:
  - alarm overlay starts mission run on open
  - verify/check/dismiss include `mission_run_id`
  - dismiss replay returns 409 for dismissed state

4. Stage 3 (cleanup)
- Remove fallback assumptions from client/server only after old clients are retired.

## Runtime Checks
- Missing run id in strict mode: `422 mission_run_id required`
- Non-existent run id: `404 mission_run_id not found`
- Cross-day mismatch: `409 mission_run day_id mismatch`
- Invalid run state on dismiss: `409 invalid mission_run state`

## Frontend Contract
- Alarm overlay creates run once via `POST /api/spec/missions/start`.
- Use returned `mission_run_id` for:
  - `POST /api/spec/missions/verify/photo` (form field)
  - `POST /api/spec/missions/verify/location` (query param)
  - `POST /api/spec/missions/check-alarm` (query param)
  - `POST /api/spec/missions/dismiss-alarm` (query param)

