# GitHub Secrets Guide (P0)

Repository: `https://github.com/gogoleelee88/EFT-AI-App`

## 1) Where to set
1. Open repository settings.
2. Go to `Secrets and variables` -> `Actions`.
3. Add each secret with `New repository secret`.

## 2) Required for `deploy-frontend.yml`
- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_KEY`
- `CF_ZONE_ID`
- `CF_API_TOKEN`

## 3) Required for `deploy-cloudflare-pages.yml`
- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`
- `CF_PAGES_PROJECT`

## 4) Optional but recommended
- `GITHUB_TOKEN` is provided automatically by GitHub Actions.
- Keep `DEPLOY_KEY` as read-only key scoped to deployment host only.

## 5) Quick verification
1. Trigger `Deploy Frontend` workflow manually from Actions tab.
2. Confirm latest run is `completed/success`.
3. Trigger `Deploy Frontend to Cloudflare Pages` after PR merge and secrets setup.
