# Submission Package

This file is the evaluator-facing checklist for contest submission.

## 1) Build/Deploy
- Deploy URL (primary): `https://www.moodtalk.app`
- Deploy URL (backup): `https://moodtalk.app`
- Deployment method:
  - Existing origin deploy: `.github/workflows/deploy-frontend.yml`
  - Cloudflare Pages deploy: `.github/workflows/deploy-cloudflare-pages.yml`
- Latest confirmed success run (Deploy Frontend):
  - `https://github.com/gogoleelee88/EFT-AI-App/actions/runs/20715182622`
  - API verification timestamp: `2026-02-13`

## 2) Local reproduction
### Backend
```bash
cd backend
cp .env.example .env
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend
```bash
cd frontend
cp .env.example .env.development
npm install
npm run dev
```

## 3) PR1 (P0) completion checklist
- [x] Hardcoded secret defaults removed from code (`SECRET_KEY`, `API_KEY`, `PREMIUM_API_KEY`)
- [x] Production startup blocked if required secrets are missing
- [x] Runtime `.env` files removed from git tracking
- [x] Cloudflare Pages deploy workflow added
- [x] README updated for reproducible run/deploy steps

## 3-1) PR2 (P0) demo funnel checklist
- [x] Broken route fixed: `/ai-chat` route added
- [x] Home CTA added: `/` -> `/demo` (RootLanding floating CTA)
- [x] Demo flow fixed: `/demo` -> `/demo/result` -> `/feedback`
- [x] 3-click demo path documented for evaluators

## 4) ENV checklist (must be configured before production)
- Backend:
  - `DEBUG=false`
  - `SECRET_KEY`
  - `API_KEY`
  - `PREMIUM_API_KEY`
  - `DATABASE_URL`
- Cloudflare Pages workflow:
  - `CF_API_TOKEN`
  - `CF_ACCOUNT_ID`
  - `CF_PAGES_PROJECT`
- Setup guide:
  - `GITHUB_SECRETS_P0.md`

## 5) Validation evidence to capture before final submission
- [ ] GitHub Actions success screenshot (build + deploy)
- [ ] Deploy URL reachable screenshot
- [ ] `DEBUG=false` + missing secrets failure log
- [ ] App startup log with correct env configured

## 5-1) Current deploy check result (2026-02-13)
- `curl` 확인 결과:
  - `https://www.moodtalk.app` and `https://moodtalk.app` currently show `www <-> apex` redirect loop.
  - `https://www.moodtalk.app/eft-strict` also loops before content response.
- Impact:
  - External SPA route validation (`/`, `/eft-strict`) is currently blocked by infra redirect config.
- Required fix before final judging:
  - Normalize one canonical host (`www` or apex) in Cloudflare/edge redirect rules.
  - Re-run route checks and attach screenshots.

## 6) Next PR scope
- Formspree integration (PR3)
- Disqus integration (PR4)
- Optional AdSense slot toggle (PR5)
