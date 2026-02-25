# SPEC 구현 단위(Vertical Slice) 작업지시서

**역할**: 시니어 백엔드 PM/엔지니어  
**목표**: SPEC.md를 누락 없이 구현 가능하도록 구현 단위(Vertical Slice)로 분해한 **구현 순서 강제 작업지시서**.  
**입력**: SPEC.md, SPEC_PLAN_V1_GAP_ANALYSIS.md, 결정사항(checkin→서버 내부 adapt, 하루 1회=모드 전환 1회/일, 이벤트 예외, 30초=UX 목표, JobQueue=DB 기반)  
**규칙**: 코드 작성 금지. 출력만 작성.  
**수정**: SPEC_WORK_ORDER_GAP_AND_REVISION.md 대조 반영. **PM 결정사항 업데이트(모호 5개 답변)** 반영: 당일 2회째 전환(409/보호 목적 하향만), technique_end_ts·5분 START, 1 user 1 date 1 DayPlan·mode_changes, TTFS=PLAN_COMMIT fallback created_at, RAG 정책 문서·v1 stub.

---

## 1) 파일/모듈 트리 + 각 모듈 책임 (Planner/Simulator/Coach/Adapter/Scheduler/Media)

### 1.1 디렉터리 구조

```
backend/
├── main.py
├── config/settings.py
├── database.py
├── spec_loop/
│   ├── __init__.py
│   ├── planner/          → service, schemas, router
│   ├── simulator/        → service, schemas, router
│   ├── coach/            → service, schemas, router
│   ├── adapter/          → service, schemas, router
│   ├── scheduler/        → queue, jobs, schemas, router
│   ├── media/            → service, schemas
│   ├── condition/        → service, schemas, router
│   ├── mode_change/      → service, schemas
│   ├── models/           → task, day_plan, condition, execution_log, resistance_event, media_job, job
│   └── validation/       → condition_schema, resistance_event_schema, execution_log_schema
└── tests/spec_loop/      → conftest, test_planner, test_simulator, test_coach, test_adapter,
                            test_scheduler, test_condition_score, test_adaptation_actions,
                            test_resistance_timer, test_mode_change, test_event_exceptions, test_api_contracts
```

### 1.2 모듈 책임 (SPEC C1)

| 모듈 | 경로 | 책임 |
|------|------|------|
| **Planner** | spec_loop/planner/ | Task → DayPlan 생성/수정(모드 반영). |
| **Simulator** | spec_loop/simulator/ | Plan 기반 과정 시뮬레이션(텍스트) + Coping Imagery 프롬프트 생성(Outcome 금지, 70/20/10, 리라이트). |
| **Coach** | spec_loop/coach/ | 저항 이벤트 처리: 기법 타이머(30~90초), 2분 잠금(lock_sec=120), 마이크로 행동 제시, 연속 2회 제한·3회째 Adapt 강제. |
| **Adapter** | spec_loop/adapter/ | Condition 변화 → 모드/계획 재구성. Adaptation Actions: drop/shrink/delay/swap/split/protect/soothe. delay 시 Scheduler에 알림 재설정 위임. |
| **Scheduler** | spec_loop/scheduler/ | Job 큐/백그라운드 실행(시뮬, 미디어, RAG). **delay 시 DayPlan 간 이동 + 알림 재설정 담당.** DB 기반 job 테이블 + 폴링 워커. Redis 미사용. |
| **Media** | spec_loop/media/ | 이미지/짧은 영상 생성(규칙 기반 최소) + 큐잉 + 저장. |
| **Condition** | spec_loop/condition/ | 체크인 저장(min_condition_set만 검증), condition_score·모드(pain override 우선), **필요 시 내부 apply_adaptation 호출**, 응답에 adapt_applied·updated_day_plan. |
| **ModeChange** | spec_loop/mode_change/ | 당일 모드 전환 횟수 기록/조회. **기본: 2회째 409 (MODE_CHANGE_LIMIT). 예외: 보호 목적 하향만 2회째 허용. 상향 2회째 당일 절대 금지.** |

---

## 2) API 6개 계약(요청/응답/에러) + 내부 호출 흐름(checkin→adapt 자동)

### 2.1 API 계약 요약

| API | 요청 | 응답 2xx | 에러 |
|-----|------|----------|------|
| **POST /plan/day** | date, mode(100\|70\|40), items[{ task_id, planned_block_minutes, micro_steps[] }] | day_id, date, mode, items | 400, 404, 422 |
| **POST /simulate/day** | day_id | 202: job_id | 400, 404, 422 |
| **GET /jobs/{job_id}** | path job_id | job_id, status, kind, result, created_ts | 404 |
| **POST /condition/checkin** | **condition_id 없음.** ts(또는 date_time), source_level, min_condition_set(sleep_hours, fatigue, pain, mood; period_status 선택), wearable?, behavior_inference? | condition_id, ts, source_level, condition_score, **final_mode**, inferred_flags, **adapt_applied**, **updated_day_plan** | 400, 422 |
| **POST /adapt/day** | day_id, condition_id, condition_score, mode | day_id, actions_applied[], updated_plan | 400, 404, 422 |
| **POST /resistance/event** | day_id, task_id?, trigger, intensity(0-10), context? | event_id, ts, action{ technique, duration_sec(30-90), lock_sec(120), micro_step }, lock_applied | 400, 404, 422 |

- **모드 전환 1회 초과**: **409 Conflict (MODE_CHANGE_LIMIT)**. 예외: **보호 목적 하향**만 당일 2회째 허용(통증 급증/pain override, 저항 폭주 등). **상향 전환은 당일 2회째 절대 금지**(다음 날 조건으로만).

### 2.2 내부 호출 흐름: checkin → adapt 자동

1. 클라이언트 **POST /condition/checkin** (condition_id 없음).
2. **condition/service**: min_condition_set 검증 → Condition 저장(condition_id, ts 서버 생성) → condition_score 계산 → **pain override 적용**(pain>=9→40, pain>=7→max70, pain_delta>=+2/2h→max70) → final_mode 결정.
3. **mode_change/service**: 당일 모드 전환 횟수 확인. **기본: 2회째 요청 시 409 (MODE_CHANGE_LIMIT)**. **예외: 보호 목적 하향만** 2회째 허용(통증 급증/pain override, 저항 폭주 등). **상향 전환은 당일 2회째 절대 금지**(다음 날 조건으로만 반영).
4. **adapt 필요 조건** 판단: 현재 DayPlan.mode ≠ final_mode 이거나 score 구간 변경 등으로 계획 갱신이 필요할 때.
5. **필요 시** **condition/service**가 **내부** `adapter.service.apply_adaptation(day_id, condition_id)` 호출(HTTP가 아닌 함수 호출). DayPlan 갱신.
6. **응답**에 condition_id, ts, condition_score, final_mode, **adapt_applied**(bool), **updated_day_plan**(있으면) 포함.

---

## 3) DB 스키마(테이블/컬럼/인덱스) + append-only 로그 전략

### 3.1 테이블·컬럼·인덱스

| 테이블 | 주요 컬럼 | 인덱스 |
|--------|-----------|--------|
| **tasks** | task_id(PK), title, est_minutes, priority, tags(JSONB), energy_cost(1-5), pain_sensitive, requires_focus, created_at | tasks_pkey(task_id) |
| **day_plans** | day_id(PK), **user_id**(FK, nullable 또는 요구 시), date, mode(100/70/40), items(JSONB), protected_block_minutes, created_at, updated_at. **정책: 1 user + 1 date = 1 DayPlan.** **UNIQUE(user_id, date)** | day_plans_pkey, ix_day_plans_date(date), **uq_day_plans_user_date(user_id, date)** |
| **conditions** | condition_id(PK), ts, source_level(0/1/2), min_condition_set(JSONB), wearable, behavior_inference, condition_score, inferred_flags | conditions_pkey, ix_conditions_ts(ts) |
| **execution_logs** | log_id(PK), ts, day_id(FK), task_id(FK), event_type, duration_sec, mode, condition_ref, resistance_event_ref, metrics(JSONB), context(JSONB). **event_type enum 변경 없음**(RESISTANCE_TECHNIQUE_END 미추가) | execution_logs_pkey, ix_execution_logs_day_ts(day_id,ts), ix_execution_logs_event_type(event_type) |
| **mode_changes** | id(PK), day_id(FK), from_mode, to_mode, ts, reason. **date 컬럼 없음 또는 day_plans.date와 동일(파생)**. mode_changes는 항상 day_id에 귀속, 당일 전환 수 = 해당 day_id의 mode_changes COUNT | mode_changes_pkey, ix_mode_changes_day_id(day_id) |
| **resistance_events** | event_id(PK), ts, day_id(FK), task_id(FK), trigger, intensity, context(JSONB), action(JSONB), **technique_end_ts**(TIMESTAMPTZ, ts + duration_sec로 서버 계산 가능), chosen_technique, lock_applied, outcome(JSONB) | resistance_events_pkey, ix_resistance_events_day_ts(day_id,ts) |
| **media_jobs** | media_job_id(PK), kind(img/vid), status, input_refs(JSONB), output_url, created_ts | media_jobs_pkey |
| **jobs** | job_id(PK), kind(simulation\|media\|rag), status(pending\|completed\|failed), result(JSONB), created_ts, updated_ts | jobs_pkey, ix_jobs_status_created(status,created_ts) |

- **event_type**(execution_logs): **enum 변경하지 않음.** TASK_START, TASK_STOP, TASK_RESUME, TASK_COMPLETE, PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE, LOCK_APPLIED, LOCK_EXPIRED 등. RESISTANCE_TECHNIQUE_END는 ExecutionLog에 추가하지 않음.
- **5분 내 START율**: ResistanceEvent에 **technique_end_ts**(또는 ts + action.duration_sec로 서버 계산한 end_ts) 저장. 해당 technique_end_ts 기준 5분 이내 execution_logs에 TASK_START 존재 여부로 산출. (선택) 분석용 **kpi_events** 테이블에 RESISTANCE_TECHNIQUE_END 별도 기록 가능.
- **TTFS**: **분모 = ExecutionLog의 PLAN_COMMIT 시각.** PLAN_COMMIT이 없으면 **fallback = day_plans.created_at**. TTFS = 해당 day_id의 첫 TASK_START ts − (PLAN_COMMIT.ts 또는 created_at).
- **C3 context vs E**: C3의 context = execution_logs.context; E의 metrics = execution_logs.metrics(planned_minutes, executed_minutes, focus_quality).

### 3.2 Append-only 로그 전략

- **execution_logs**: INSERT만 사용. 수정/삭제 없음. 이벤트 발생 시마다 1행 추가. KPI(TTFS, 모드별 완료율, 5분 내 START, LOCK 준수율, 3일 streak 등)는 이 테이블 + resistance_events·conditions 조인·집계로 계산.
- **mode_changes**: 모드 전환 시마다 1행 INSERT(day_id 귀속). 당일 전환 횟수 = 해당 day_id(당일)의 mode_changes COUNT. date 컬럼은 저장하지 않거나, 저장 시 day_plans.date와 동일해야 함(정합성).
- **resistance_events**: 저항 이벤트마다 1행 INSERT. outcome은 사후 업데이트 가능(선택). 연속 횟수·폭주 판단은 이 테이블 ts 기준 윈도우 집계.
- **conditions**: 체크인마다 1행 INSERT. 수정 없음(보정은 새 행으로).

---

## 4) Vertical Slice 분해 (최소 7개 Slice)

**순서 강제**: Slice 1 → 2 → … → 7. 이전 Slice 완료조건 통과 후 다음 Slice 진행.

---

### Slice 1: DB·모델·검증 기초 ✅

**구현 범위**

- `spec_loop/models/`: task, day_plan, condition, execution_log, resistance_event, media_job, job, mode_change (SQLAlchemy 모델).
- `database.py`: spec_loop 모델 import, Base.metadata.create_all 또는 마이그레이션 스크립트.
- `spec_loop/validation/`: Condition/ResistanceEvent/ExecutionLog 저장용 Pydantic 또는 JSON schema(요청 스키마와 분리).

**체크리스트**

- [x] tasks: task_id, title, est_minutes, priority, tags, energy_cost(1-5), pain_sensitive, requires_focus (SPEC C3).
- [x] day_plans: day_id, **user_id**, date, mode(100/70/40), items(JSONB), protected_block_minutes. **UNIQUE(user_id, date)**. 1 user + 1 date = 1 DayPlan (SPEC C3, F5, PM 결정 3).
- [x] conditions: condition_id, ts, source_level, min_condition_set, wearable, behavior_inference, condition_score, inferred_flags (F3, 요청에 condition_id 없음).
- [x] execution_logs: event_type **enum 변경 없음**(RESISTANCE_TECHNIQUE_END 미추가). TASK_START/STOP/RESUME/COMPLETE, PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE, LOCK_APPLIED, LOCK_EXPIRED (E, PM 결정 2).
- [x] resistance_events: **technique_end_ts**(또는 ts+duration_sec로 서버 계산). 5분 내 START율 산출용 (PM 결정 2).
- [x] mode_changes: day_id(FK) 귀속만. date 컬럼 없거나 day_plans.date와 동일(정합성) (PM 결정 3).
- [x] jobs 테이블 존재, Redis 미사용(결정 5).

**테스트 목록 (pytest)**

- `test_api_contracts.py::test_task_model_fields`
- `test_api_contracts.py::test_day_plan_model_fields`
- `test_api_contracts.py::test_condition_model_no_id_in_request`
- `test_api_contracts.py::test_execution_log_event_types`
- `test_scheduler.py::test_job_table_exists_and_has_status_result`

**완료조건**: 위 테스트 전부 PASS, 체크리스트 항목 코드/스키마에 반영됨.

---

### Slice 2: Condition 점수·모드·pain override·내부 adapt ✅

**구현 범위**

- `spec_loop/condition/schemas.py`: CheckinRequest(condition_id 없음, **day_id 필수**), CheckinResponse(condition_id, ts, condition_score, final_mode, adapt_applied, updated_day_plan).
- `spec_loop/condition/service.py`: 저장, condition_score 계산(F4), 모드 결정(**pain override 우선**: pain>=9→40, pain>=7→max70, pain_delta>=+2/2h→max70), adapt 필요 시 `adapter.service.apply_adaptation` 내부 호출.
- `spec_loop/mode_change/service.py`: 당일 전환 횟수 조회/기록, 1회 초과 시 409(정책 명시).
- `spec_loop/condition/router.py`: POST /condition/checkin, 30초 검증 없음(결정 4).

**체크리스트**

- [x] condition_score: 시작 100, 수면 패널티(LT5:-25, H5_6:-15, H6_7:-8, H7_8:0, GT8:0), 피로 -fatigue*4, 통증 -pain*6, 기분(calm:0, ok:-5, anxious:-15, low:-20, irritated:-15), 생리(on:-8, pre:-5, post:0, none:0), Level1/2 보정(F4).
- [x] 모드: score>=70→100, 40<=score<70→70, score<40→40.
- [x] pain>=9 → 40 강제, pain>=7 → 최대 70 (score 무관).
- [x] pain_delta>=+2 within 2h → 최대 70(이벤트 예외).
- [x] checkin 응답에 adapt_applied, updated_day_plan 포함(결정 1).
- [x] **30초 체크인** = UX 목표(클라이언트 타이머/안내용), 백엔드 검증 없음(결정 4).
- [x] **당일 2회째 전환**: 기본 409 (MODE_CHANGE_LIMIT). 예외 = **보호 목적 하향만**(통증 급증/pain override, 저항 폭주). **상향 2회째 당일 절대 금지**(PM 결정 1).

**테스트 목록**

- `test_condition_score.py::test_sleep_penalties`
- `test_condition_score.py::test_fatigue_pain_mood_penalties`
- `test_condition_score.py::test_period_penalties`
- `test_condition_score.py::test_mode_bands`
- `test_condition_score.py::test_pain_9_forces_40`
- `test_condition_score.py::test_pain_7_caps_70`
- `test_condition_score.py::test_pain_delta_within_2h_caps_70`
- `test_condition_score.py::test_checkin_response_has_adapt_applied_and_updated_day_plan`
- `test_mode_change.py::test_mode_change_once_per_day_then_409`
- `test_mode_change.py::test_409_mode_change_limit_when_second_change`
- `test_mode_change.py::test_protection_down_allows_second_change_same_day`
- `test_mode_change.py::test_upward_second_change_forbidden_same_day`

**완료조건**: 위 테스트 PASS, checkin → 내부 adapt 호출 시 응답에 updated_day_plan 반영됨.

---

### Slice 3: Adapter 7종 액션 ✅

**구현 범위**

- `spec_loop/adapter/service.py`: apply_adaptation(day_id, condition_id). drop, shrink, delay, swap, split, protect, soothe.
- `spec_loop/adapter/schemas.py`: AdaptRequest, AdaptResult(actions_applied, updated_plan).
- `spec_loop/adapter/router.py`: POST /adapt/day.
- delay 시 Scheduler에 알림 재설정 위임(플래그 또는 인터페이스만 정의 가능).

**체크리스트**

- [x] drop: priority 낮고 energy_cost 높은 항목 제거(F5).
- [x] shrink: planned_block 재계산, micro_step 재생성(F5).
- [x] delay: 오늘→내일/다음 슬롯, Scheduler 연동 명시(F5).
- [x] swap: energy_cost 기준 순서 재배열(F5).
- [x] split: 1 Task → 2~3 micro_step, “첫 2분 착수” 포함(F5).
- [x] protect: 최소 1개 핵심 유지, protected_block 추가, 침범 불가(F5).
- [x] soothe: /simulate/day 프롬프트 플래그 “자극도↓, 기대 문장 금지, 과정만”(F5).

**테스트 목록**

- `test_adaptation_actions.py::test_drop_low_priority_high_energy`
- `test_adaptation_actions.py::test_shrink_block_and_micro_steps`
- `test_adaptation_actions.py::test_delay_moves_to_next_slot`
- `test_adaptation_actions.py::test_swap_by_energy_cost`
- `test_adaptation_actions.py::test_split_includes_first_two_min`
- `test_adaptation_actions.py::test_protect_adds_block_no_override`
- `test_adaptation_actions.py::test_soothe_flag_passed_to_simulator`

**완료조건**: 7종 액션 각각 테스트 PASS, protect 시 protected_block_minutes 설정됨. ✅ (pytest 7 passed)

---

### Slice 4: Planner + Coach (저항 이벤트·lock_sec·연속 제한) ✅

**구현 범위**

- `spec_loop/planner/service.py`, `schemas.py`, `router.py`: POST /plan/day, DayPlan 생성/갱신(모드 반영).
- `spec_loop/coach/service.py`: 저항 이벤트 기록, coach_action(technique, duration_sec 30~90, lock_sec=120, micro_step), 연속 2회 제한·3회째 adapt_required.
- `spec_loop/coach/schemas.py`: ResistanceEvent 요청/응답, technique/trigger enum(SPEC E).
- `spec_loop/coach/router.py`: POST /resistance/event.
- 이벤트 예외: 저항 폭주(≥3/60min 또는 ≥2/15min) 시 Adapt 강제·모드 하향(결정 3).

**체크리스트**

- [x] POST /plan/day: date, mode, items → day_id, date, mode, items(SPEC C2).
- [x] technique enum: EFT_TIMER, HOOPONO_TIMER, BREATH_60, BODY_SCAN_60, LABEL_30(E).
- [x] trigger enum: START_AVERSION, OVERWHELM, PERFECTIONISM, PAIN, FATIGUE, CONFLICT, UNKNOWN(E).
- [x] duration_sec 30~90, lock_sec=120 const(B3, E).
- [x] 연속 2회 제한, 3회째 “계획 축소(Adapt)” 강제(E).
- [x] 저항 폭주 시 adapt 강제·모드 하향(결정 3).

**테스트 목록**

- `test_planner.py::test_post_plan_day_creates_or_updates`
- `test_coach.py::test_resistance_response_has_technique_duration_lock_micro_step`
- `test_resistance_timer.py::test_technique_duration_30_to_90`
- `test_resistance_timer.py::test_lock_sec_120_const`
- `test_resistance_timer.py::test_third_resistance_forces_adapt`
- `test_event_exceptions.py::test_resistance_storm_3_in_60min_forces_adapt`
- `test_event_exceptions.py::test_resistance_storm_2_in_15min_forces_adapt`

**완료조건**: Planner·Coach API 계약 충족, lock_sec=120·연속 제한·저항 폭주 규칙 테스트 PASS. ✅ (pytest 10 passed)

---

### Slice 5: Scheduler(DB Job 큐)·Simulate·Jobs API ✅

**구현 범위**

- `spec_loop/scheduler/queue.py`: enqueue(job_id, kind, …), poll(status=pending), set_status_result(job_id, status, result). DB만 사용, Redis 없음.
- `spec_loop/scheduler/jobs.py`: 폴링 워커(또는 단일 run_once)로 pending job 처리 → 시뮬레이션/미디어 실행 → result 저장.
- `spec_loop/scheduler/router.py`: GET /jobs/{job_id} → status, result, created_ts.
- `spec_loop/simulator/service.py`: 과정 시뮬레이션 텍스트, Coping Imagery 프롬프트(70/20/10, Outcome 금지, 키워드 필터·리라이트)(B2, D).
- `spec_loop/simulator/router.py`: POST /simulate/day → job_id(202).

**체크리스트**

- [x] Job 큐 DB 기반, Redis 미사용(결정 5).
- [x] POST /simulate/day → job_id 반환(SPEC C2).
- [x] GET /jobs/{job_id} → status(pending|completed|failed), result(SPEC C2).
- [x] Coping: Outcome(성과/보상/미래 자기) 금지, 과정 70%+장애 20%+대처 10%(B2, D).
- [x] 키워드 필터·자동 리라이트(과정 중심)(D).

**테스트 목록**

- `test_scheduler.py::test_enqueue_poll_set_result_db_only`
- `test_scheduler.py::test_get_jobs_returns_status_result`
- `test_simulator.py::test_coping_no_outcome_only_process`
- `test_simulator.py::test_coping_ratio_70_20_10`
- `test_simulator.py::test_outcome_keywords_filtered`
- `test_api_contracts.py::test_post_simulate_day_returns_job_id`
- `test_api_contracts.py::test_get_jobs_contract`

**완료조건**: 시뮬레이션 Job enqueue → 워커 처리 → GET /jobs로 result 조회 가능, Coping 규칙 테스트 PASS. ✅ (pytest 9 passed)

---

### Slice 6: Media(최소)·이벤트 예외 정리·모드 상향 금지 ✅

**구현 범위**

- `spec_loop/media/service.py`: 규칙 기반 최소 이미지/영상 생성(또는 stub) + Job 등록.
- `spec_loop/mode_change/service.py`: 모드 **상향은 당일 허용 안 함**(다음 날 조건으로만)(결정 3).
- `spec_loop/condition/service.py`: 이벤트 예외 정리(통증 급증·저항 폭주·중단/불가). 사용자 ‘중단/불가’ 시 protect+split(결정 3).
- execution_logs에 LOCK_APPLIED, LOCK_EXPIRED 기록 가능(Coach 연동 또는 API 계약).

**체크리스트**

- [x] Media: kind(img/vid), status, input_refs, output_url, created_ts(SPEC C3).
- [x] 모드 상향은 예외로도 기본 금지(결정 3).
- [x] 중단/불가 선택 시 protect+split 적용(결정 3).
- [x] LOCK_APPLIED/LOCK_EXPIRED 이벤트 로깅 가능(E).

**테스트 목록**

- `test_event_exceptions.py::test_pain_surge_applies_protection`
- `test_mode_change.py::test_mode_up_not_allowed_same_day`
- `test_adaptation_actions.py::test_user_stop_impossible_applies_protect_split`
- `test_api_contracts.py::test_media_job_fields`

**완료조건**: 이벤트 예외·모드 상향 금지·Media Job 필드 테스트 PASS. ✅ (pytest 4 passed)

---

### Slice 7: 라우터 등록·API 계약·문구·KPI 로깅 ✅

**구현 범위**

- `main.py`: spec_loop 라우터 6개 등록(plan, simulate, jobs, condition, adapt, resistance), prefix 예: /api/spec 또는 /spec.
- `spec_loop/condition/schemas.py` 또는 상수: 모드 하향 시 문구 “수면/피로/통증 신호로 인해 시작 성공률을 우선합니다.”(B1), 70/40 “보호/최적화” 문구(D).
- execution_logs 기록: PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE, TASK_START 등 호출 시 INSERT(Planner, Adapter, Coach, Condition 연동).
- inferred_flags·“추정” 라벨: behavior_inference.inferred=true 시 inferred_flags 설정(F1).

**체크리스트**

- [x] 6개 API 모두 라우터 등록, 요청/응답 스키마 일치.
- [x] 모드 하향 1줄 문구(B1), 70/40 보호/최적화 문구(D).
- [x] ExecutionLog 이벤트 타입으로 PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE 등 기록(E).
- [x] inferred=true 시 inferred_flags 반영, UI “추정” 라벨 가능(F1).
- [x] **행동 이벤트 1순위 KPI**: START/RESUME 등 행동 이벤트가 기분/감정보다 1순위(E).
- [x] behavior_inference.inferred=true 시 **응답 inferred_flags + UI ‘추정’ 라벨** 사용(F1).
- [x] **위기 징후 안내**: 상수 파일 또는 docs 제품안전문구.md에 고정 문구 명시(D). *(문구는 condition/schemas 상수로 관리)*
- [x] **RAG 정책 문서화**: 정책 문서에 **저장=행동/전술만, 출력=옵션만, 내러티브 생성 금지** 명시. **v1: RAG OFF 또는 stub, 정책+인터페이스만 확보**(PM 결정 5). *(문서 SPEC에 반영됨)*

**테스트 목록**

- `test_api_contracts.py::test_all_six_endpoints_registered`
- `test_api_contracts.py::test_plan_day_contract`
- `test_api_contracts.py::test_condition_checkin_contract`
- `test_api_contracts.py::test_adapt_day_contract`
- `test_api_contracts.py::test_resistance_event_contract`
- `test_condition_score.py::test_mode_down_reason_single_line`
- `test_api_contracts.py::test_execution_log_plan_commit_and_adapt_applied`

**완료조건**: 6개 API E2E(또는 계약) 테스트 PASS, 문구·로깅·inferred 반영 확인. ✅ (pytest 7 passed)

---

## 5) 누락 방지 체크리스트 60개 이상 (근거 요약/구현 위치/테스트명)

| # | 요구사항(근거 요약) | 구현 위치 | 테스트명 |
|---|---------------------|-----------|----------|
| 1 | 3모드(100/70/40)는 “실행 레일” 문구(B1) | condition/schemas 또는 상수 | test_condition_score::test_mode_reason_rail |
| 2 | 모드 하향 1줄: “수면/피로/통증 … 시작 성공률 우선”(B1) | condition/schemas | test_condition_score::test_mode_down_reason_single_line |
| 3 | 전환 하루 1회 + 이벤트 예외만(B1) | mode_change/service, condition/service | test_mode_change::test_mode_change_once_per_day_then_409 |
| 4 | 100→70 shrink 중심(B1) | adapter/service | test_adaptation_actions::test_100_to_70_shrink_centric |
| 5 | 70→40 protect+split 중심(B1) | adapter/service | test_adaptation_actions::test_70_to_40_protect_split |
| 6 | 모드 상향은 “최근 3회 연속 START” 등 있을 때만(B1) | mode_change/service(다음 날만) | test_mode_change::test_mode_up_only_next_day |
| 7 | Coping: Outcome 금지, Process+Coping만(B2) | simulator/service | test_simulator::test_coping_no_outcome_only_process |
| 8 | 과정 70%+장애 20%+대처 10%(B2) | simulator/service | test_simulator::test_coping_ratio_70_20_10 |
| 9 | 시각화 후 2분 행동 잠금 연결(B2,B3) | coach 응답 lock_sec=120 | test_resistance_timer::test_visualization_then_lock_120 |
| 10 | 저항→(30~90초) 기법→즉시 2분 잠금(B3) | coach/service | test_resistance_timer::test_resistance_30_90_then_lock_120 |
| 11 | 감정기법 1회 90초 상한(E) | coach/schemas, service | test_resistance_timer::test_technique_max_90_sec |
| 12 | 연속 2회 제한, 3회째 Adapt 강제(E) | coach/service | test_coach::test_third_resistance_forces_adapt |
| 13 | 2분 동안 “다음 한 동작”만(B3) | coach lock_sec=120 | test_api_contracts::test_resistance_response_lock_120 |
| 14 | 저항 시 질문 최대 1개, 선택지 5개 이하(B3) | coach/service 또는 스키마 | test_resistance_timer::test_resistance_question_max_one |
| 15 | 체크인 질문 1~3, 선택지 5개 이하(F2) | condition 스키마(백엔드는 min만) | test_api_contracts::test_checkin_question_bounds |
| 16 | POST /plan/day 계약(C2) | planner/router, service | test_planner::*, test_api_contracts::test_plan_day_contract |
| 17 | POST /simulate/day → job_id(C2) | simulator/router, scheduler | test_simulator::*, test_api_contracts::test_post_simulate_day_returns_job_id |
| 18 | GET /jobs/{job_id} 계약(C2) | scheduler/router | test_api_contracts::test_get_jobs_contract |
| 19 | POST /condition/checkin 저장+score(C2) | condition/router, service | test_condition_score::* |
| 20 | POST /adapt/day 계약(C2) | adapter/router, service | test_adaptation_actions::*, test_api_contracts::test_adapt_day_contract |
| 21 | POST /resistance/event 계약(C2) | coach/router, service | test_coach::*, test_api_contracts::test_resistance_event_contract |
| 22 | min_condition_set 필수 sleep_hours,fatigue,pain,mood(F2,F3) | condition/schemas, validation | test_condition_score::test_min_condition_set_required |
| 23 | source_level 0/1/2(F1,F3) | condition/schemas | test_api_contracts::test_source_level_enum |
| 24 | condition_score 수면 패널티(F4) | condition/service | test_condition_score::test_sleep_penalties |
| 25 | condition_score 피로/통증/기분(F4) | condition/service | test_condition_score::test_fatigue_pain_mood_penalties |
| 26 | condition_score 생리(F4) | condition/service | test_condition_score::test_period_penalties |
| 27 | Level1/2 보정(F4) | condition/service | test_condition_score::test_behavior_inference_penalties |
| 28 | 모드 구간 score>=70→100 등(F4) | condition/service | test_condition_score::test_mode_bands |
| 29 | pain>=7 최대 70(F4) | condition/service | test_condition_score::test_pain_7_caps_70 |
| 30 | pain>=9 → 40(F4) | condition/service | test_condition_score::test_pain_9_forces_40 |
| 31 | pain_delta>=+2/2h → max70(결정 3) | condition/service | test_condition_score::test_pain_delta_within_2h_caps_70 |
| 32 | drop: priority 낮고 energy 높은 제거(F5) | adapter/service | test_adaptation_actions::test_drop_low_priority_high_energy |
| 33 | shrink: planned_block+micro_step 재생성(F5) | adapter/service | test_adaptation_actions::test_shrink_block_and_micro_steps |
| 34 | delay: 이월+Scheduler 알림(F5) | adapter/service, scheduler | test_adaptation_actions::test_delay_moves_to_next_slot |
| 35 | swap: energy_cost 순서(F5) | adapter/service | test_adaptation_actions::test_swap_by_energy_cost |
| 36 | split: 2~3 micro_step, 첫 2분 착수(F5) | adapter/service | test_adaptation_actions::test_split_includes_first_two_min |
| 37 | protect: 1개 핵심+protected_block(F5) | adapter/service | test_adaptation_actions::test_protect_adds_block_no_override |
| 38 | soothe: 자극도↓ 과정만(F5) | simulator/service | test_simulator::test_soothe_tone_down_prompt |
| 39 | Task 필드 전부(C3) | spec_loop/models/task.py | test_api_contracts::test_task_model_fields |
| 40 | DayPlan items 구조(C3) | spec_loop/models/day_plan.py | test_api_contracts::test_day_plan_model_fields |
| 41 | ExecutionLog event_type enum(E) | models/execution_log, validation | test_api_contracts::test_execution_log_event_types |
| 42 | ResistanceEvent action 30-90, lock_sec=120(E) | coach/schemas, validation | test_resistance_timer::* |
| 43 | MediaJob 필드(C3) | spec_loop/models/media_job.py | test_api_contracts::test_media_job_fields |
| 44 | Condition 저장 스키마 condition_id,ts(F3) | validation/condition_schema | test_condition_score::test_condition_stored_with_id_ts |
| 45 | technique enum 5종(E) | coach/schemas | test_coach::test_technique_enum |
| 46 | trigger enum 7종(E) | coach/schemas | test_api_contracts::test_trigger_enum |
| 47 | Outcome 키워드 필터+리라이트(D) | simulator/service | test_simulator::test_outcome_keywords_filtered |
| 48 | 라벨 “추정/신호”, “진단/치료” 금지(D) | 상수/문서 | test_simulator 또는 문서 |
| 49 | 시각화 15–30초+2분 잠금(D) | API lock_sec=120 | test_resistance_timer::test_visualization_then_lock_120 |
| 50 | 통증/생리 일정 수준 protect·shrink 우선(D) | condition+adapter | test_condition_score::*, test_adaptation_actions::* |
| 51 | checkin 후 서버 내부 adapt(결정 1) | condition/service | test_condition_score::test_checkin_response_has_adapt_applied_and_updated_day_plan |
| 52 | 요청에 condition_id 없음(충돌 해결) | condition/schemas CheckinRequest | test_api_contracts::test_checkin_request_no_condition_id |
| 53 | 30초 체크인 UX 목표, 백엔드 미검증(결정 4) | condition/router(검증 없음) | test_api_contracts::test_checkin_no_30s_validation |
| 54 | Job Queue DB 기반, Redis 미사용(결정 5) | scheduler/queue, models/job | test_scheduler::test_job_table_db_only |
| 55 | 저항 폭주 ≥3/60min 또는 ≥2/15min(결정 3) | coach/service | test_event_exceptions::test_resistance_storm_* |
| 56 | 중단/불가 → protect+split(결정 3) | adapter/service | test_adaptation_actions::test_user_stop_impossible_applies_protect_split |
| 57 | 모드 상향 당일 금지(결정 3) | mode_change/service | test_mode_change::test_mode_up_not_allowed_same_day |
| 58 | 70/40 “보호/최적화” 문구(D) | condition/schemas 또는 상수 | test_condition_score::test_mode_down_uses_protect_optimize_wording |
| 59 | ExecutionLog LOCK_APPLIED, LOCK_EXPIRED(E) | execution_log event_type, coach 연동 | test_api_contracts::test_execution_log_lock_events |
| 60 | TTFS·모드별 완료율 등 KPI 집계 가능(E) | execution_logs 구조+인덱스 | test_api_contracts::test_execution_logs_queryable_for_kpi |
| 61 | inferred=true 시 inferred_flags·추정 라벨(F1) | condition/service, 응답 | test_condition_score::test_inferred_flags_when_behavior_inference |
| 62 | 위기 징후 별도 안내(제품 안전 문구)(D) | 상수/문서 | 문서 또는 test 상수 |
| 63 | date_time↔ts 매핑(C3,GAP) | conditions 테이블 ts | test_condition_score::test_condition_ts_stored |
| 64 | RAG “선호/효과 있었던 행동”만(D) | (본 Slice 범위 외, 정책 명시) | - |
| 65 | delay 시 Scheduler 알림 재설정(F5,GAP) | adapter→scheduler 인터페이스 | test_adaptation_actions::test_delay_scheduler_hook |
| 66 | 30초 체크인 UX 목표(F1, 결정 4) | condition 문서/상수 | test_api_contracts 또는 문서 |
| 67 | Scheduler delay 시 알림 재설정(F5) | scheduler 모듈 책임·delay 연동 | test_adaptation_actions::test_delay_scheduler_hook |
| 68 | 행동 이벤트 1순위 KPI(E) | execution_logs·집계 로직 | test_api_contracts::test_execution_logs_queryable_for_kpi |
| 69 | 5분 내 START: technique_end_ts 기준 5분 내 TASK_START(E, PM 결정 2) | resistance_events.technique_end_ts, execution_logs | test_resistance_timer::test_5min_start_rate_from_technique_end_ts |
| 70 | TTFS: 분모 PLAN_COMMIT, fallback created_at(E, PM 결정 4) | execution_logs PLAN_COMMIT, day_plans.created_at | test_api_contracts::test_ttfs_plan_commit_fallback_created_at |
| 71 | KPI 8개 목록+산출 방법(E) | docs 또는 계획서 표 | 문서 |
| 72 | C3 context vs E metrics(C3,E) | execution_logs 스키마 주석 | test_api_contracts |
| 73 | 위기 징후 안내 문구 위치(D) | 상수/docs | 문서 |
| 74 | 당일 2회째: 기본 409, 예외=보호 목적 하향만, 상향 2회째 금지(PM 결정 1) | mode_change/service | test_mode_change::test_409_mode_change_limit_when_second_change, test_protection_down_allows_second_change_same_day, test_upward_second_change_forbidden_same_day |
| 75 | 1 user + 1 date = 1 DayPlan, UNIQUE(user_id, date)(PM 결정 3) | day_plans 모델 | test_api_contracts::test_day_plan_unique_user_date |
| 76 | mode_changes day_id 귀속, date 파생(PM 결정 3) | mode_changes 모델 | test_mode_change::test_mode_changes_by_day_id |
| 77 | ExecutionLog event_type enum 변경 없음, technique_end_ts로 5분 START(PM 결정 2) | execution_log, resistance_events | test_api_contracts::test_execution_log_event_types_unchanged, test_5min_start_from_technique_end_ts |
| 78 | RAG 정책 문서·v1 stub·내러티브 금지(PM 결정 5) | docs 정책 문서, RAG 인터페이스 | 문서 + (선택) test_rag_policy_stub |

---

## 6) KPI 8개 산출 방법 요약 (SPEC E)

| KPI | 산출 방법(테이블/필드) |
|-----|------------------------|
| EFT 후 5분 내 START율 | resistance_events.**technique_end_ts** 기준 5분 이내 execution_logs에 TASK_START 존재 여부. (선택) kpi_events에 RESISTANCE_TECHNIQUE_END 별도 기록(PM 결정 2) |
| 2분 행동 잠금 준수율 | LOCK_APPLIED ~ LOCK_EXPIRED 구간 이탈 여부(execution_logs) |
| TTFS | 첫 TASK_START ts − **(PLAN_COMMIT.ts 있으면 해당 시각, 없으면 day_plans.created_at)** (PM 결정 4) |
| 모드별 완료율/중단율 | execution_logs event_type, mode별 집계 |
| Adapt 후 30분 내 RESUME율 | ADAPT_APPLIED ts 후 30분 내 TASK_RESUME |
| 질문 수/일 | conditions + resistance_events count by day |
| Drop/Shrink/Swap 후 괴리 감소율 | execution_logs.metrics planned vs executed |
| 3일 연속 START streak | execution_logs TASK_START by date, 연속 3일 |

---

## 7) PM 결정사항(모호 5개 답변) 요약

| # | 결정 | 반영 위치 |
|---|------|-----------|
| 1 | **당일 2회째 mode 전환**: 기본 409 (MODE_CHANGE_LIMIT). 예외 = 보호 목적 하향만(통증 급증/pain override, 저항 폭주). 상향 2회째 당일 절대 금지. | §2 API·내부 흐름, §3 mode_changes, Slice 2·4, 체크리스트 74, test_mode_change |
| 2 | **RESISTANCE_TECHNIQUE_END**: ExecutionLog.event_type enum **변경 안 함**. ResistanceEvent에 **technique_end_ts**(또는 duration_sec 기반 end_ts). 5분 내 START율 = technique_end_ts 기준 5분 내 TASK_START. (선택) kpi_events 테이블 | §3 resistance_events·execution_logs, KPI 표, 체크리스트 69·77 |
| 3 | **1 user + 1 date = 1 DayPlan**. UNIQUE(user_id, date). mode_changes는 day_id(FK) 귀속만. date 컬럼 없거나 day_plans.date와 동일(정합성). | §3 day_plans·mode_changes, Slice 1, 체크리스트 75·76 |
| 4 | **TTFS 분모**: PLAN_COMMIT 시각. 없으면 fallback day_plans.created_at. TTFS = first TASK_START ts − (PLAN_COMMIT.ts or created_at). | §3 TTFS, KPI 표, 체크리스트 70 |
| 5 | **RAG**: 정책 문서에 저장=행동/전술만, 출력=옵션만 명시. **v1: RAG OFF 또는 stub**, 정책+인터페이스만 확보. 내러티브 생성 금지. | Slice 7 체크리스트, §7 RAG, 체크리스트 78 |

---

## 8) RAG 정책·v1 구현 범위

- **정책 문서**(docs 또는 spec_loop 정책): **저장 = 선호/효과 있었던 행동(전술)만. 출력 = 지시가 아닌 옵션.** 정체성/평가 문장·내러티브 생성 금지(SPEC D).
- **v1 구현**: RAG는 **OFF 또는 stub**. 정책 문구 + 인터페이스(저장/조회 시그니처)만 확보. 실제 RAG 인덱싱·검색은 미구현 또는 no-op.

---

## 완료조건 요약 (Slice별)

- **Slice 1**: DB·모델·validation 준비, 관련 pytest PASS.
- **Slice 2**: checkin → score·모드·pain override·내부 adapt·응답 필드, mode_change 409, pytest PASS.
- **Slice 3**: Adapter 7종 액션·POST /adapt/day, pytest PASS.
- **Slice 4**: POST /plan/day, POST /resistance/event, lock_sec·연속 제한·저항 폭주, pytest PASS.
- **Slice 5**: DB Job 큐·POST /simulate/day·GET /jobs·Coping 규칙, pytest PASS.
- **Slice 6**: Media 최소·모드 상향 금지·이벤트 예외 정리·LOCK 이벤트, pytest PASS.
- **Slice 7**: 라우터 등록·6 API 계약·문구·로깅·inferred, pytest PASS.

---

**코드 작성 준비 완료 여부: YES**
