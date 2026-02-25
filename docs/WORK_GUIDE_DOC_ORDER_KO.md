# Work Guide 문서 정리 순서 가이드 (KO)

## 권장 문서열(작성/유지보수 순서)
1. 문제정의/범위 문서
2. API 스키마 문서
3. 확장(클라이언트) 구현 문서
4. 백엔드 서비스/라우터 문서
5. QA 시나리오 문서
6. 운영 이슈/제한사항 문서

## 이 레포 기준 파일 매핑
1. 문제정의/범위:
   - `docs/WORK_GUIDE_EXTENSION_MVP_KO.md`의 1~2장
2. API 스키마:
   - `backend/work_guide/schemas.py`
   - 필요 시 `docs/api/` 아래 OpenAPI 파생 파일
3. 확장 구현:
   - `extension/mv3/README.md`
   - `extension/mv3/content.js`
   - `extension/mv3/service_worker.js`
4. 백엔드 구현:
   - `backend/routers/work_guide.py`
   - `backend/work_guide/service.py`
   - `backend/work_guide/llm.py`
5. QA:
   - 신규 `docs/WORK_GUIDE_QA_CHECKLIST_KO.md` (추가 권장)
6. 운영/제한:
   - 신규 `docs/WORK_GUIDE_RUNBOOK_KO.md` (추가 권장)

## 문서 작성 템플릿(짧게)
- 배경: 어떤 사용자 막힘을 해결하는가
- 입력/출력: API 및 주요 타입
- 플로우: 사용자 행동 순서
- 실패 대응: fallback, 로그, 예외
- 제한사항: 브라우저 정책/도메인/보안
- 다음 단계: MVP 이후 확장 항목

## 관리 원칙
- 기능 변경 시 코드와 문서를 같은 PR에서 같이 변경
- 스키마 변경 시 프론트 타입과 백엔드 Pydantic 동시 업데이트
- 데모 문구와 실제 기능이 다르면 즉시 문서에 제약사항 명시
