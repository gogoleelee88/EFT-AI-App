# Focus Session + Interruption + Re-entry + Stuck AI 처방 명세 (Web + MV3 MVP)

## 1) Service Spec
- 목표
  - 작업 세션의 유의미한 이탈을 낮은 오탐으로 감지
  - 복귀 시 즉시 재진입 카드 제공
  - `stuck`에만 AI 처방을 실행해 바로 행동으로 전환
- 상태
  - `working | micro_drift | physical_exit | context_switch | paused`
- 중단 유형
  - `break | meeting | stuck`
- 원칙
  - 센서 옵트인, 로컬 처리 우선, 원본 미저장(이벤트/특징만 저장)
  - 센서 토글/권한 회수/삭제 가능

## 2) Feature Spec
- 세션 시작
  - `POST /api/sessions`로 `task_title, goal, timer_mode, duration, next_step, planned_break, sensors_enabled`
- 세션 중 감지
  - 웹: idle, visibility, focus, timer
  - 확장: tabs/window focus/idle 보강
  - 카메라: `present/confidence/face_count`만 이벤트 전송
- 중단 라벨
  - `POST /api/sessions/{id}/interruptions/label`
- 복귀 카드
  - `GET /api/sessions/{id}/reentry_card`
- 막힘 처방
  - `POST /api/sessions/{id}/stuck`
  - 분류 -> 질문 생성 -> 완성형 프롬프트 -> 모델 프로필 라우팅 -> next actions 생성

## 3) DB Schema (Postgres)
- 구현 파일
  - `backend/migrations/20260215_add_focus_session_tables.sql`
  - `backend/focus/models.py`
- 테이블
  - `users` (기존)
  - `devices(id, user_id, type, created_at, last_seen_at)`
  - `sessions(id, user_id, created_at, ended_at, task_title, goal, timer_mode, duration, status, next_step, sensors_enabled, planned_break)`
  - `session_states(id, session_id, ts, state, exit_score, evidence)`
  - `events(id, session_id, user_id, device_id, ts, source, type, payload)`
  - `interruptions(id, session_id, ts_start, ts_end, interruption_type, detected, user_labeled, notes)`
  - `stuck_cases(id, session_id, created_at, stuck_text, desired_output, constraints, detected_category, model_profile, prompt_text, ai_result, next_actions)`
  - `user_settings(user_id, idle_threshold_seconds, camera_enabled, camera_weight, window_size_seconds, notification_prefs, data_retention_days, updated_at)`
- 인덱스
  - `events(session_id, ts desc)`
  - `session_states(session_id, ts desc)`
  - `interruptions(session_id, ts_start desc)`
  - `stuck_cases(session_id, created_at desc)`

## 4) API Spec (REST)
- 구현 파일: `backend/focus/router.py`
- 엔드포인트
  - `POST /api/sessions`
  - `PATCH /api/sessions/{id}`
  - `POST /api/events/batch`
  - `GET /api/sessions/{id}/state`
  - `GET /api/sessions/{id}/reentry_card`
  - `POST /api/sessions/{id}/interruptions/label`
  - `POST /api/sessions/{id}/stuck`
  - `GET /api/users/me/settings?user_id=...`
  - `PATCH /api/users/me/settings?user_id=...`
  - `GET /api/stuck/catalog`

## 5) Event Schema (JSON Schema + 서버 검증)
- 구현 파일: `backend/focus/event_schemas.py`
- Envelope 필수 필드
  - `event_id, ts(ms), user_id, device_id, session_id, source, type, payload`
- 타입별 payload 스키마
  - `activity`, `camera_presence`, `timer`, `interruption_label`, `reentry`, `geofence`, `wifi`, `ble`, `calendar`
- 검증 방식
  - `jsonschema` 사용 가능 시 schema 기반 검증
  - 미설치 환경 fallback으로 동일 필수 규칙 수동 검증

## 6) Behavior Fusion Engine v1
- 구현 파일: `backend/focus/fusion_engine.py`
- 입력 윈도우
  - 사용자 설정 `window_size_seconds` (기본 600초)
- 규칙
  - idle > threshold(기본 180s): +1
  - tab hidden > 60s: +1
  - window blur > 60s: +1
  - camera present=false > 30s: `+camera_weight` (기본 3)
  - geofence exit: +4
  - ble lost: +3
  - calendar meeting started: `context_switch` override
- 분류
  - 0~2 `working`
  - 3~5 `micro_drift`
  - 6~8 `physical_exit(probable)`
  - 9+ `physical_exit(high)` (evidence 표시)
  - `planned_break=true`면 physical_exit -> `paused` 완화
- 개인화 저장
  - `user_settings`에 임계값/가중치/윈도우 저장

## 7) AI 처방 모듈
- 구현 파일
  - `backend/focus/stuck_catalog.py`
  - `backend/focus/service.py`
- 파이프라인
  - `classify_stuck`: 키워드+산출물 기반 카테고리 매칭
  - `build_prompt`: 카테고리 템플릿 + 슬롯 매핑 + 누락 질문 생성
  - `route_model`: 모델 프로필 1순위 + 대안 2개 (`WEB_RESEARCH` 우선 승격 규칙 포함)
  - `postprocess`: 체크박스 1~3 + 필수 5분 행동 1개 생성
- 출력 보장
  - `next_actions` 중 필수 1개(5분) 생성
  - 해당 항목을 세션 `next_step`에 자동 반영
  - `tone_toggle(shorter/more_logical/more_creative)` 즉시 재프롬프트 지원

## 8) 막힘 카테고리 사전 (25개)
- 구현 파일: `backend/focus/stuck_catalog.py`
- 모델 프로필 enum
  - `FAST_CHEAP, DEEP_REASONING, CODE_SPECIALIST, CREATIVE_COPY, WEB_RESEARCH, DATA_ANALYST`
- 기본 20개 + 추가 5개 구현
  - 문서 도입부
  - 범위 모호
  - 일정 산정
  - 이해관계자 설득
  - 의사결정
  - 회의 운영
  - 답장 톤
  - PRD 구조
  - UX 플로우
  - KPI 정의
  - 이벤트 설계
  - 프라이버시 문구
  - 경쟁사 조사
  - 슬라이드 스토리
  - 카피/네이밍
  - 코드 디버깅
  - 리팩토링/성능
  - 데이터 정리
  - 글 구조화
  - 착수 불가
  - 요구사항 충돌 (추가)
  - QA/테스트 케이스 (추가)
  - 릴리즈 노트 (추가)
  - 문서 요약/회의 준비 (추가)
  - 요청/재촉 메시지 (추가)

## 9) Frontend(Next.js App Router) 화면/컴포넌트 구조 제안
- 페이지 구조(권장)
  - `app/focus/page.tsx` (세션 대시보드)
  - `app/focus/[sessionId]/page.tsx` (실행 화면)
  - `app/focus/[sessionId]/stuck/page.tsx` (막힘 처방)
- 컴포넌트
  - `SessionStartForm`
  - `TimerPanel`
  - `InterruptionModal`
  - `ReentryCard`
  - `StuckIntakeForm` (3줄)
  - `PrescriptionPanel` (prompt + 모델 프로필 + next_actions)
  - `SensorConsentPanel`
- 핵심 UX 플로우
  - 시작 -> 감지 -> 중단 라벨 -> 복귀 카드 -> stuck 처방 -> sprint 재개

## 10) MV3 확장 설계/코드
- 구현 파일
  - `extension/mv3/manifest.json`
  - `extension/mv3/service_worker.js`
  - `extension/mv3/content.js`
  - `extension/mv3/README.md`
- 기능
  - `chrome.tabs.onActivated/onUpdated`
  - `chrome.windows.onFocusChanged`
  - `chrome.idle.onStateChanged`
  - 웹앱 `window.postMessage`로 세션 컨텍스트 전달받아 `/api/events/batch` 전송

## 11) UI Output Spec
- `/stuck` 응답의 `ui_output_spec`
  - `type: options | checklist | table | drafts`
  - `options: [{id,title,summary}]`
  - `checklist: [{id,text,eta_minutes,required}]` (필수 true 1개 보장)
  - `cta_buttons: ["스프린트 5분 시작", "이 프롬프트로 실행", "대안 모델로 재시도"]`

## 12) 프라이버시/권한 UX 카피
- 카메라: “카메라 영상은 저장/전송하지 않고, 사람 존재 여부만 기기에서 계산합니다.”
- 위치(Phase3): “위치는 좌표를 저장하지 않고, 작업 장소 enter/exit 이벤트만 기록합니다.”
- 공통: “센서는 언제든 끌 수 있고, 기록 삭제를 요청할 수 있습니다.”

## 13) 데이터 보관 정책
- 원시 이벤트: 30~90일 (`user_settings.data_retention_days`, 기본 60)
- 집계/통계: 장기 보관 가능(개인 식별 최소화)
- 삭제: 사용자 단위 삭제 API를 별도 후속 구현 항목으로 관리

## 14) MVP -> Production 마이그레이션
- Phase 1 (웹 MVP)
  - 세션/타이머/idle/탭전환
  - 중단 라벨 + 복귀 카드
  - stuck 3줄 처방 + next step 반영
- Phase 2 (웹+확장)
  - 백그라운드 신호 보강
  - 팝업 쿨다운/피로도 제어
  - 카메라 presence 옵트인
- Phase 3 (PWA/모바일 확장)
  - 오프라인/푸시
  - 지오펜스/BLE enter/exit 이벤트 도입
  - 좌표 원본 저장 금지 정책 유지

## 15) 테스트
- 구현 파일
  - `backend/tests/test_focus_fusion_engine.py`
  - `backend/tests/test_focus_stuck_templates.py`
- 커버리지
  - Fusion 룰/override/planned_break 완화 검증
  - 카테고리 수(25+)와 슬롯 누락 시 질문 생성 검증
