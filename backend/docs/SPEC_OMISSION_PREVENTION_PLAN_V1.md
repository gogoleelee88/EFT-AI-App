# 누락 방지 계획서 v1

**기준 문서**: SPEC.md (제안2 코어 + 최적 통합안)  
**목적**: 구현 전 요구사항 정리·검증 레이어·위험 완화까지 한 문서에 정리.  
**주의**: 코드 작성 금지. 계획서만 작성.

---

## 1) 파일 트리(backend 기준) + 각 모듈 책임

### 1.1 디렉터리 구조

```
backend/
├── main.py
├── config/
│   └── settings.py
├── database.py
│
├── spec_loop/
│   ├── __init__.py
│   │
│   ├── planner/
│   │   ├── __init__.py
│   │   ├── service.py
│   │   ├── schemas.py
│   │   └── router.py
│   │
│   ├── simulator/
│   │   ├── __init__.py
│   │   ├── service.py
│   │   ├── schemas.py
│   │   └── router.py
│   │
│   ├── coach/
│   │   ├── __init__.py
│   │   ├── service.py
│   │   ├── schemas.py
│   │   └── router.py
│   │
│   ├── adapter/
│   │   ├── __init__.py
│   │   ├── service.py
│   │   ├── schemas.py
│   │   └── router.py
│   │
│   ├── scheduler/
│   │   ├── __init__.py
│   │   ├── queue.py
│   │   ├── jobs.py
│   │   ├── schemas.py
│   │   └── router.py
│   │
│   ├── media/
│   │   ├── __init__.py
│   │   ├── service.py
│   │   ├── schemas.py
│   │   └── (결과는 GET /jobs/{job_id}로 통합)
│   │
│   ├── condition/
│   │   ├── __init__.py
│   │   ├── service.py
│   │   ├── schemas.py
│   │   └── router.py
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── task.py
│   │   ├── day_plan.py
│   │   ├── condition.py
│   │   ├── execution_log.py
│   │   ├── resistance_event.py
│   │   └── media_job.py
│   │
│   └── validation/
│       ├── __init__.py
│       ├── condition_schema.py
│       ├── resistance_event_schema.py
│       └── execution_log_schema.py
│
└── tests/
    └── spec_loop/
        ├── test_planner.py
        ├── test_simulator.py
        ├── test_coach.py
        ├── test_adapter.py
        ├── test_scheduler.py
        ├── test_condition_score.py
        ├── test_adaptation_actions.py
        ├── test_resistance_timer.py
        └── test_api_contracts.py
```

### 1.2 각 모듈 책임 (SPEC C1 기준)

| 모듈 | 경로 | 책임 (SPEC 문구 그대로) |
|------|------|-------------------------|
| **Planner** | `spec_loop/planner/` | Task → DayPlan 생성/수정(모드 반영). |
| **Simulator** | `spec_loop/simulator/` | Plan 기반 “과정 시뮬레이션(텍스트)” + Coping Imagery 프롬프트 생성. |
| **Coach** | `spec_loop/coach/` | 저항 이벤트 처리(기법 타이머, 2분 잠금, 마이크로 행동 제시). |
| **Adapter** | `spec_loop/adapter/` | Condition 변화 → 모드/계획 재구성(Adaptation Actions 실행). |
| **Scheduler** | `spec_loop/scheduler/` | Job 큐/백그라운드 실행(시뮬, 미디어 렌더, RAG 인덱싱 등). |
| **Media** | `spec_loop/media/` | 이미지/짧은 영상 생성(“규칙 기반 최소”) + 큐잉 + 저장. |
| **Condition** | `spec_loop/condition/` | 체크인 수집, condition_score 계산, 모드(100/70/40) 결정, pain 안전 규칙. (Adapter/Planner가 참조) |

---

## 2) API 6개에 대한 OpenAPI 수준 요약 (요청/응답/에러)

### 2.1 POST /plan/day

| 항목 | 내용 |
|------|------|
| **요약** | DayPlan 생성/갱신(모드 포함). |
| **요청** | `date`(string, date), `mode`(integer, enum 100|70|40), `items`(array of { task_id, planned_block_minutes, micro_steps[] }). |
| **응답 200** | `day_id`, `date`, `mode`, `items` 동일 구조. |
| **에러** | 400: date/mode/items 유효하지 않음. 404: task_id 미존재. 422: Pydantic 검증 실패. |

---

### 2.2 POST /simulate/day

| 항목 | 내용 |
|------|------|
| **요약** | day_id 입력, 비동기 Job 반환. |
| **요청** | `day_id`(string, UUID). |
| **응답 202** | `job_id`(string). |
| **에러** | 400: day_id 없음/잘못됨. 404: day_id에 해당 DayPlan 없음. 422: body 검증 실패. |

---

### 2.3 GET /jobs/{job_id}

| 항목 | 내용 |
|------|------|
| **요약** | 시뮬/미디어 결과 조회. |
| **요청** | path `job_id`(string, UUID). |
| **응답 200** | `job_id`, `status`(pending|completed|failed), `kind`(simulation|media), `result`(object 또는 null), `created_ts`. 시뮬 시 result: day_id, simulation_text, coping_prompt. 미디어 시 result: media_job_id, kind, output_url, input_refs. |
| **에러** | 404: job_id 없음. |

---

### 2.4 POST /condition/checkin

| 항목 | 내용 |
|------|------|
| **요약** | 컨디션 저장 + condition_score 계산. |
| **요청** | `date_time`(string, date-time), `source_level`(0|1|2), `min_condition_set`(object, required: sleep_hours, fatigue, pain, mood; optional: period_status), `wearable`(optional), `behavior_inference`(optional). min_condition_set: sleep_hours enum, fatigue/pain 0-10, mood enum, period_status enum. |
| **응답 200** | `condition_id`, `ts`, `source_level`, `condition_score`(0-100), `mode`(100|70|40), `inferred_flags`(object). pain 안전 규칙 적용된 최종 mode. |
| **에러** | 400: min_condition_set 누락/범위 위반. 422: Pydantic/JSON schema 검증 실패. |

---

### 2.5 POST /adapt/day

| 항목 | 내용 |
|------|------|
| **요약** | condition 변화 반영(드롭/축소/스왑 등) 결과 반환. |
| **요청** | `day_id`, `condition_id`, `condition_score`, `mode`. |
| **응답 200** | `day_id`, `actions_applied`(array of drop|shrink|delay|swap|split|protect|soothe), `updated_plan`(DayPlan 구조 + protected_block_minutes). |
| **에러** | 400: day_id/condition_id 불일치. 404: day_id 또는 condition_id 없음. 422: body 검증 실패. |

---

### 2.6 POST /resistance/event

| 항목 | 내용 |
|------|------|
| **요약** | 저항 이벤트 기록 + 즉시 coach_action 반환(타이머+2분 행동). |
| **요청** | `day_id`, `task_id`(optional), `trigger`(enum), `intensity`(0-10), `context`(optional: mode, app_state). trigger: START_AVERSION, OVERWHELM, PERFECTIONISM, PAIN, FATIGUE, CONFLICT, UNKNOWN. |
| **응답 200** | `event_id`, `ts`, `action`: { `technique`, `duration_sec`(30-90), `lock_sec`(120), `micro_step` }, `lock_applied`(boolean). technique enum: EFT_TIMER, HOOPONO_TIMER, BREATH_60, BODY_SCAN_60, LABEL_30. |
| **에러** | 400: day_id 없음, 연속 3회 시 Adapt 유도 메시지 등. 404: day_id 없음. 422: trigger/intensity/context 검증 실패. |

---

### 2.7 공통 에러 코드

| 코드 | 의미 |
|------|------|
| 400 | Bad Request – 비즈니스 규칙 위반(예: 모드 전환 일 1회 초과, 잘못된 day_id). |
| 404 | Not Found – 리소스 없음. |
| 422 | Unprocessable Entity – 요청 body/query 검증 실패(Pydantic/JSON schema). |
| 500 | Internal Server Error – 서버 예외(에러 로그만, 클라이언트에는 일반 메시지). |

---

## 3) DB 스키마(테이블/컬럼/인덱스) + JSON schema 검증 레이어

### 3.1 테이블·컬럼·인덱스

**tasks**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| task_id | UUID | PK |
| title | VARCHAR(500) | NOT NULL |
| est_minutes | INT | NOT NULL |
| priority | INT | NOT NULL |
| tags | JSONB | |
| energy_cost | SMALLINT | NOT NULL, CHECK(1-5) |
| pain_sensitive | BOOLEAN | NOT NULL DEFAULT false |
| requires_focus | BOOLEAN | NOT NULL DEFAULT false |
| created_at | TIMESTAMPTZ | DEFAULT now() |

인덱스: `tasks_pkey(task_id)`.

---

**day_plans**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| day_id | UUID | PK |
| date | DATE | NOT NULL |
| mode | SMALLINT | NOT NULL, CHECK(100/70/40) |
| items | JSONB | NOT NULL (array of { task_id, planned_block_minutes, micro_steps[] }) |
| protected_block_minutes | INT | |
| created_at, updated_at | TIMESTAMPTZ | |

인덱스: `day_plans_pkey(day_id)`, `ix_day_plans_date(date)`.

---

**conditions**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| condition_id | UUID | PK |
| ts | TIMESTAMPTZ | NOT NULL |
| source_level | SMALLINT | NOT NULL, CHECK(0/1/2) |
| min_condition_set | JSONB | NOT NULL |
| wearable | JSONB | |
| behavior_inference | JSONB | |
| condition_score | INT | CHECK(0-100) |
| inferred_flags | JSONB | |

인덱스: `conditions_pkey(condition_id)`, `ix_conditions_ts(ts)`.

---

**execution_logs**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| log_id | UUID | PK |
| ts | TIMESTAMPTZ | NOT NULL |
| day_id | UUID | NOT NULL, FK day_plans |
| task_id | UUID | FK tasks |
| event_type | VARCHAR(32) | NOT NULL, enum |
| duration_sec | INT | >=0 |
| mode | SMALLINT | 100/70/40 |
| condition_ref | UUID | FK conditions |
| resistance_event_ref | UUID | FK resistance_events |
| metrics | JSONB | |
| context | JSONB | |

인덱스: `execution_logs_pkey(log_id)`, `ix_execution_logs_day_ts(day_id, ts)`, `ix_execution_logs_event_type(event_type)`.

---

**resistance_events**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| event_id | UUID | PK |
| ts | TIMESTAMPTZ | NOT NULL |
| day_id | UUID | NOT NULL, FK day_plans |
| task_id | UUID | FK tasks |
| trigger | VARCHAR(32) | NOT NULL, enum |
| intensity | SMALLINT | NOT NULL, CHECK(0-10) |
| context | JSONB | |
| action | JSONB | NOT NULL (technique, duration_sec, lock_sec, micro_step) |
| chosen_technique | VARCHAR(32) | |
| lock_applied | BOOLEAN | NOT NULL |
| outcome | JSONB | |

인덱스: `resistance_events_pkey(event_id)`, `ix_resistance_events_day_ts(day_id, ts)`.

---

**media_jobs**

| 컬럼 | 타입 | 제약 |
|------|------|------|
| media_job_id | UUID | PK |
| kind | VARCHAR(8) | NOT NULL, 'img'|'vid' |
| status | VARCHAR(20) | NOT NULL |
| input_refs | JSONB | array |
| output_url | TEXT | |
| created_ts | TIMESTAMPTZ | NOT NULL |

인덱스: `media_jobs_pkey(media_job_id)`.

---

**jobs** (Scheduler 큐 메타)

| 컬럼 | 타입 | 제약 |
|------|------|------|
| job_id | UUID | PK |
| kind | VARCHAR(20) | simulation|media|rag |
| status | VARCHAR(20) | pending|completed|failed |
| result | JSONB | |
| created_ts | TIMESTAMPTZ | NOT NULL |
| updated_ts | TIMESTAMPTZ | |

인덱스: `jobs_pkey(job_id)`, `ix_jobs_status_created(status, created_ts)`.

---

### 3.2 JSON schema를 둘 검증 레이어

| 스키마 | 검증 레이어 | 위치 | 용도 |
|--------|-------------|------|------|
| **Condition** (F3) | 요청 body 검증 | `spec_loop/condition/schemas.py` (Pydantic) + `spec_loop/validation/condition_schema.py` (JSON schema 기반 선택 검증) | POST /condition/checkin 요청. DB 저장 전 min_condition_set, source_level, wearable, behavior_inference 재검증. |
| **ResistanceEvent** (E) | 응답·저장 payload 검증 | `spec_loop/coach/schemas.py` (Pydantic) + `spec_loop/validation/resistance_event_schema.py` | POST /resistance/event 응답 action(technique, duration_sec 30-90, lock_sec=120, micro_step). DB 저장 시 전체 이벤트 객체 검증. |
| **ExecutionLog** (E) | 저장 payload 검증 | `spec_loop/models/execution_log.py` 저장 직전 또는 전용 로그 서비스 + `spec_loop/validation/execution_log_schema.py` | event_type, metrics 등 로그 기록 시 스키마 준수. |

**원칙**

- **API 경계**: Pydantic이 요청/응답 1차 검증(타입·enum·범위). OpenAPI 문서와 동기화.
- **도메인/저장**: JSON schema(SPEC E, F3)를 `validation/`에서 적용해 DB/내부 전달 payload를 재검증. DB 트리거보다 애플리케이션 레이어에서 수행 권장.

---

## 4) 요구사항 체크리스트(40개 이상) + 구현 매핑

### B. 최적 통합안(코어 규칙)

| # | 요구사항 | SPEC | 구현 매핑 (파일 / 함수 / 테스트명) |
|---|----------|------|------------------------------------|
| 1 | 3모드(100/70/40)는 “능력 평가”가 아닌 “환경/컨디션에 맞춘 실행 레일” | B1 | condition/service.py `compute_mode()` / test_condition_score.py `test_mode_is_execution_rail_not_ability` |
| 2 | 모드 하향 시 UI 문구 1줄: “수면/피로/통증 신호로 인해 시작 성공률을 우선합니다.” | B1 | condition/schemas.py 응답 `mode_reason` / test_condition_score.py `test_mode_down_reason_single_line` |
| 3 | 모드 전환 하루 1회 기본 + 이벤트 기반 예외만 | B1 | condition/service.py 또는 planner 일 1회 제한 / test_condition_score.py `test_mode_change_once_per_day` |
| 4 | 100→70: 총부하(shrink) 중심 | B1 | adapter/service.py `apply_shrink()` / test_adaptation_actions.py `test_100_to_70_shrink_centric` |
| 5 | 70→40: protect + split 중심 | B1 | adapter/service.py `apply_protect()`, `apply_split()` / test_adaptation_actions.py `test_70_to_40_protect_split` |
| 6 | 모드 상향은 “최근 3회 연속 START 성공” 등 행동 근거 있을 때만 | B1 | condition/service.py 또는 planner `can_upgrade_mode()` / test_condition_score.py `test_mode_up_only_after_three_starts` |
| 7 | Coping Imagery: Outcome(성과/미래 보상) 금지, Process+Coping만 | B2 | simulator/service.py `build_coping_prompt()` / test_simulator.py `test_coping_no_outcome_only_process` |
| 8 | 과정 70% + 장애 20% + 대처 10% 강제 체크 | B2 | simulator/service.py 비율 검증/리라이트 / test_simulator.py `test_coping_ratio_70_20_10` |
| 9 | 시각화 후 바로 2분 행동 잠금 연결 | B2,B3 | coach/service.py lock_sec=120, API 계약 / test_resistance_timer.py `test_visualization_then_lock_120` |
| 10 | 저항 이벤트 → (30~90초) 감정기법 → 즉시 2분 행동 잠금 | B3 | coach/service.py `create_coach_action()` / test_resistance_timer.py `test_resistance_30_90_then_lock_120` |
| 11 | 감정기법 1회 90초 상한 | E | coach/schemas.py, service.py duration_sec max=90 / test_resistance_timer.py `test_technique_max_90_sec` |
| 12 | 연속 2회 제한, 3회째는 계획 축소(Adapt) 강제 | E | coach/service.py 연속 횟수 + Adapt 플래그 / test_coach.py `test_third_resistance_forces_adapt` |
| 13 | 2분 동안 “다음 한 동작”만 보여줌(스크롤/탐색 제한) | B3 | coach/schemas.py lock_sec=120, API 문서 / test_api_contracts.py `test_resistance_response_lock_120` |
| 14 | 저항 이벤트 시 질문 최대 1개(선택지 5개 이하) | B3 | coach/service.py 또는 스키마 / test_resistance_timer.py `test_resistance_question_max_one` |
| 15 | 체크인 UX: 질문 1~3개, 선택지 5개 이하 | F2 | condition/schemas.py min_condition_set / test_api_contracts.py `test_checkin_question_bounds` |

### C. API·아키텍처

| # | 요구사항 | SPEC | 구현 매핑 |
|---|----------|------|-----------|
| 16 | POST /plan/day → DayPlan 생성/갱신(모드 포함) | C2 | planner/router.py `post_plan_day`, planner/service.py `create_or_update_day_plan` / test_planner.py, test_api_contracts.py |
| 17 | POST /simulate/day → day_id 입력, 비동기 job_id 반환 | C2 | simulator/router.py `post_simulate_day`, scheduler/queue.py / test_simulator.py, test_api_contracts.py |
| 18 | GET /jobs/{job_id} → 시뮬/미디어 결과 조회 | C2 | scheduler/router.py `get_job` / test_api_contracts.py |
| 19 | POST /condition/checkin → 저장 + condition_score 계산 | C2 | condition/router.py `post_condition_checkin`, condition/service.py `save_and_score` / test_condition_score.py |
| 20 | POST /adapt/day → condition 반영 결과 반환 | C2 | adapter/router.py `post_adapt_day`, adapter/service.py `adapt_day_plan` / test_adaptation_actions.py, test_api_contracts.py |
| 21 | POST /resistance/event → 기록 + coach_action 반환 | C2 | coach/router.py `post_resistance_event`, coach/service.py `record_and_respond` / test_coach.py, test_api_contracts.py |

### F. Condition & Adaptation

| # | 요구사항 | SPEC | 구현 매핑 |
|---|----------|------|-----------|
| 22 | min_condition_set 필수: sleep_hours, fatigue, pain, mood; period_status 옵션 | F2,F3 | condition/schemas.py, validation/condition_schema.py / test_condition_score.py `test_min_condition_set_required` |
| 23 | source_level 0/1/2 | F1,F3 | condition/schemas.py / test_api_contracts.py |
| 24 | condition_score: 시작 100, 수면 패널티 LT5:-25, H5_6:-15, H6_7:-8, H7_8:0, GT8:0 | F4 | condition/service.py `compute_condition_score()` / test_condition_score.py `test_sleep_penalties` |
| 25 | condition_score: 피로 -(fatigue*4), 통증 -(pain*6), 기분 calm:0, ok:-5, anxious:-15, low:-20, irritated:-15 | F4 | condition/service.py `compute_condition_score()` / test_condition_score.py `test_fatigue_pain_mood_penalties` |
| 26 | condition_score: 생리 on:-8, pre:-5, post:0, none:0 | F4 | condition/service.py / test_condition_score.py `test_period_penalties` |
| 27 | Level1/2 보정: input_latency_sec>120 & inferred → -5; app_switch>15 & inferred → -5 | F4 | condition/service.py / test_condition_score.py `test_behavior_inference_penalties` |
| 28 | 모드: score>=70→100, 40<=score<70→70, score<40→40 | F4 | condition/service.py `compute_mode()` / test_condition_score.py `test_mode_bands` |
| 29 | pain>=7이면 score 무관 최대 70 | F4 | condition/service.py pain 안전 규칙 / test_condition_score.py `test_pain_7_caps_70` |
| 30 | pain>=9이면 40 강제 | F4 | condition/service.py / test_condition_score.py `test_pain_9_forces_40` |
| 31 | Adaptation drop: 비핵심(priority 낮고 energy_cost 높은) 제거 | F5 | adapter/service.py `apply_drop()` / test_adaptation_actions.py `test_drop_low_priority_high_energy` |
| 32 | Adaptation shrink: planned_block 재계산 + micro_step 재생성 | F5 | adapter/service.py `apply_shrink()` / test_adaptation_actions.py `test_shrink_block_and_micro_steps` |
| 33 | Adaptation delay: 오늘→내일/다음 슬롯 이월, Scheduler 연동 | F5 | adapter/service.py `apply_delay()`, scheduler / test_adaptation_actions.py `test_delay_moves_to_next_slot` |
| 34 | Adaptation swap: energy_cost 기준 순서 재배열 | F5 | adapter/service.py `apply_swap()` / test_adaptation_actions.py `test_swap_by_energy_cost` |
| 35 | Adaptation split: 1 Task → 2~3 micro_step, “첫 2분 착수” 포함 | F5 | adapter/service.py `apply_split()` / test_adaptation_actions.py `test_split_includes_first_two_min` |
| 36 | Adaptation protect: 최소 1개 핵심 유지 + protected_block, 침범 불가 | F5 | adapter/service.py `apply_protect()`, day_plan items 락 / test_adaptation_actions.py `test_protect_adds_block_no_override` |
| 37 | Adaptation soothe: 컨디션 저하 시 Coping 짧게/중립, “자극도↓, 기대 문장 금지, 과정만” | F5 | simulator/service.py soothe 플래그 / test_simulator.py `test_soothe_tone_down_prompt` |

### 데이터 모델·스키마

| # | 요구사항 | SPEC | 구현 매핑 |
|---|----------|------|-----------|
| 38 | Task: task_id, title, est_minutes, priority, tags, energy_cost(1-5), pain_sensitive, requires_focus | C3 | spec_loop/models/task.py / test_api_contracts.py `test_task_model_fields` |
| 39 | DayPlan: day_id, date, mode(100/70/40), items[{task_id, planned_block, micro_steps[]}] | C3 | spec_loop/models/day_plan.py / test_api_contracts.py `test_day_plan_model_fields` |
| 40 | ExecutionLog: log_id, day_id, event_type(START/STOP/RESUME/COMPLETE/PLAN_COMMIT/ADAPT_APPLIED), ts, metrics 등 | C3,E | spec_loop/models/execution_log.py, validation/execution_log_schema.py / test_api_contracts.py |
| 41 | ResistanceEvent: event_id, day_id, ts, trigger, intensity, action(technique, duration_sec 30-90, lock_sec=120, micro_step) | C3,E | spec_loop/models/resistance_event.py, coach/schemas.py, validation / test_resistance_timer.py, test_api_contracts.py |
| 42 | MediaJob: media_job_id, kind(img/vid), status, input_refs, output_url, created_ts | C3 | spec_loop/models/media_job.py / test_api_contracts.py |
| 43 | Condition JSON 스키마: condition_id, ts, source_level, min_condition_set, wearable, behavior_inference | F3 | spec_loop/validation/condition_schema.py, condition/schemas.py / test_condition_score.py |
| 44 | technique enum: EFT_TIMER, HOOPONO_TIMER, BREATH_60, BODY_SCAN_60, LABEL_30 | E | coach/schemas.py / test_coach.py |
| 45 | trigger enum: START_AVERSION, OVERWHELM, PERFECTIONISM, PAIN, FATIGUE, CONFLICT, UNKNOWN | E | coach/schemas.py / test_api_contracts.py |

### D. 임상·안전

| # | 요구사항 | SPEC | 구현 매핑 |
|---|----------|------|-----------|
| 46 | Outcome 시각화 키워드 필터링 + 리라이트(과정 중심) | D | simulator/service.py 키워드 필터·리라이트 / test_simulator.py `test_outcome_keywords_filtered` |
| 47 | 라벨 “추정/신호”만, “진단/치료” 문구 금지 | D | 상수·NL 문자열, 조건부 표기 / test_simulator.py 또는 문서 |
| 48 | 시각화 최대 15–30초, 즉시 2분 행동 잠금으로만 이어지게 | D | API/클라이언트 계약(lock_sec=120, duration_sec 상한) / test_resistance_timer.py |
| 49 | 통증/생리 일정 수준이면 protect·shrink 우선 | D | condition/service.py + adapter 액션 선택 / test_condition_score.py, test_adaptation_actions.py |

**총 49항목.** 구현 시 위 표의 파일/함수/테스트명으로 매핑하고, SPEC 준수 리포트에서 PASS/FAIL + 코드 위치 기록.

---

## 5) 위험요소 TOP10 + 완화 전략 (운영/임상 안전장치/도파민 선행 방지)

| 순위 | 위험 | 구분 | 완화 전략 |
|------|------|------|-----------|
| 1 | **도파민 선행**: 영상/이미지 소비가 실제 행동을 대체 | 임상·도파민 | 시각화 길이 상한(15–30초), 시각화 후 반드시 2분 행동 잠금(lock_sec=120)으로만 이어지게 API·UI 고정. Coping Imagery는 “시청”이 아닌 “행동 트리거”로만 사용. (SPEC B2, D) |
| 2 | **회피형 루프**: 감정기법 버튼만 반복, 실행 회피 | 임상 | 감정기법 1회 90초 상한, 연속 2회 제한, 3회째는 “계획 축소(Adapt)” 강제. (SPEC E) 서버에서 연속 횟수 집계 후 응답에 adapt_required 플래그. |
| 3 | **통증/생리 신호 무시**: 사용자가 무리하게 100 모드 유지 | 임상 | pain>=7 → 최대 70, pain>=9 → 40 강제. period_status 반영. (SPEC F4, D) condition_score와 독립적으로 pain 안전 규칙 적용. |
| 4 | **Outcome 시각화**: 성과/보상/미래 자기 중심으로 현실 괴리·기대 과다 | 임상·도파민 | Coping Imagery 생성 시 “성과/보상/미래 자기” 키워드 필터링 + 자동 리라이트. “과정 70%+장애 20%+대처 10%” 강제 검증. (SPEC B2, D) |
| 5 | **완벽주의 트리거**: 100 모드 집착, 70/40을 “축소”로 인식 | 임상 | 70/40을 “성공 확률 레일”로 명명. 하향 시 고정 문구: “수면/피로/통증 신호로 인해 시작 성공률을 우선합니다.” (SPEC B1, D) |
| 6 | **질문 과다**: 체크인·저항 시 질문이 많아 회피 루프 유발 | 임상·입력 부담 | 체크인 질문 1~3개·선택지 5개 이하. 저항 이벤트 시 질문 최대 1개(선택지 5개 이하). (SPEC B3, F2) 스키마·비즈니스 로직에서 제한. |
| 7 | **Job 큐 장애/지연**: 시뮬·미디어 Job 실패 시 사용자 대기·불만 | 운영 | GET /jobs/{job_id}로 status(pending/completed/failed) 명확 반환. 실패 시 result에 error_code/message. 재시도·타임아웃 정책 명시. 모니터링·알림. |
| 8 | **모드 잔변경**: 하루에 모드가 자주 바뀌어 일관성 붕괴 | 운영·규칙 | 모드 전환 “하루 1회 기본 + 이벤트 기반 예외”만 허용. (SPEC B1) 서버에서 당일 전환 횟수 제한 또는 조건 검사. |
| 9 | **감정 강제 유도/진단 암시**: “진단/치료” 문구로 의료 행위 오인 | 임상 | 라벨은 “추정/신호”만. “진단/치료” 문구 금지. 위기 징후는 별도 안내(제품 안전 문구). (SPEC D) 상수·프롬프트·UI 문자열 검토. |
| 10 | **RAG 개인화가 사용자 정체성 규정**: 내러티브가 “너는 ~한 사람”으로 고정 | 임상 | RAG는 “선호/효과 있었던 행동”만 저장, 정체성/평가 문장 금지. 출력은 지시가 아니라 옵션. (SPEC D) 저장·출력 스키마와 정책에 반영. |

---

**문서 버전**: v1  
**기준**: SPEC.md 전제·B~F 섹션. 코드 미포함.
