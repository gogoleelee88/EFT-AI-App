# SPEC 누락 방지 계획서

**기준 문서**: SPEC.md (제안2 코어 + 최적 통합안)  
**목표**: 요구사항을 누락 없이 구현하기 위한 구현 전 계획서.  
**규칙**: SPEC에 없는 기능/필드는 추가하지 않음. 문구 근거로만 확장.

---

## A) 모듈 경계 6개 → 코드 구조 매핑 (파일 트리)

SPEC C1의 6개 서비스/모듈을 단일 FastAPI 모놀리스 내부 구조로 매핑한다.

```
backend/
├── main.py                          # FastAPI 앱, 라우터 등록, Job Queue 연결
├── config/
│   └── settings.py                  # (기존) + lock_sec=120, technique_duration_min/max 등
├── database.py                      # (기존) + 새 테이블 마이그레이션
│
├── spec_loop/                       # SPEC 루프 전용 패키지 (신규)
│   ├── __init__.py
│   │
│   ├── planner/                     # [모듈 1] Planner: Task → DayPlan 생성/수정(모드 반영)
│   │   ├── __init__.py
│   │   ├── service.py               # DayPlan 생성/갱신 로직, 모드 반영
│   │   ├── schemas.py               # DayPlan, PlanItem, Task 참조 스키마
│   │   └── router.py                # POST /plan/day
│   │
│   ├── simulator/                   # [모듈 2] Simulator: 과정 시뮬레이션 + Coping Imagery 프롬프트
│   │   ├── __init__.py
│   │   ├── service.py               # 텍스트 시뮬레이션, Coping 프롬프트 생성(규칙 강제)
│   │   ├── schemas.py               # SimulateDayRequest, CopingPromptResult
│   │   └── router.py                # POST /simulate/day → job_id 반환
│   │
│   ├── coach/                       # [모듈 3] Coach: 저항 이벤트 처리, 타이머, 2분 잠금, 마이크로 행동
│   │   ├── __init__.py
│   │   ├── service.py               # 저항 이벤트 기록, coach_action 계산(technique/duration_sec/lock_sec/micro_step)
│   │   ├── schemas.py               # ResistanceEvent, CoachAction, technique enum 등
│   │   └── router.py                # POST /resistance/event
│   │
│   ├── adapter/                     # [모듈 4] Adapter: Condition 변화 → 모드/계획 재구성
│   │   ├── __init__.py
│   │   ├── service.py               # Adaptation Actions(drop/shrink/delay/swap/split/protect/soothe)
│   │   ├── schemas.py               # AdaptRequest, AdaptResult, Condition 입력
│   │   └── router.py                # POST /adapt/day (내부/클라이언트 호출)
│   │
│   ├── scheduler/                   # [모듈 5] Scheduler: Job 큐/백그라운드 실행
│   │   ├── __init__.py
│   │   ├── queue.py                # Redis 또는 DB 기반 Job Queue (시뮬, 미디어, RAG 등)
│   │   ├── jobs.py                 # Job 등록/폴링/상태 업데이트
│   │   ├── schemas.py              # JobStatus, JobResult
│   │   └── router.py               # GET /jobs/{job_id}
│   │
│   ├── media/                       # [모듈 6] Media: 이미지/짧은 영상 생성(규칙 기반 최소) + 큐잉 + 저장
│   │   ├── __init__.py
│   │   ├── service.py              # 규칙 기반 최소 생성 + 큐 잡 등록
│   │   ├── schemas.py              # MediaJob, kind(img/vid), input_refs, output_url
│   │   └── (router는 scheduler에서 jobs/{job_id}로 통합 조회 가능)
│   │
│   ├── condition/                   # Condition 전용 (Adapter/Planner에서 사용)
│   │   ├── __init__.py
│   │   ├── service.py              # 체크인 저장, condition_score 계산, 모드 결정, pain 안전 규칙
│   │   ├── schemas.py              # Condition, min_condition_set, ConditionCheckinRequest
│   │   └── router.py               # POST /condition/checkin
│   │
│   ├── models/                      # 공통 데이터 모델(ORM/엔티티)
│   │   ├── __init__.py
│   │   ├── task.py                 # Task
│   │   ├── day_plan.py             # DayPlan
│   │   ├── condition.py            # Condition
│   │   ├── execution_log.py        # ExecutionLog
│   │   ├── resistance_event.py     # ResistanceEvent
│   │   └── media_job.py            # MediaJob
│   │
│   └── schemas/                     # 공통 Pydantic 스키마(API 입출력)
│       ├── __init__.py
│       ├── condition_json.py       # Condition JSON schema 대응
│       ├── resistance_event_json.py # ResistanceEvent JSON schema 대응
│       └── execution_log_json.py   # ExecutionLog JSON schema 대응
│
└── tests/
    ├── spec_loop/
    │   ├── test_planner.py
    │   ├── test_simulator.py
    │   ├── test_coach.py
    │   ├── test_adapter.py
    │   ├── test_scheduler.py
    │   ├── test_media.py
    │   ├── test_condition_score.py   # condition_score, 모드 결정, pain 안전 규칙
    │   ├── test_adaptation_actions.py # drop/shrink/delay/swap/split/protect/soothe
    │   ├── test_resistance_timer.py  # 30~90s, lock_sec=120, 질문 최소
    │   └── test_api_contracts.py     # API 6개 + Job 요청/응답 스키마
    └── ...
```

**모듈–파일 대응 요약**

| 모듈 | 역할 (SPEC C1) | 핵심 파일 |
|------|----------------|-----------|
| Planner | Task → DayPlan 생성/수정(모드 반영) | `spec_loop/planner/service.py`, `router.py` |
| Simulator | Plan 기반 과정 시뮬레이션 + Coping Imagery 프롬프트 | `spec_loop/simulator/service.py`, `router.py` |
| Coach | 저항 이벤트 처리(기법 타이머, 2분 잠금, 마이크로 행동) | `spec_loop/coach/service.py`, `router.py` |
| Adapter | Condition 변화 → 모드/계획 재구성 | `spec_loop/adapter/service.py`, `router.py` |
| Scheduler | Job 큐/백그라운드 실행 | `spec_loop/scheduler/queue.py`, `jobs.py`, `router.py` |
| Media | 이미지/짧은 영상 생성(규칙 기반 최소) + 큐잉 + 저장 | `spec_loop/media/service.py` |

---

## B) API 6개 + Job API 요청/응답 스키마 (예시 JSON)

SPEC C2 기준. 필드는 SPEC 및 E/F 섹션 JSON 스키마와 동일하게 제한.

### 1) POST /plan/day

**역할**: DayPlan 생성/갱신(모드 포함).

**요청 (Request)**

```json
{
  "date": "2026-02-10",
  "mode": 70,
  "items": [
    {
      "task_id": "task-uuid-1",
      "planned_block_minutes": 25,
      "micro_steps": ["문서 열기", "첫 줄 쓰기", "2분 집중"]
    }
  ]
}
```

**응답 (Response)**

```json
{
  "day_id": "day-uuid-1",
  "date": "2026-02-10",
  "mode": 70,
  "items": [
    {
      "task_id": "task-uuid-1",
      "planned_block_minutes": 25,
      "micro_steps": ["문서 열기", "첫 줄 쓰기", "2분 집중"]
    }
  ]
}
```

---

### 2) POST /simulate/day

**역할**: day_id 입력, 비동기 Job 반환.

**요청**

```json
{
  "day_id": "day-uuid-1"
}
```

**응답**

```json
{
  "job_id": "job-uuid-sim-1"
}
```

---

### 3) GET /jobs/{job_id}

**역할**: 시뮬/미디어 결과 조회.

**응답 (시뮬레이션 Job 완료 시)**

```json
{
  "job_id": "job-uuid-sim-1",
  "status": "completed",
  "kind": "simulation",
  "result": {
    "day_id": "day-uuid-1",
    "simulation_text": "과정 시뮬레이션 텍스트...",
    "coping_prompt": "과정 70% + 장애 20% + 대처 10% 준수 프롬프트"
  },
  "created_ts": "2026-02-10T09:00:00Z"
}
```

**응답 (미디어 Job 완료 시)**

```json
{
  "job_id": "job-uuid-media-1",
  "status": "completed",
  "kind": "media",
  "result": {
    "media_job_id": "media-uuid-1",
    "kind": "img",
    "output_url": "https://...",
    "input_refs": ["coping_prompt_id_1"]
  },
  "created_ts": "2026-02-10T09:00:00Z"
}
```

**응답 (진행 중)**

```json
{
  "job_id": "job-uuid-sim-1",
  "status": "pending",
  "kind": "simulation",
  "result": null,
  "created_ts": "2026-02-10T09:00:00Z"
}
```

---

### 4) POST /condition/checkin

**역할**: 컨디션 저장 + condition_score 계산.

**요청** (min_condition_set 필수, F2·F3 준수)

```json
{
  "date_time": "2026-02-10T08:00:00Z",
  "source_level": 0,
  "min_condition_set": {
    "sleep_hours": "H6_7",
    "fatigue": 3,
    "pain": 2,
    "mood": "ok",
    "period_status": "none"
  },
  "wearable": {},
  "behavior_inference": {}
}
```

**응답**

```json
{
  "condition_id": "cond-uuid-1",
  "ts": "2026-02-10T08:00:00Z",
  "source_level": 0,
  "condition_score": 72,
  "mode": 100,
  "inferred_flags": {}
}
```

(pain >= 7 / >= 9 시 mode는 안전 규칙 적용 후 값.)

---

### 5) POST /adapt/day

**역할**: condition 변화 반영(드롭/축소/스왑 등) 결과 반환.

**요청**

```json
{
  "day_id": "day-uuid-1",
  "condition_id": "cond-uuid-1",
  "condition_score": 45,
  "mode": 70
}
```

**응답**

```json
{
  "day_id": "day-uuid-1",
  "actions_applied": ["shrink", "protect"],
  "updated_plan": {
    "day_id": "day-uuid-1",
    "date": "2026-02-10",
    "mode": 70,
    "items": [
      {
        "task_id": "task-uuid-1",
        "planned_block_minutes": 15,
        "micro_steps": ["문서 열기", "첫 2분 착수"]
      }
    ],
    "protected_block_minutes": 10
  }
}
```

---

### 6) POST /resistance/event

**역할**: 저항 이벤트 기록 + 즉시 coach_action 반환(타이머 + 2분 행동).

**요청**

```json
{
  "day_id": "day-uuid-1",
  "task_id": "task-uuid-1",
  "trigger": "START_AVERSION",
  "intensity": 6,
  "context": {
    "mode": 70,
    "app_state": "ABOUT_TO_START"
  }
}
```

**응답** (SPEC B3, E ResistanceEvent schema: technique 30~90초, lock_sec=120)

```json
{
  "event_id": "res-uuid-1",
  "ts": "2026-02-10T10:00:00Z",
  "action": {
    "technique": "EFT_TIMER",
    "duration_sec": 60,
    "lock_sec": 120,
    "micro_step": "문서 열기"
  },
  "lock_applied": true
}
```

---

## C) 데이터 모델 6개 + ExecutionLog, ResistanceEvent, Condition JSON 스키마 ↔ DB 테이블 매핑

SPEC C3, E ResistanceEvent, ExecutionLog, F3 Condition JSON 스키마를 DB 테이블과 1:1 매핑.

### C1) Task (SPEC C3)

| 필드 | 타입 | 비고 |
|------|------|------|
| task_id | PK, string(UUID) | |
| title | string | |
| est_minutes | integer | |
| priority | integer | |
| tags | JSON/array | |
| energy_cost | integer (1-5) | |
| pain_sensitive | boolean | |
| requires_focus | boolean | |

**DB 테이블**: `tasks`

---

### C2) DayPlan (SPEC C3)

| 필드 | 타입 | 비고 |
|------|------|------|
| day_id | PK, string(UUID) | |
| date | date | |
| mode | integer (100/70/40) | |
| items | JSON array: [{ task_id, planned_block, micro_steps[] }] | |
| protected_block_minutes | integer (nullable) | protect 시 설정 |

**DB 테이블**: `day_plans`

---

### C3) Condition (F3 JSON schema)

| 필드 | 타입 | 비고 |
|------|------|------|
| condition_id | PK, string(UUID) | |
| ts | datetime | |
| source_level | integer (0/1/2) | |
| min_condition_set | JSON: { sleep_hours, fatigue, pain, mood, period_status? } | 필수 4개 + 옵션 |
| wearable | JSON (nullable) | sleep_minutes, resting_hr, hrv_ms |
| behavior_inference | JSON (nullable) | inferred, input_latency_sec, app_switch_count_30min, estimated_sleep_flag |
| condition_score | integer (0-100) | 서버 계산 저장 |
| inferred_flags | JSON | 추정 라벨용 |

**DB 테이블**: `conditions`

**min_condition_set JSON schema**:  
sleep_hours enum ["LT5","H5_6","H6_7","H7_8","GT8"], fatigue/pain 0-10, mood enum ["calm","ok","anxious","low","irritated"], period_status enum ["none","pre","on","post"].

---

### C4) ExecutionLog (SPEC C3 + E ExecutionLog schema)

| 필드 | 타입 | 비고 |
|------|------|------|
| log_id | PK, string(UUID) | |
| ts | datetime | |
| day_id | string(FK) | |
| task_id | string(FK, nullable) | |
| event_type | enum: TASK_START, TASK_STOP, TASK_RESUME, TASK_COMPLETE, PLAN_COMMIT, ADAPT_APPLIED | |
| duration_sec | integer (nullable, >=0) | |
| mode | integer (100/70/40, nullable) | |
| condition_ref | string(FK, nullable) | |
| resistance_event_ref | string(FK, nullable) | |
| metrics | JSON (nullable): { planned_minutes, executed_minutes, focus_quality } | |

**DB 테이블**: `execution_logs`

---

### C5) ResistanceEvent (SPEC C3 + E ResistanceEvent schema)

| 필드 | 타입 | 비고 |
|------|------|------|
| event_id | PK, string(UUID) | |
| ts | datetime | |
| day_id | string(FK) | |
| task_id | string(FK, nullable) | |
| trigger | enum: START_AVERSION, OVERWHELM, PERFECTIONISM, PAIN, FATIGUE, CONFLICT, UNKNOWN | |
| intensity | integer (0-10) | |
| context | JSON (nullable): { mode, app_state } | |
| action | JSON: { technique, duration_sec, lock_sec, micro_step } | technique enum, duration_sec 30-90, lock_sec=120 |
| chosen_technique | string | action.technique 저장 |
| lock_applied | boolean | |
| outcome | JSON (nullable): { started_within_5min, notes } | |

**DB 테이블**: `resistance_events`

---

### C6) MediaJob (SPEC C3)

| 필드 | 타입 | 비고 |
|------|------|------|
| media_job_id | PK, string(UUID) | |
| kind | enum: img, vid | |
| status | string (pending/completed/failed) | |
| input_refs | JSON array | |
| output_url | string (nullable) | |
| created_ts | datetime | |

**DB 테이블**: `media_jobs`

---

### Job 메타 테이블 (Scheduler)

| 필드 | 타입 | 비고 |
|------|------|------|
| job_id | PK, string(UUID) | |
| kind | enum: simulation, media, rag | |
| status | pending / completed / failed | |
| result | JSON (nullable) | 시뮬/미디어 결과 |
| created_ts | datetime | |

**DB 테이블**: `jobs`

---

## D) 요구사항 체크리스트 (최소 40항목) + 구현 위치

각 항목은 구현 시 **파일/함수/테스트**로 링크할 수 있도록 식별자와 예상 위치를 명시.

### B. 최적 통합안(코어 규칙)

| # | 요구사항 | SPEC 근거 | 구현 위치(파일/함수) | 테스트 위치 |
|---|----------|-----------|------------------------|-------------|
| 1 | 3모드(100/70/40) 전환 규칙: “능력 평가”가 아닌 “환경/컨디션에 맞춘 실행 레일” 문구/로직 | B1 | `condition/service.py` mode 결정 로직, `adapter/service.py` 모드 반영 | `test_condition_score.py` |
| 2 | 모드 하향 시 UI 문구 1줄: “수면/피로/통증 신호로 인해 시작 성공률을 우선합니다.” | B1 | `condition/schemas.py` 또는 응답 필드 `mode_reason` | `test_condition_score.py` |
| 3 | 전환은 하루 1회 기본 + 이벤트 기반 예외(저항 폭주/통증 급증)만 | B1 | `condition/service.py` 또는 planner 일 1회 제한 로직 | `test_condition_score.py`, `test_planner.py` |
| 4 | 100→70: 총부하(shrink) 중심 | B1 | `adapter/service.py` shrink 액션 | `test_adaptation_actions.py` |
| 5 | 70→40: 핵심 보호(protect) + 최소 착수(split) 중심 | B1 | `adapter/service.py` protect, split | `test_adaptation_actions.py` |
| 6 | 모드 상향(40→70, 70→100)은 “최근 3회 연속 START 성공” 등 행동 근거 있을 때만 | B1 | `condition/service.py` 또는 planner 상향 조건 | `test_condition_score.py` |
| 7 | Coping Imagery: Outcome(성과/미래 보상) 중심 시각화 금지, Process + Coping만 | B2 | `simulator/service.py` 프롬프트 생성 + 필터 | `test_simulator.py` |
| 8 | 강제 체크: “과정 70% + 장애 20% + 대처 10%” | B2 | `simulator/service.py` 비율 검증/리라이트 | `test_simulator.py` |
| 9 | 시각화 후 바로 2분 행동 잠금으로 연결 | B2, B3 | `coach/service.py` lock_sec=120, UI 연동 문서 | `test_resistance_timer.py` |
| 10 | 저항 이벤트 → (30~90초) 감정기법 → 즉시 2분 행동 잠금 | B3 | `coach/service.py` duration_sec 30-90, lock_sec=120 | `test_resistance_timer.py` |
| 11 | 감정기법 1회 90초 상한 | E | `coach/service.py` duration_sec max=90 | `test_resistance_timer.py` |
| 12 | 연속 2회 제한, 3회째는 “계획 축소(Adapt)” 강제 | E | `coach/service.py` 연속 횟수 + Adapt 호출/플래그 | `test_coach.py` |
| 13 | 2분 행동 잠금: 2분 동안 “다음 한 동작”만 보여줌(스크롤/탐색 제한) | B3 | `coach/schemas.py` lock_sec=120, 클라이언트 규약 문서 | `test_api_contracts.py` |
| 14 | 질문 최소 원칙: 저항 이벤트 시 질문 최대 1개(선택지 5개 이하) | B3 | `coach/service.py` 또는 스키마 제한 | `test_resistance_timer.py` |
| 15 | 체크인 UX: 질문 1~3개, 선택지 5개 이하 | F2 | `condition/schemas.py` min_condition_set | `test_api_contracts.py` |

### C. 아키텍처·API

| # | 요구사항 | SPEC 근거 | 구현 위치 | 테스트 위치 |
|---|----------|-----------|-----------|-------------|
| 16 | POST /plan/day → DayPlan 생성/갱신(모드 포함) | C2 | `planner/router.py`, `planner/service.py` | `test_planner.py`, `test_api_contracts.py` |
| 17 | POST /simulate/day → {day_id} 입력, 비동기 {job_id} 반환 | C2 | `simulator/router.py`, `scheduler/queue.py` | `test_simulator.py`, `test_api_contracts.py` |
| 18 | GET /jobs/{job_id} → 시뮬/미디어 결과 조회 | C2 | `scheduler/router.py` | `test_api_contracts.py` |
| 19 | POST /condition/checkin → 컨디션 저장 + condition_score 계산 | C2 | `condition/router.py`, `condition/service.py` | `test_condition_score.py` |
| 20 | POST /adapt/day → condition 변화 반영, 결과 반환 | C2 | `adapter/router.py`, `adapter/service.py` | `test_adaptation_actions.py`, `test_api_contracts.py` |
| 21 | POST /resistance/event → 저항 이벤트 기록 + coach_action 반환 | C2 | `coach/router.py`, `coach/service.py` | `test_coach.py`, `test_api_contracts.py` |

### F. Condition & Adaptation

| # | 요구사항 | SPEC 근거 | 구현 위치 | 테스트 위치 |
|---|----------|-----------|-----------|-------------|
| 22 | min_condition_set 필수: sleep_hours, fatigue, pain, mood; period_status 옵션 | F2, F3 | `condition/schemas.py`, `models/condition.py` | `test_condition_score.py` |
| 23 | source_level 0/1/2 | F1, F3 | `condition/schemas.py` | `test_api_contracts.py` |
| 24 | condition_score 계산: 시작 100, 수면 패널티(LT5:-25, H5_6:-15, H6_7:-8, H7_8:0, GT8:0) | F4 | `condition/service.py` | `test_condition_score.py` |
| 25 | condition_score: 피로 - (fatigue*4), 통증 - (pain*6), 기분(calm:0, ok:-5, anxious:-15, low:-20, irritated:-15) | F4 | `condition/service.py` | `test_condition_score.py` |
| 26 | condition_score: 생리 on:-8, pre:-5, post:0, none:0 | F4 | `condition/service.py` | `test_condition_score.py` |
| 27 | (선택) Level1/2 보정: input_latency_sec>120 & inferred → -5; app_switch_count_30min>15 & inferred → -5 | F4 | `condition/service.py` | `test_condition_score.py` |
| 28 | 모드 결정: score>=70→100, 40<=score<70→70, score<40→40 | F4 | `condition/service.py` | `test_condition_score.py` |
| 29 | pain >= 7이면 score와 무관하게 최대 70 | F4 | `condition/service.py` | `test_condition_score.py` |
| 30 | pain >= 9이면 40 강제 | F4 | `condition/service.py` | `test_condition_score.py` |
| 31 | Adaptation drop: 비핵심 Task 제거(priority 낮고 energy_cost 높은 항목) | F5 | `adapter/service.py` | `test_adaptation_actions.py` |
| 32 | Adaptation shrink: planned_block 재계산 + micro_step 재생성 | F5 | `adapter/service.py` | `test_adaptation_actions.py` |
| 33 | Adaptation delay: 오늘→내일/다음 슬롯 이월, Scheduler 연동 | F5 | `adapter/service.py`, `scheduler` | `test_adaptation_actions.py` |
| 34 | Adaptation swap: energy_cost 기준 순서 재배열 | F5 | `adapter/service.py` | `test_adaptation_actions.py` |
| 35 | Adaptation split: 1 Task → 2~3 micro_step, “첫 2분 착수” 포함 | F5 | `adapter/service.py` | `test_adaptation_actions.py` |
| 36 | Adaptation protect: 최소 1개 핵심 유지 + 방어 슬롯(protected_block), 다른 작업 침범 불가 | F5 | `adapter/service.py`, `models/day_plan.py` | `test_adaptation_actions.py` |
| 37 | Adaptation soothe: 컨디션 저하 시 Coping Imagery 짧게/중립, “자극도↓, 기대 문장 금지, 과정 묘사만” | F5 | `simulator/service.py` 플래그 | `test_simulator.py` |

### 데이터 모델·스키마

| # | 요구사항 | SPEC 근거 | 구현 위치 | 테스트 위치 |
|---|----------|-----------|-----------|-------------|
| 38 | Task: task_id, title, est_minutes, priority, tags, energy_cost(1-5), pain_sensitive, requires_focus | C3 | `spec_loop/models/task.py` | `test_api_contracts.py` |
| 39 | DayPlan: day_id, date, mode(100/70/40), items[{task_id, planned_block, micro_steps[]}] | C3 | `spec_loop/models/day_plan.py` | `test_api_contracts.py` |
| 40 | ExecutionLog: log_id, task_id, day_id, event_type(START/STOP/COMPLETE/RESUME/PLAN_COMMIT/ADAPT_APPLIED), ts, context 등 | C3, E | `spec_loop/models/execution_log.py`, `schemas/execution_log_json.py` | `test_api_contracts.py` |
| 41 | ResistanceEvent: event_id, day_id, ts, trigger, intensity, chosen_technique, lock_applied; action.{technique, duration_sec 30-90, lock_sec=120, micro_step} | C3, E | `spec_loop/models/resistance_event.py`, `schemas/resistance_event_json.py` | `test_resistance_timer.py`, `test_api_contracts.py` |
| 42 | MediaJob: media_job_id, kind(img/vid), status, input_refs, output_url, created_ts | C3 | `spec_loop/models/media_job.py` | `test_api_contracts.py` |
| 43 | Condition JSON 스키마: condition_id, ts, source_level, min_condition_set, wearable, behavior_inference | F3 | `spec_loop/schemas/condition_json.py` | `test_condition_score.py` |
| 44 | technique enum: EFT_TIMER, HOOPONO_TIMER, BREATH_60, BODY_SCAN_60, LABEL_30 | E | `coach/schemas.py` | `test_coach.py` |
| 45 | trigger enum: START_AVERSION, OVERWHELM, PERFECTIONISM, PAIN, FATIGUE, CONFLICT, UNKNOWN | E | `coach/schemas.py` | `test_api_contracts.py` |

### 임상·안전 (D)

| # | 요구사항 | SPEC 근거 | 구현 위치 | 테스트 위치 |
|---|----------|-----------|-----------|-------------|
| 46 | Outcome 시각화 키워드 필터링 + 리라이트(과정 중심) | D | `simulator/service.py` | `test_simulator.py` |
| 47 | 라벨 “추정/신호”만, “진단/치료” 금지 | D | NL/프롬프트 및 상수 문자열 | `test_simulator.py` / 문서 |

---

**총 47항목.** 구현 시 각 항목을 위 표의 “구현 위치” 및 “테스트 위치”에 맞춰 연결하고, SPEC 준수 리포트에서 PASS/FAIL + 코드 위치(파일:함수 또는 라인)로 기입한다.

---

## 검증 가능 로직 정리 (구현 시 필수)

다음은 **단위/통합 테스트로 검증 가능**하게 구현한다.

1. **condition_score**: 수식 그대로 구현 후 고정 fixture로 점수·모드 검증.
2. **모드 결정**: 70/40/100 구간 + pain>=7 → max 70, pain>=9 → 40 강제 테스트.
3. **Pain 안전 규칙**: pain 7, 9 입력 시 모드 제한 검증.
4. **Adaptation Actions**: drop/shrink/delay/swap/split/protect/soothe 각각 입력→DayPlan/출력 변경 검증.
5. **저항 이벤트 타이머**: duration_sec 30~90, lock_sec=120 검증(스키마 + 서비스).
6. **lock_sec=120**: 상수 및 응답 action.lock_sec 검증.
7. **질문 최소 원칙**: 체크인 1~3문항·선택지 5개 이하, 저항 시 질문 최대 1개(스키마/규칙).

---

## 다음 단계

1. 이 계획서에 대한 **승인**을 받는다.  
2. 승인 후 **코드 작성**: FastAPI + Pydantic + SQLAlchemy(또는 SQLModel), `tests/spec_loop/`에 pytest 추가.  
3. 구현 완료 후 **SPEC 준수 리포트** 작성: 위 체크리스트별 PASS/FAIL 및 근거(코드 위치) 제시.
