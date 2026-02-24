# RULES_DEPLOY_VS_AGENT.md (EFT-AI-App)

## 1) 브랜치 운영 규칙

- `deploy/hotfix`:
  - render/vite(vercel), 환경변수, CORS, /health,/version, 엔드포인트 계약 고정만.
  - main 재배포용으로만 쓰기.
- `feat/agent-*`:
  - 행동데이터셋/에이전트 파이프라인/실험 코드는 여기서만 진행.
- `main`:
  - 항상 데모 가능한 상태 유지.
  - 기본 배포 트리거 브랜치.

## 2) 파일 경계 (강력 고정)

### deploy/hotfix에서 수정 허용(화이트리스트)
- `backend/main.py`
- `backend/main.py.bak*`는 수정 금지(백업 유지만)
- `backend/requirements.txt`
- `backend/routers/**`
- `backend/routers/health.py` (최소 `/health`/`/version`)
- `frontend/src/config/api.ts`
- `frontend/src/services/http.ts`
- `frontend/src/main.tsx`
- `vercel.json` (또는 Netlify면 `frontend/public/_redirects`)
- `.env.example` (백엔드/프론트 노출용 템플릿)
- `RULES_DEPLOY_VS_AGENT.md`

### feat/agent-*에서 수정 금지(블랙리스트)
- `backend/main.py`
- `backend/routers/**`
- `frontend/src/config/api.ts`
- `frontend/src/services/http.ts`
- `frontend/src/main.tsx`
- `vercel.json` / `_redirects`
- `.github/workflows/*` (현재 배포 플로우 건드리지 않기)
- `.env`/`backend/.env` 실제 키 파일

## 3) 하드 규칙(코드로 강제)

- `backend/main.py`에서 CORS `allow_origins`에 `*` + `allow_credentials=True` 조합 금지.
- `/health`와 `/version` 삭제/이름 변경 금지.
- 프론트 API 호출은 원칙적으로 `VITE_API_BASE_URL` 기준으로 구성.
  - 상대경로 하드코딩 사용은 `feat/agent-*`에서 점검 대상이 아니고, 배포 브랜치에서만 정리.
- Render 시작 커맨드는 `backend.main:app` 기준으로 통일.

## 4) 충돌 회피 절차

1. 작업 시작 전 브랜치 확인:
   - 배포 작업: `deploy/hotfix`에서만 시작
   - 에이전트 작업: `feat/agent-*`
2. 배포 전 체크(10분 내):
   - Render `/health`, `/version` 응답 확인
   - 프론트에서 `/health` 한 번 호출하여 `VITE_API_BASE_URL` 적용 확인
3. 수정 실패시:
   - 배포 브랜치에서 마지막 안정 커밋으로 즉시 롤백
   - main에 병합하지 않은 상태로 보존

## 5) 긴급 의사결정 기준

- 기능 아이디어/실험은 `feat/agent-*`에서만.
- 데모 안정성 관련(스택/라우트/배포/ENV/CORS)은 `deploy/hotfix`.
- main 병합은 "데모가 깨지지 않는 최소셋"만 올릴 것.

