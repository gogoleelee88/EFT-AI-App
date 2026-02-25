# SPEC 구현 계획서 (결정사항 반영)

**기준**: SPEC.md + SPEC_PLAN_V1_GAP_ANALYSIS.md + 사용자 결정사항 정리  
**목표**: 누락 없이 구현, 결정사항 1~5 및 충돌 우선순위 반영.  
**본 단계**: 구현 계획만 작성(코드 작성 금지). 계획 승인 후 코드·테스트·리포트 순서로 진행.

---

## 1. 파일 트리 (backend 기준)

```
backend/
├── main.py                          # spec_loop 라우터 등록, get_db 연동
├── config/
│   └── settings.py                  # (기존) + LOCK_SEC=120, TECHNIQUE_DURATION_MIN/MAX 등
├── database.py                      # (기존) Base, get_db + spec_loop 모델 import
│
├── spec_loop/
│   ├── __init__.py
│   │
│   ├── planner/
│   │   ├── __init__.py
│   │   ├── service.py               # create_or_update_day_plan, 모드 반영
│   │   ├── schemas.py               # DayPlanRequest/Response, PlanItem
│   │   └── router.py                # POST /plan/day
│   │
│   ├── simulator/
│   │   ├── __init__.py
│   │   ├── service.py               # 과정 시뮬레이션, Coping 프롬프트(70/20/10, Outcome 금지, 리라이트)
│   │   ├── schemas.py               # SimulateDayRequest, CopingPromptResult
│   │   └── router.py                # POST /simulate/day → job_id
│   │
│   ├── coach/
│   │   ├── __init__.py
│   │   ├── service.py               # 저항 이벤트 기록, coach_action(30~90s, lock_sec=120), 연속 2회/3회째 adapt
│   │   ├── schemas.py               # ResistanceEventRequest/Response, CoachAction, technique/trigger enum
│   │   └── router.py                # POST /resistance/event
│   │
│   ├── adapter/
│   │   ├── __init__.py
│   │   ├── service.py               # apply_adaptation(day_id, condition_id), drop/shrink/delay/swap/split/protect/soothe
│   │   ├── schemas.py               # AdaptRequest, AdaptResult
│   │   └── router.py                # POST /adapt/day (클라이언트/내부 호출용)
│   │
│   ├── scheduler/
│   │   ├── __init__.py
│   │   ├── queue.py                 # DB 기반 Job 큐: enqueue, poll, set_status/result (Redis 미사용)
│   │   ├── jobs.py                  # 워커: pending job 폴링 → 시뮬/미디어 실행 → result 저장
│   │   ├── schemas.py               # JobStatus, JobResult
│   │   └── router.py                # GET /jobs/{job_id}
│   │
│   ├── media/
│   │   ├── __init__.py
│   │   ├── service.py               # 규칙 기반 최소 이미지/영상 생성 + job 등록
│   │   └── schemas.py               # MediaJobInput (결과는 GET /jobs 통합)
│   │
│   ├── condition/
│   │   ├── __init__.py
│   │   ├── service.py               # 체크인 저장, condition_score, 모드 결정(pain override 우선), 이벤트 예외 판단, 필요 시 apply_adaptation 내부 호출
│   │   ├── schemas.py               # CheckinRequest(condition_id 없음, day_id 필수), CheckinResponse(condition_id, ts, adapt_applied, updated_day_plan 등)
│   │   └── router.py                # POST /condition/checkin (요청에 day_id 포함)
│   │
│   ├── mode_change/
│   │   ├── __init__.py
│   │   ├── service.py               # 당일 모드 전환 횟수 조회/기록, 1회 초과 시 409 또는 다음 날 예약 정책
│   │   └── schemas.py               # (내부용)
│   │
│   ├── models/                      # SQLAlchemy ORM
│   │   ├── __init__.py
│   │   ├── task.py
│   │   ├── day_plan.py
│   │   ├── condition.py
│   │   ├── execution_log.py         # event_type: TASK_START, TASK_STOP, TASK_RESUME, TASK_COMPLETE, PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE, LOCK_APPLIED, LOCK_EXPIRED 등
│   │   ├── resistance_event.py
│   │   ├── media_job.py
│   │   └── job.py                   # DB 기반 job 테이블 (Scheduler)
│   │
│   └── validation/                  # JSON schema / Pydantic 저장용 검증
│       ├── __init__.py
│       ├── condition_schema.py      # 저장/응답용 Condition (condition_id, ts 포함)
│       ├── resistance_event_schema.py
│       └── execution_log_schema.py
│
└── tests/
    └── spec_loop/
        ├── conftest.py              # db session, fixtures (tasks, day_plans, conditions)
        ├── test_planner.py
        ├── test_simulator.py
        ├── test_coach.py
        ├── test_adapter.py
        ├── test_scheduler.py
        ├── test_condition_score.py  # condition_score, 모드 구간, pain override
        ├── test_adaptation_actions.py
        ├── test_resistance_timer.py # 30~90s, lock_sec=120, 연속 2/3회
        ├── test_mode_change.py      # 하루 1회 전환, 409/정책
        ├── test_event_exceptions.py # 통증 급증, 저항 폭주, 중단/불가
        └── test_api_contracts.py
```

---

## 2. 모듈 책임 요약

| 모듈 | 경로 | 책임 |
|------|------|------|
| Planner | spec_loop/planner/ | Task → DayPlan 생성/수정(모드 반영). |
| Simulator | spec_loop/simulator/ | Plan 기반 과정 시뮬레이션(텍스트) + Coping Imagery 프롬프트(Outcome 금지, 70/20/10, 리라이트). |
| Coach | spec_loop/coach/ | 저항 이벤트 기록, 기법 30~90초·lock_sec=120, 연속 2회 제한·3회째 Adapt 강제, coach_action 반환. |
| Adapter | spec_loop/adapter/ | Condition 변화 → 모드/계획 재구성. drop/shrink/delay/swap/split/protect/soothe. delay 시 Scheduler에 알림 재설정 위임. |
| Scheduler | spec_loop/scheduler/ | **DB 기반** Job 테이블 + 폴링 워커. 시뮬/미디어 Job 실행, status/result 갱신. Redis 미사용. |
| Media | spec_loop/media/ | 규칙 기반 최소 이미지/영상 생성 + Job 등록. |
| Condition | spec_loop/condition/ | 체크인 저장(min_condition_set만 검증, 30초 미검증), condition_score·모드(pain override 우선), **필요 시 내부 apply_adaptation 호출**, 응답에 adapt_applied·updated_day_plan 포함. |
| ModeChange | spec_loop/mode_change/ | 당일 모드 전환 횟수 저장/조회, 1회 초과 시 409 또는 다음 날 예약(정책 명시). |

---

## 3. DB 테이블·컬럼·인덱스

- **tasks**: task_id(PK), title, est_minutes, priority, tags(JSONB), energy_cost(1-5), pain_sensitive, requires_focus, created_at.  
  인덱스: tasks_pkey(task_id).

- **day_plans**: day_id(PK), **user_id**(FK, nullable 또는 요구 시), date, mode(100/70/40), items(JSONB), protected_block_minutes, created_at, updated_at. **정책: 1 user + 1 date = 1 DayPlan.** **UNIQUE(user_id, date).**  
  인덱스: day_plans_pkey(day_id), ix_day_plans_date(date), uq_day_plans_user_date(user_id, date).  
  (PM 결정 3)

- **conditions**: condition_id(PK), ts, source_level(0/1/2), min_condition_set(JSONB), wearable(JSONB), behavior_inference(JSONB), condition_score, inferred_flags(JSONB).  
  인덱스: conditions_pkey(condition_id), ix_conditions_ts(ts).  
  (요청에는 condition_id 없음; 저장/응답에만 사용 — 결정사항·충돌 해결 반영)

- **execution_logs**: log_id(PK), ts, day_id(FK), task_id(FK nullable), event_type(VARCHAR), duration_sec, mode, condition_ref, resistance_event_ref, metrics(JSONB), context(JSONB).  
  **event_type enum 변경 없음**(RESISTANCE_TECHNIQUE_END 미추가). TASK_START, TASK_STOP, TASK_RESUME, TASK_COMPLETE, PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE, LOCK_APPLIED, LOCK_EXPIRED 등.  
  **TTFS 분모**: PLAN_COMMIT 시각; 없으면 fallback day_plans.created_at. TTFS = first TASK_START ts − (PLAN_COMMIT.ts or created_at). (PM 결정 2, 4)  
  인덱스: execution_logs_pkey(log_id), ix_execution_logs_day_ts(day_id, ts), ix_execution_logs_event_type(event_type).

- **mode_changes**: id(PK), day_id(FK), from_mode, to_mode, ts, reason(VARCHAR, optional). **date 컬럼 없음 또는 day_plans.date와 동일(파생).** mode_changes는 항상 day_id 귀속. 당일 전환 횟수 = 해당 day_id(당일)의 mode_changes COUNT.  
  인덱스: mode_changes_pkey(id), ix_mode_changes_day_id(day_id).  
  (PM 결정 3)

- **resistance_events**: event_id(PK), ts, day_id(FK), task_id(FK nullable), trigger, intensity(0-10), context(JSONB), action(JSONB), **technique_end_ts**(TIMESTAMPTZ, ts + duration_sec로 서버 계산 가능), chosen_technique, lock_applied, outcome(JSONB).  
  5분 내 START율 = technique_end_ts 기준 5분 이내 TASK_START 존재 여부. (선택) kpi_events 테이블에 RESISTANCE_TECHNIQUE_END 별도 기록. (PM 결정 2)  
  인덱스: resistance_events_pkey(event_id), ix_resistance_events_day_ts(day_id, ts).

- **media_jobs**: media_job_id(PK), kind(img/vid), status, input_refs(JSONB), output_url, created_ts.  
  인덱스: media_jobs_pkey(media_job_id).

- **jobs**: job_id(PK), kind(simulation|media|rag), status(pending|completed|failed), result(JSONB), created_ts, updated_ts.  
  인덱스: jobs_pkey(job_id), ix_jobs_status_created(status, created_ts).  
  (결정 5: DB 기반, Redis 미사용)

---

## 4. 엔드포인트 계약 (요청/응답/에러)

### 4.1 POST /plan/day

- 요청: date, mode(100|70|40), items[{ task_id, planned_block_minutes, micro_steps[] }].
- 응답 200: day_id, date, mode, items.
- 에러: 400(비즈니스 규칙), 404(task_id 없음), 422(검증 실패).

### 4.2 POST /simulate/day

- 요청: day_id.
- 응답 202: job_id.
- 에러: 400/404(day_id), 422.

### 4.3 GET /jobs/{job_id}

- 응답 200: job_id, status(pending|completed|failed), kind, result, created_ts.
- 에러: 404.

### 4.4 POST /condition/checkin (결정 1 반영)

- 요청: **condition_id 없음.** date_time(또는 ts), source_level, min_condition_set(sleep_hours, fatigue, pain, mood; period_status 선택), wearable, behavior_inference.  
  (30초는 UX 목표만, 백엔드는 min_condition_set·스키마만 검증 — 결정 4)
- 응답 200:  
  **condition_id**, **ts**, source_level, **condition_score**, **final_mode**, inferred_flags,  
  **adapt_applied**(bool), **updated_day_plan**(object | null, 있으면 내부 adapt 결과).
- 에러: 400/422.

### 4.5 POST /adapt/day

- 요청: day_id, condition_id, condition_score, mode.
- 응답 200: day_id, actions_applied[], updated_plan(protected_block_minutes 포함).
- 에러: 400/404/422.

### 4.6 POST /resistance/event

- 요청: day_id, task_id(optional), trigger, intensity(0-10), context(optional).
- 응답 200: event_id, ts, action{ technique, duration_sec(30-90), lock_sec(120), micro_step }, lock_applied.  
  연속 3회 시 adapt_required 플래그 등 클라이언트 안내 가능.
- 에러: 400(예: 저항 폭주 시 Adapt 강제 안내), 404, 422.

### 4.7 모드 전환 1회 초과 (결정 2, PM 결정 1)

- **기본**: 당일 2회째 전환 요청 시 **409 Conflict (MODE_CHANGE_LIMIT)**.
- **예외**: **보호 목적 하향**만 2회째 허용(통증 급증/pain override, 저항 폭주 등).
- **상향 전환은 당일 2회째 절대 금지**(다음 날 조건으로만 반영).
※ 4.7에 “**409 Conflict** 또는 …” 로 시작하는 레거시 문구 한 줄이 있으면 수동 삭제.
  **409 Conflict** 또는 **“다음 날 예약”** 처리. 정책은 코드/설정에 명시(예: 409로 거부).

---

## 5. 결정사항 1~5 반영 매핑표

| 결정 | 요약 | 반영 위치 (파일/기능·테이블) |
|------|------|-----------------------------|
| **1** | checkin 이후 Adapt는 **서버가 필요 시 내부 호출**. 응답에 condition_score, final_mode, adapt_applied, updated_day_plan 포함. | `condition/service.py`: checkin 핸들러에서 score/mode/pain override 계산 → adapt 필요 조건이면 `adapter.service.apply_adaptation(day_id, condition_id)` 내부 호출. `condition/router.py`: 응답 스키마에 `adapt_applied`, `updated_day_plan` 포함. `condition/schemas.py`: CheckinResponse. |
| **2** | ‘하루 1회’ = **모드 전환 횟수** (자동/수동 포함). **기본: 2회째 409 (MODE_CHANGE_LIMIT). 예외: 보호 목적 하향만 2회째 허용. 상향 2회째 당일 절대 금지.** (PM 결정 1) | `mode_change/service.py`: 당일 date 기준 전환 횟수 조회/기록. `mode_change` 또는 `execution_logs`(event_type=MODE_CHANGE) 활용. `condition/service.py`(자동 전환 시), `planner`(수동 전환 시)에서 전환 전 확인. 에러 409 또는 정책 상 “다음 날 예약” 처리 로직(코드에 주석/상수로 정책 명시). |
| **3** | 이벤트 기반 예외: 통증 급증(pain>=9→40, pain>=7→max70, pain_delta>=+2/2h→max70), 저항 폭주(≥3/60min 또는 ≥2/15min→Adapt+모드 하향), 중단/불가→protect+split. **모드 상향은 예외로도 기본 금지**, 다음 날 조건으로만. | `condition/service.py`: pain override 우선 적용; pain_delta(2h 내 이전 condition 대비) 계산 시 max70. `coach/service.py`: 저항 이벤트 수 집계(60min/15min 윈도우) → 조건 충족 시 adapt 강제·모드 하향 제안. Adapter: 사용자 ‘중단/불가’ 플래그 시 protect+split. `mode_change/service.py`: 상향 요청은 당일 허용하지 않음(또는 예외 목록에 없음). |
| **4** | ‘30초 체크인’은 **UX 목표**. 백엔드는 30초 검증/실패 처리 안 함. **min_condition_set만 검증.** | `condition/schemas.py`: CheckinRequest는 min_condition_set 필수만. 30초 관련 필드/검증 없음. `condition/router.py`: 완료 시간 검사 없음. |
| **5** | Job Queue 1차: **DB 기반 job 테이블 + 폴링 워커**. Redis 미사용. | `spec_loop/models/job.py`: Job 테이블. `scheduler/queue.py`: enqueue/poll/set_result 모두 DB. `scheduler/jobs.py`: pending 폴링 워커. `simulator/router.py`: POST /simulate/day → job_id 반환. `scheduler/router.py`: GET /jobs/{job_id} → status/result. |

---

## 6. 충돌 우선순위 반영 (구현 순서)

1. **Pain override 우선**: condition/service 모드 결정 시 pain>=9 → 40, pain>=7 → max 70 먼저 적용 후 score 구간 적용.
2. **하루 1회 > 상향 조건**: 당일 모드 전환 1회 초과 시 409(또는 정책). “3회 연속 START”는 다음 날 상향 허용 조건으로만 사용.
3. **Condition 요청/저장 스키마 분리**: CheckinRequest에 condition_id 없음. 저장·CheckinResponse에만 condition_id, ts 포함. validation은 저장/응답용 스키마에만 F3 전체 적용.

---

## 7. 테스트 플랜 (pytest)

- **test_condition_score.py**: condition_score 수식(수면/피로/통증/기분/생리, Level1·2 보정), 모드 구간(70/40/100), **pain override**(pain>=9→40, pain>=7→max70, pain_delta>=+2/2h→max70).
- **test_mode_change.py**: 당일 1회 전환 허용, **2회째 409 (MODE_CHANGE_LIMIT)**, **보호 목적 하향만 2회째 허용**, **상향 2회째 당일 금지**. mode_changes day_id 귀속. (PM 결정 1, 3)
- **test_resistance_timer.py**: technique_end_ts 저장·5분 내 START율 산출(technique_end_ts 기준). (PM 결정 2)
- **test_api_contracts.py**: TTFS = first TASK_START − (PLAN_COMMIT or created_at). day_plans UNIQUE(user_id, date). execution_log event_type enum 변경 없음. (PM 결정 3, 4, 2)
- **test_event_exceptions.py**: 저항 폭주(3/60min, 2/15min) 시 Adapt 강제·모드 하향; 통증 급증 시 보호 규칙; (선택) 중단/불가 → protect+split.
- **test_resistance_timer.py**: duration_sec 30~90, lock_sec=120 const, 연속 2회 제한·3회째 adapt_required.
- **test_adaptation_actions.py**: drop/shrink/delay/swap/split/protect/soothe 각각 동작, protect 시 protected_block, delay 시 Scheduler 연동(또는 플래그).
- **test_simulator.py**: Coping Imagery Outcome 금지, 70/20/10 비율, 키워드 필터·리라이트.
- **test_planner.py**: DayPlan CRUD, 모드 반영.
- **test_coach.py**: POST /resistance/event 응답 구조, technique/trigger enum.
- **test_scheduler.py**: Job DB enqueue, GET /jobs status·result, 워커 폴링(가능 시).
- **test_api_contracts.py**: 6개 API 요청/응답 스키마, 409(모드 전환 초과), 422.

---

## 8. 구현 순서 제안

1. DB 모델·마이그레이션(jobs, mode_changes, execution_logs event_type 확장 포함).  
2. Condition: 스키마(요청/응답 분리), condition_score·모드(pain override)·이벤트 예외 판단, **내부 apply_adaptation 호출**·응답 필드.  
3. ModeChange: 전환 횟수·409 정책.  
4. Adapter: apply_adaptation, 7종 액션.  
5. Planner: POST /plan/day.  
6. Coach: 저항 이벤트·연속 제한·lock_sec.  
7. Scheduler: DB Job 큐·폴링 워커·GET /jobs.  
8. Simulator: POST /simulate/day, Coping 규칙.  
9. Media: Job 등록(최소).  
10. main.py에 라우터 등록.  
11. pytest 핵심 규칙(경계값, pain override, 저항 폭주, 하루 1회) 실행.  
12. SPEC 준수 리포트(PASS/FAIL + 코드 위치) 작성.

---

## 9. PM 결정사항(모호 5개 답변) 반영

| # | 결정 | 반영 위치 |
|---|------|-----------|
| 1 | 당일 2회째: 기본 409 (MODE_CHANGE_LIMIT). 예외=보호 목적 하향만. 상향 2회째 당일 금지. | §3 mode_changes, §4.7, §5 결정 2, §7 test_mode_change |
| 2 | ExecutionLog event_type enum 변경 안 함. ResistanceEvent technique_end_ts. 5분 내 START = technique_end_ts 기준 5분 내 TASK_START. (선택) kpi_events | §3 execution_logs·resistance_events, §7 test_resistance_timer |
| 3 | 1 user + 1 date = 1 DayPlan. UNIQUE(user_id, date). mode_changes day_id 귀속, date 없거나 day_plans.date와 동일 | §3 day_plans·mode_changes, §7 test_api_contracts |
| 4 | TTFS 분모 = PLAN_COMMIT; fallback created_at. TTFS = first TASK_START − (PLAN_COMMIT or created_at) | §3 execution_logs 주, §7 test_api_contracts |
| 5 | RAG: 정책 문서에 저장=행동/전술만, 출력=옵션만. **v1: RAG OFF 또는 stub**, 정책+인터페이스만. 내러티브 생성 금지. | docs 정책 문서, RAG 인터페이스(stub) |

---

**문서 버전**: 2 (PM 결정 5개 반영)  
**다음 단계**: 계획 승인 후 코드 작성 → pytest → SPEC 준수 리포트.
