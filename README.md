# EFT-AI-App

PR1-P0 baseline for contest submission readiness.

## PR sequence (from gap table)
1. PR1 (P0 only): Env/Secrets hardening, hardcoded key removal, README + SUBMISSION package, deploy reproducibility minimum.
2. PR2 (P0): Demo funnel/route consistency fix (`home -> demo -> result -> feedback`) + broken link cleanup.
3. PR3: Formspree integration.
4. PR4: Disqus integration.
5. PR5 (optional): AdSense slot toggle.

## What PR1 changes (P0 rows)
- `Env/Secrets`: move critical secrets to environment variables only.
- `Security/Policy`: remove hardcoded defaults for auth/API keys.
- `Deploy`: add reproducible Cloudflare Pages workflow.
- `README/Submission`: provide one-pass setup + submission checklist docs.

## Current stack
- Frontend: React + TypeScript + Vite (`frontend/`)
- Backend: FastAPI + Pydantic Settings (`backend/`)
- CI/CD: GitHub Actions (`.github/workflows/`)

## Local run
### 1) Backend
```bash
cd backend
cp .env.example .env
# Fill required values for your local environment.
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2) Frontend
```bash
cd frontend
cp .env.example .env.development
# Fill required values for your local environment.
npm install
npm run dev
```

## Environment policy (PR1)
- No hardcoded production secrets in source.
- Required in production (`DEBUG=false`):
  - `SECRET_KEY`
  - `API_KEY`
  - `PREMIUM_API_KEY`
- Backend examples:
  - `backend/.env.example`
  - `backend/config.env.example`
- Frontend example:
  - `frontend/.env.example`

## Deployment reproducibility
Two deployment paths now exist:

1. Existing origin deploy (rsync + Cloudflare purge):
   - `.github/workflows/deploy-frontend.yml`

2. Cloudflare Pages deploy (new in PR1):
   - `.github/workflows/deploy-cloudflare-pages.yml`
   - Required GitHub secrets:
     - `CF_API_TOKEN`
     - `CF_ACCOUNT_ID`
     - `CF_PAGES_PROJECT`

## Deployment evidence (as of 2026-02-13)
- Production URL:
  - `https://www.moodtalk.app`
  - `https://moodtalk.app`
- Existing deploy workflow success run:
  - `https://github.com/gogoleelee88/EFT-AI-App/actions/runs/20715182622`
  - Source: GitHub Actions API (`workflow: Deploy Frontend`, `conclusion: success`, `created_at: 2026-01-05T12:19:11Z`)
- Secrets guide:
  - `GITHUB_SECRETS_P0.md`

Current issue observed by curl checks on 2026-02-13:
- `www` <-> apex redirect loop on `https://www.moodtalk.app` and `https://moodtalk.app`
- This blocks final SPA route verification until DNS/redirect rule normalization.

## Verification quick checks
### Production secret guard
```bash
cd backend
DEBUG=false python -c "from backend.config.settings import Settings; Settings()"
```
Expected: startup fails with missing required env vars when any required secret is not set.

### Frontend env tracking
Tracked runtime env files were removed from git in PR1:
- `frontend/.env.development`
- `frontend/.env.production`
- `.env.backup`

## Submission package
See `SUBMISSION.md` for:
- deploy URL section
- evaluator demo checklist
- environment checklist
- known limitations and next PR scopes
