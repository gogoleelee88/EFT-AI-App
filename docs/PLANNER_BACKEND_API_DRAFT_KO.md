# Planner 백엔드 API 초안

## 1. 목표

planner를 웹 전용 기능 조합이 아니라 서버 공통 도메인으로 승격한다.

이 초안의 목표는 다음과 같다.

- 기존 `day_plans`와 `reminder_jobs`를 버리지 않는다.
- planner aggregate를 source of truth로 추가한다.
- 기존 `/api/spec/plan/day-with-mission`은 호환 adapter로 유지한다.
- optimistic concurrency, idempotency, projection write를 공식 계약에 포함한다.

현재 재사용 가능한 축:

- `backend/spec_loop/planner/schemas.py:165`
- `backend/spec_loop/planner/schemas.py:166`
- `backend/spec_loop/planner/service.py:197`
- `backend/spec_loop/planner/service.py:205`
- `backend/spec_loop/planner/service.py:380`

## 2. 저장 모델

## 2.1 권장 모델

신규 테이블:

- `planner_workspaces`
- `planner_mutation_log`
- `planner_projection_jobs`

기존 projection:

- `day_plans`
- `reminder_jobs`

## 2.2 planner_workspaces

```sql
CREATE TABLE planner_workspaces (
  workspace_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Seoul',
  active_date DATE NOT NULL,
  snapshot JSON NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);
```

초기 버전에서는 `user_id`당 활성 workspace 하나를 권장한다. 이후 multi-workspace가 필요하면 `workspace_type` 또는 `scope_key`를 추가한다.

## 2.3 snapshot 구조

```json
{
  "workspaceId": "pw_01H...",
  "userId": "user_123",
  "timezone": "Asia/Seoul",
  "activeDate": "2026-03-12",
  "deadlines": [],
  "goalItems": [],
  "assignments": [],
  "alarmPolicies": [],
  "executionStates": [],
  "version": 7,
  "updatedAt": "2026-03-12T09:00:00Z"
}
```

## 3. 도메인 객체 계약

## 3.1 Deadline

```json
{
  "deadlineId": "dl_01",
  "title": "토익 제출",
  "startDate": "2026-03-12",
  "deadlineDate": "2026-03-24",
  "totalMinutes": 480,
  "status": "ACTIVE",
  "goalItemIds": ["gi_01", "gi_02"],
  "updatedAt": "2026-03-12T09:00:00Z"
}
```

## 3.2 GoalItem

```json
{
  "goalItemId": "gi_01",
  "deadlineId": "dl_01",
  "title": "모의고사 1회",
  "estMinutes": 120,
  "order": 1,
  "source": "manual",
  "status": "OPEN",
  "completedAt": null,
  "updatedAt": "2026-03-12T09:00:00Z"
}
```

## 3.3 DailyAssignment

```json
{
  "assignmentId": "da_01",
  "date": "2026-03-12",
  "goalItemIds": ["gi_01"],
  "plannedMinutes": 120,
  "status": "PLANNED",
  "updatedAt": "2026-03-12T09:00:00Z"
}
```

## 3.4 AlarmPolicy

```json
{
  "alarmPolicyId": "ap_01",
  "assignmentId": "da_01",
  "startTime": "19:00",
  "endTime": "21:00",
  "endsNextDay": false,
  "repeat": "daily",
  "customDays": [],
  "sourceType": "service",
  "privacyMode": "NORMAL",
  "updatedAt": "2026-03-12T09:00:00Z"
}
```

## 3.5 ExecutionState

```json
{
  "executionStateId": "es_01",
  "assignmentId": "da_01",
  "startedAt": null,
  "completedGoalItemIds": [],
  "carryOverGoalItemIds": [],
  "status": "IDLE",
  "updatedAt": "2026-03-12T09:00:00Z"
}
```

## 4. API 표면

## 4.1 조회 API

### GET `/api/spec/planner/workspace`

query:

- `active_date=YYYY-MM-DD`

response:

```json
{
  "workspace": {},
  "version": 7,
  "serverTime": "2026-03-12T09:00:00Z"
}
```

설명:

- 기본 진입점
- 웹 `/planner`와 앱 `Plan` 탭이 공통 사용
- 앱 `Calendar`도 같은 endpoint를 읽되 projection 응답을 함께 활용할 수 있다

### GET `/api/spec/planner/workspace/projections/today`

response:

```json
{
  "activeDate": "2026-03-12",
  "assignments": [],
  "alarmPolicies": [],
  "executionStates": [],
  "dayPlanProjection": {},
  "reminderProjection": []
}
```

설명:

- Android `Calendar` 최적화용
- 전체 snapshot이 아니라 today projection만 반환

## 4.2 mutation API

모든 write는 아래 공통 envelope를 가진다.

```json
{
  "clientRequestId": "uuid",
  "deviceId": "web-chrome-123",
  "expectedVersion": 7,
  "mutation": {}
}
```

### POST `/api/spec/planner/mutations/create-deadline`

```json
{
  "clientRequestId": "uuid",
  "deviceId": "web",
  "expectedVersion": 7,
  "mutation": {
    "title": "토익 제출",
    "startDate": "2026-03-12",
    "deadlineDate": "2026-03-24",
    "totalMinutes": 480,
    "checklist": [
      { "title": "모의고사 1회", "estMinutes": 120 },
      { "title": "오답 정리", "estMinutes": 90 }
    ]
  }
}
```

### POST `/api/spec/planner/mutations/split-goals`

```json
{
  "clientRequestId": "uuid",
  "deviceId": "web",
  "expectedVersion": 8,
  "mutation": {
    "deadlineId": "dl_01",
    "items": [
      { "goalItemId": "gi_01", "title": "모의고사 1회", "estMinutes": 120 },
      { "goalItemId": "gi_02", "title": "오답 정리", "estMinutes": 90 }
    ]
  }
}
```

### POST `/api/spec/planner/mutations/assign-today`

```json
{
  "clientRequestId": "uuid",
  "deviceId": "web",
  "expectedVersion": 9,
  "mutation": {
    "date": "2026-03-12",
    "goalItemIds": ["gi_01"],
    "plannedMinutes": 120
  }
}
```

### POST `/api/spec/planner/mutations/update-alarm-policy`

```json
{
  "clientRequestId": "uuid",
  "deviceId": "android",
  "expectedVersion": 10,
  "mutation": {
    "assignmentId": "da_01",
    "startTime": "19:00",
    "endTime": "21:00",
    "endsNextDay": false,
    "repeat": "daily",
    "customDays": [],
    "sourceType": "service",
    "privacyMode": "NORMAL"
  }
}
```

### POST `/api/spec/planner/mutations/complete-goal-item`

```json
{
  "clientRequestId": "uuid",
  "deviceId": "android",
  "expectedVersion": 11,
  "mutation": {
    "goalItemId": "gi_01",
    "completedAt": "2026-03-12T10:12:00Z"
  }
}
```

### POST `/api/spec/planner/mutations/pull-forward`

```json
{
  "clientRequestId": "uuid",
  "deviceId": "web",
  "expectedVersion": 12,
  "mutation": {
    "fromDate": "2026-03-13",
    "toDate": "2026-03-12",
    "goalItemIds": ["gi_03"]
  }
}
```

## 4.3 일괄 동기화 API

### POST `/api/spec/planner/sync`

용도:

- 앱/웹 오프라인 큐 재생
- 다수 mutation batch commit
- network restore 시 복구

```json
{
  "workspaceId": "pw_01",
  "baseVersion": 12,
  "mutations": [
    {
      "clientRequestId": "m1",
      "deviceId": "android",
      "type": "complete-goal-item",
      "payload": { "goalItemId": "gi_01", "completedAt": "2026-03-12T10:12:00Z" }
    }
  ]
}
```

## 5. 기존 API와의 호환

## 5.1 `/api/spec/plan/day-with-mission`

현재 route는 유지한다.

동작 방식:

1. legacy request 수신
2. planner aggregate mutation으로 변환
3. planner snapshot version 증가
4. `day_plans` projection write
5. `reminder_jobs` projection write
6. 기존 응답 형식으로 매핑

이 방식은 현재 웹 `usePlanWizard` 흐름과 기존 앱 sync를 한 번에 깨지 않기 위해 필요하다.

## 5.2 day plan projection 규칙

`DailyAssignment`가 바뀌면 `day_plans.items`를 재계산한다.

매핑 규칙:

- `assignment.goalItemIds` -> `day_plans.items[]`
- `GoalItem.title` -> `task_title`
- `GoalItem.estMinutes` -> `planned_block_minutes`
- `ExecutionState` -> completion/metadata

## 5.3 reminder projection 규칙

`AlarmPolicy`가 바뀌면 `reminder_jobs`를 재계산한다.

매핑 규칙:

- `assignmentId + alarm_time_local + repeat + sourceType`를 stable key로 사용
- 현재 stable uniqueness와 충돌하지 않게 한다

근거:

- `backend/spec_loop/models/reminder_job.py:26`
- `backend/spec_loop/models/reminder_job.py:29`

## 6. 동시성, 멱등성, 충돌 처리

## 6.1 optimistic concurrency

모든 write는 `expectedVersion` 필수다.

현재 planner service가 이미 가지고 있는 규칙을 확대 적용한다.

- `backend/spec_loop/planner/service.py:197`
- `backend/spec_loop/planner/service.py:205`

### 409 응답

```json
{
  "error": "version_conflict",
  "workspaceId": "pw_01",
  "expectedVersion": 12,
  "actualVersion": 14,
  "serverSnapshot": {},
  "mergeHint": {
    "safeAutoMergeFields": ["executionStates", "goalItems.completedAt"]
  }
}
```

## 6.2 idempotency

현재 `idem_get_or_set` 축을 planner mutation에도 적용한다.

- `backend/spec_loop/planner/service.py:12`
- `backend/spec_loop/planner/service.py:380`

idempotency scope 예시:

- `planner:create-deadline`
- `planner:split-goals`
- `planner:assign-today`
- `planner:update-alarm-policy`

## 7. projection 처리 전략

## 7.1 권장안

초기 버전:

- aggregate write 성공
- same transaction 또는 직후 transaction에서 projection write
- projection 실패 시 retry queue 저장

운영 고도화:

- outbox table
- projection worker
- dead letter queue

## 7.2 실패 정책

aggregate write는 성공했지만 projection write가 실패한 경우:

- API는 `202 accepted_with_projection_retry` 또는 `200 + projectionStatus=retrying`
- 클라이언트는 snapshot을 source of truth로 유지
- 앱 `Calendar`와 reminder sync는 projection recovery 이후 일치

## 8. 마이그레이션 절차

### Step 1

- 신규 table 추가
- workspace bootstrap script 작성

### Step 2

- 기존 `day_plans`에서 planner snapshot backfill
- `deadlinePlannerService` 로컬 데이터는 웹 로그인 시 import endpoint 제공

### Step 3

- `/planner` 전용 read/write API 연결
- legacy route adapter 운영

### Step 4

- Android/Web offline client 연결
- projection mismatch 모니터링 추가

### Step 5

- legacy 로컬 저장 제거
- old route deprecation 공지 후 제거

## 9. 비기능 요구사항

- p95 GET workspace < 250ms
- p95 mutation < 400ms
- projection retry success > 99.9%
- conflict rate, projection lag, duplicate reminder rate를 대시보드화
- mutation log는 감사 추적 가능해야 함

## 10. 바로 구현할 첫 단위

백엔드 첫 PR 범위 권장:

1. `planner_workspaces` model 추가
2. `GET /api/spec/planner/workspace`
3. `POST /api/spec/planner/mutations/update-alarm-policy`
4. `POST /api/spec/planner/mutations/assign-today`
5. 기존 `/plan/day-with-mission` adapter 연결

이 순서가 가장 안전한 이유는 현재 존재하는 day/reminder 축을 그대로 살리면서 `/planner` 첫 화면을 띄울 수 있기 때문이다.
