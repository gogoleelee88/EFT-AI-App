# Work Guide 확장 MVP 구현 문서 (KO)

## 1. 목표
- 문제: 데모 페이지 DOM만 보고 안내하면 실제 사이트 업무 막힘을 풀 수 없음
- 해결: 사용자가 실제로 열어둔 탭 DOM을 직접 수집해서 단계별 클릭 가이드를 제공
- 원칙: 자동 클릭/자동 제출 금지, 사용자에게만 지시 제공

## 2. 아키텍처
- `extension/mv3/content.js`
  - 현재 탭 interactive DOM 최대 200개 수집
  - 목표 입력(prompt) 수집
  - 백그라운드에 plan 요청
  - 오버레이 렌더링(박스/화살표/번호/다음/확인/후보)
- `extension/mv3/service_worker.js`
  - `chrome.action` 클릭 시 현재 탭 content script 트리거
  - `/api/work-guide/plan/dom` 프록시 호출
  - `/api/work-guide/logs/confirm` 프록시 호출
- `backend/routers/work_guide.py`
  - DOM step plan 생성 API
  - confirm interaction 로그 API

## 3. API 계약
- 요청: `POST /api/work-guide/plan/dom`
  - `goal`, `url`, `dom_summary`, `locale`, `context_text`, `step_index`, `max_steps`
  - `dom_summary`는 interactive 요소 200개 제한
- 응답:
  - `step_plan` (현재 단계 1개만 반환)
  - `target.selector`, `candidates[0..1]`, `confirm`
- 로그: `POST /api/work-guide/logs/confirm`

## 4. UX 플로우
1. 사용자: 실제 대상 페이지를 연다
2. 사용자: 확장 아이콘 클릭
3. 확장: 목표(goal) 입력 받음
4. 확장: 현재 탭 DOM 수집 후 API 호출
5. 확장: 1단계 오버레이 표시
6. 사용자: 직접 클릭
7. 사용자: `다음`으로 다음 step 생성

## 5. 실패 대응(Fallback)
- selector 미매칭 시 텍스트 매칭 후보 2개 제시
- API 실패 시 텍스트 fallback instruction 제공
- confirm UI로 Yes/No와 후보 선택 제공

## 6. 운영/주의
- 동작 불가 페이지: `chrome://*`, 웹스토어, 일부 브라우저 내부 탭
- iframe 내부 요소는 selector 탐색이 제한될 수 있음
- 해커톤 MVP 기준으로 보안 마스킹/필터는 분리 가능한 구조만 마련

## 7. 다음 단계(권장)
1. 확장 popup UI 추가(목표 입력을 prompt 대신 폼으로)
2. screenshot 모드 연동(`tabs.captureVisibleTab` + `/plan/screenshot`)
3. 도메인별 힌트 템플릿(예: 네이버 가입, 홈택스 등)
