# PR1: P0 Only (Gap Table Execution)

## Scope lock
- This PR intentionally handles only P0 rows from the gap table.
- Not included: routing/demo funnel changes, Formspree, Disqus, AdSense.

## Gap-row to change mapping
1. `Env/Secrets` + `Security/Policy`
   - `backend/config/settings.py`
     - Remove hardcoded defaults for `SECRET_KEY`, `API_KEY`, `PREMIUM_API_KEY`.
     - Enforce required secrets when `DEBUG=false`.
   - `backend/config.env.example`
     - Replace credential-like `DATABASE_URL` with placeholder.
     - Add explicit required secret keys.
   - `backend/.env.example` (new)
     - Canonical backend env template.
   - `frontend/.env.example`
     - Canonical frontend env template.
   - Remove tracked runtime env files:
     - `frontend/.env.development`
     - `frontend/.env.production`
     - `.env.backup`

2. `Deploy` (minimum reproducibility)
   - `.github/workflows/deploy-cloudflare-pages.yml` (new)
     - Build frontend and deploy to Cloudflare Pages using repo secrets.
     - Keeps existing rsync deploy workflow untouched.

3. `README` + `Submission Package`
   - `README.md`
     - Single runbook for local run, env policy, deploy paths.
   - `SUBMISSION.md` (new)
     - Evaluator checklist and evidence items.

## Verification plan in this PR
- Secret guard: `DEBUG=false` and missing required env should fail at settings validation.
- Workflow lint/readability: Cloudflare Pages workflow contains explicit required-secret check.
- Git tracking: runtime env files removed from tracked set.
