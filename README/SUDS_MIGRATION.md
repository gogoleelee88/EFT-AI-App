# SUDS Endpoint Migration

## Summary
- Primary submission endpoint has moved from `POST /api/suds/record` to `POST /suds`.
- Request body must follow the `SUDSRequest` schema: `{ "type": "manual"|"auto"|"system", "score": number }`.
- The backend continues to expose legacy compatibility routes (`POST`/`OPTIONS` `/api/suds/record`) that proxy to the new handler and return the same `start_eftar` action payload.
- Legacy fallback is scheduled for removal after **2024-11-07** (two weeks post-rollout) once all clients have shipped the new flow.
- Cloudflare / WAF / proxy configuration **must not be changed** for this migration; all work happens within the repository.

## Rollout Checklist

- [ ] Confirm `POST /suds` returns `actions[0].type == "start_eftar"` with the `/eftar` route.
- [ ] Confirm `POST /api/suds/record` mirrors the same payload and status (no 404/405 regressions).
- [ ] Confirm `OPTIONS /api/suds/record` responds with `Access-Control-Allow-Methods: GET, POST, OPTIONS`.
- [ ] Remove the frontend legacy fallback before **2024-11-07** (two weeks after rollout).

## Verification
Use the helper script to verify both endpoints end-to-end without touching Cloudflare or upstream infrastructure:

```bash
scripts/verify_suds.sh https://www.moodtalk.app
```

The script performs:
1. `OPTIONS /suds` preflight (CORS headers).
2. `POST /suds` with a manual score (expect HTTP 200 + `actions[0].type == "start_eftar"`).
3. `POST /api/suds/record` to confirm the legacy alias returns an identical JSON body.

All responses must include an `actions[0].type == "start_eftar"` payload with the `/eftar` route for navigation continuity.

## Automated Tests

Run both suites before shipping:

- `pytest tests/test_suds_record.py`
- `npm run test -- recordSuds` (or simply `npm run test` for the entire Vitest suite)

## Post-deploy Diagnostics (405 Regression Guard)

If 405 responses appear in production even after the code fixes, capture the following without altering infrastructure:

1. Use browser devtools or `scripts/verify_suds.sh` against the app server to confirm `OPTIONS → POST` sequence and HTTP codes.
2. Temporarily enable server-side logging of the received HTTP method (e.g., middleware emitting an `X-Method-Seen` log) to detect upstream method rewriting. Remove the logging once validated.
3. Test both `/suds` and `/suds/` to observe any enforced redirect policies (308 redirects are already covered by the frontend fallback).
4. Bypass caches or service workers (`?t=$(date +%s)` query, devtools “Disable cache” toggle) to ensure the latest bundle is loaded.

Successful diagnostics that show the backend responding with HTTP 200 while the proxied request fails indicate an upstream configuration issue that must be addressed outside of this repository.
