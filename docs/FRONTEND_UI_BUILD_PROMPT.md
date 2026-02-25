# 일정관리 백엔드 → 프론트 UI 전면 구축 가이드

**역할**: 프롬프트 엔지니어  
**목적**: 이미 개발된 일정관리(spec_loop) 백엔드에 맞춰, 모든 기능이 드러나는 프론트 UI를 체계적으로 만드는 방법 제안 및 재사용 가능한 프롬프트.

---

## 1. 현재 백엔드가 제공하는 기능 요약

모든 API는 **prefix `/api/spec`** 아래에 등록되어 있다.

| # | 메서드 | 경로 | 용도 | 요청 핵심 필드 | 응답 핵심 필드 |
|---|--------|------|------|----------------|----------------|
| 1 | POST | `/api/spec/plan/day` | 오늘(또는 특정일) DayPlan 생성/갱신 | `date`, `mode`(100/70/40), `items[]`(task_id, planned_block_minutes, micro_steps) | `day_id`, `date`, `mode`, `items[]`(서버가 item_id 부여) |
| 2 | POST | `/api/spec/condition/checkin` | 컨디션 저장 + 모드 결정 + **내부 adapt** | `day_id`(필수), `min_condition_set`(sleep_hours, fatigue, pain, mood, period_status?) | `condition_id`, `ts`, `condition_score`, `final_mode`, `adapt_applied`, `updated_day_plan` |
| 3 | POST | `/api/spec/adapt/day` | 수동으로 계획 재구성(드롭/축소/지연/스왑/분할/보호/쉬움) | `day_id`, `condition_id`, `mode`, `condition_score?` | `day_id`, `actions_applied[]`, `updated_plan`, `soothe_requested`, `delay_scheduler_hint` |
| 4 | POST | `/api/spec/resistance/event` | 저항 이벤트 기록 + 코치 액션(기법, lock_sec=120) | `day_id`, `task_id?`, `trigger`, `intensity`(0~10), `context?` | `event_id`, `ts`, `action`(technique, duration_sec, lock_sec, micro_step), `lock_applied`, `adapt_required` |
| 5 | GET | `/api/spec/jobs/{job_id}` | Job 상태/결과 조회 | path: `job_id` | `job_id`, `status`, `kind`, `result`, `created_ts` |
| 6 | POST | `/api/spec/simulate/day` | 해당 DayPlan에 대한 시뮬레이션 Job 등록 | `day_id` | **202** + body `{ "job_id": number }` |

**핵심 플로우**

- **일정 입력 → 컨디션 반영 → 자동 조정**:  
  `POST /plan/day` 로 DayPlan 생성 → `POST /condition/checkin`(day_id 포함) → 응답의 `updated_day_plan`으로 “기존 vs 조정 후” Diff 표시.
- **저항 발생 시**:  
  `POST /resistance/event` → `lock_applied`(120초), `adapt_required` 여부에 따라 “2분 착수” CTA 또는 Adapt 유도.
- **시뮬레이션**:  
  `POST /simulate/day` → 202 + `job_id` → 주기적으로 `GET /jobs/{job_id}` 로 완료/결과 확인.

---

## 2. 현재 프론트에 이미 있는 것 vs 없는 것

### 이미 있는 페이지/기능

- **`/plan/day` (PlanDayPage)**  
  - 날짜, 모드, Task 리스트 입력 → 저장 버튼.  
  - **주의**: 현재 프론트는 `POST /api/plan/day` 를 호출하도록 되어 있을 수 있음. 백엔드 실제 경로는 **`/api/spec/plan/day`** 이므로, 프록시 또는 `fetch` URL을 **`/api/spec/plan/day`** 로 맞출 것.
- **`/checkin` (CheckinRebalancePage)**  
  - 컨디션 폼(sleep_hours, fatigue, pain, mood, period_status) → `POST /api/spec/condition/checkin` → final_mode, adapt_applied, updated_day_plan 표시 + Diff(shrink/drop·delay/protect) + “지금 2분 착수” CTA.
- **Dashboard**  
  - “오늘 계획 입력” 버튼 → `/plan/day` 이동.

### 아직 UI가 없거나 불완전한 기능

| 기능 | API | 제안 UI |
|------|-----|--------|
| **수동 Adapt** | POST /api/spec/adapt/day | “계획 수동 조정” 페이지 또는 Checkin 결과 화면에서 “다시 조정” 시 condition_id + day_id 로 호출 |
| **저항 이벤트** | POST /api/spec/resistance/event | 작업 시작 전/중 “시작하기 싫다/압도적이다” 등 트리거 선택 → intensity 입력 → 전송 후 lock_sec(120) 안내 + 필요 시 adapt_required 유도 |
| **Job 폴링(시뮬)** | GET /api/spec/jobs/{job_id} | POST /simulate/day 호출 후 job_id 저장 → 2~5초마다 GET /jobs/{job_id} 호출 → status=completed 시 result 표시, failed 시 에러 메시지 |
| **시뮬레이션 시작** | POST /api/spec/simulate/day | DayPlan 상세 또는 Checkin 결과 화면에 “오늘 시뮬레이션 돌리기” 버튼 → 202 수신 후 위 Job 폴링 UI로 전환 |
| **Task 마스터** | (현재 plan/day의 items는 task_id 참조) | 필요 시 “Task 목록 관리” 화면(CRUD) + PlanDayPage에서 선택. 백엔드에 Task 생성 API가 있으면 연동, 없으면 plan/day 요청 시 task_id 대신 title 등으로 서버가 임시 생성하는지 스펙 확인 |

---

## 3. “개발된 기능 전부 UI로 만들기”용 프롬프트 (복사해서 사용)

아래 블록을 그대로 AI(Claude/ChatGPT 등) 또는 개발자에게 주고, “일정관리 백엔드에 맞춰 프론트 UI를 만들어 달라”고 요청할 때 사용하면 된다.

```markdown
## 컨텍스트
- 우리 프로젝트는 **일정관리 + 컨디션 기반 자동 조정** 백엔드가 이미 구현되어 있다.
- 모든 API는 **base path `/api/spec`** 이다 (예: POST /api/spec/plan/day, POST /api/spec/condition/checkin).
- 프론트는 React + TypeScript + React Router + Tailwind 사용. 기존 디자인 시스템(Button, Card 등)과 Dashboard 구조가 있다.

## 백엔드 API 목록 (반드시 이 계약 준수)
1. **POST /api/spec/plan/day**  
   Body: { date, mode: 100|70|40, items: [{ task_id, planned_block_minutes, micro_steps[] }] }  
   Response: { day_id, date, mode, items[] } (각 item에 item_id 있음)
2. **POST /api/spec/condition/checkin**  
   Body: { day_id(필수), min_condition_set: { sleep_hours, fatigue(0~10), pain(0~10), mood, period_status? } }  
   Response: { condition_id, ts, condition_score, final_mode, adapt_applied, updated_day_plan? }
3. **POST /api/spec/adapt/day**  
   Body: { day_id, condition_id, mode, condition_score? }  
   Response: { day_id, actions_applied[], updated_plan, soothe_requested, delay_scheduler_hint? }
4. **POST /api/spec/resistance/event**  
   Body: { day_id, task_id?, trigger, intensity(0~10), context? }  
   Response: { event_id, ts, action: { technique, duration_sec, lock_sec, micro_step }, lock_applied, adapt_required }
5. **GET /api/spec/jobs/{job_id}**  
   Response: { job_id, status, kind, result, created_ts }
6. **POST /api/spec/simulate/day**  
   Body: { day_id }  
   Response: 202 + { job_id }

## 요청 사항
- 위 6개 API를 **모두** 사용하는 UI를 만들어 달라.
- 이미 있는 페이지: /plan/day(일정 입력), /checkin(컨디션 재조정). 이들은 유지하되, **API 호출 URL이 /api/spec/* 인지 확인**하고, 없으면 추가할 화면을 아래 순서로 구현해 달라.

1. **PlanDayPage**  
   - 저장 성공 시 응답의 day_id로 “컨디션 반영하기” → /checkin 로 이동 (state에 day_id, originalPlan 전달).  
   - fetch URL을 `/api/spec/plan/day` 로 통일.

2. **CheckinRebalancePage**  
   - 그대로 두되, adapt_applied=false 이거나 updated_day_plan이 없어도 “기존 계획” 카드를 보여 주고, CTA는 첫 task의 첫 micro_step(또는 “2분 착수(생성 필요)”).

3. **저항 이벤트 UI**  
   - 새 페이지 또는 모달: “지금 시작하기 어렵다” 등 트리거 선택(trigger), 강도(intensity 0~10) 입력 → POST /api/spec/resistance/event.  
   - 응답의 lock_applied(120초), adapt_required 표시. adapt_required면 “계획 조정이 필요해요” 문구 + /checkin 또는 adapt 유도.

4. **수동 Adapt UI**  
   - Checkin 결과 화면 또는 별도 페이지에서 “수동으로 계획 조정” 버튼 → day_id, condition_id(최근 checkin), mode 입력(또는 선택) → POST /api/spec/adapt/day → updated_plan 표시.

5. **시뮬레이션 + Job 폴링 UI**  
   - “오늘 시뮬레이션 실행” 버튼 → POST /api/spec/simulate/day(day_id) → 202 + job_id 수신 → GET /api/spec/jobs/{job_id} 를 3초 간격으로 폴링 → status=completed 시 result 표시, failed 시 에러.

6. **Dashboard**  
   - “오늘 계획 입력” 외에 “컨디션 반영”(/checkin), “저항 기록”(저항 이벤트 페이지/모달) 로 가는 진입점을 추가.

6-1. **plan/day 요청 body**  
   - 백엔드는 **items[]** 에 `task_id`, `planned_block_minutes`, `micro_steps` 만 받음. **title/est_minutes/priority 등은 요청 스키마에 없음.**  
   - task_id는 **DB에 이미 존재하는 Task의 PK**여야 하며, **Task 목록/생성 API는 현재 백엔드에 없음.**  
   - 따라서 (A) 백엔드에 GET/POST Task API를 추가하거나, (B) 시드로 넣은 task_id를 프론트에서 선택하게 한 뒤, plan/day에는 task_id + planned_block_minutes + micro_steps 만 보낼 것.

## 제약
- 새 API나 새 백엔드 로직은 만들지 말 것. 기존 6개 엔드포인트와 스키마만 사용.
- 에러 처리: 4xx/5xx 시 사용자에게 한 줄 메시지 + 필요 시 재시도 안내.
```

---

## 4. 구현 순서 제안 (우선순위)

1. **API base 통일**  
   PlanDayPage 등에서 `/api/plan/day` → `/api/spec/plan/day` 로 변경하고, 실제 백엔드와 한 번씩 호출 테스트.

2. **일정 입력 → 컨디션 재조정 E2E**  
   /plan/day → 저장 → “컨디션 반영으로 이동” → /checkin → 체크인 제출 → Diff + CTA 확인. (이미 대부분 구현됨.)

3. **저항 이벤트 UI**  
   작업 시작 전/중 “시작이 어렵다” 플로우 하나만 먼저 (트리거 선택 + intensity → POST /resistance/event → lock/adapt 안내).

4. **수동 Adapt**  
   Checkin 결과 또는 “계획만 다시 조정” 진입점에서 condition_id + day_id 로 /adapt/day 호출 후 updated_plan 표시.

5. **시뮬 + Job 폴링**  
   /checkin 또는 DayPlan 상세에 “시뮬레이션 실행” → job_id 폴링 → 결과 표시.

6. **Dashboard 정리**  
   일정관리 관련 진입점을 한곳에 모아서 “일정 입력 → 컨디션 반영 → (선택) 시뮬/저항/수동 조정”이 한눈에 보이게.

---

## 5. 백엔드 대조 검수 (실제 백엔드 기준)

- **재검수 (최종)**  
  - 6개 라우터(condition, plan, adapt, resistance, jobs, simulate) prefix·경로·스키마를 실제 코드와 재대조함. **추가 누락 없음.** 문서 §1 표가 그대로 사용 가능.

- **6개 API 경로·메서드·요청 body 필드**  
  문서 §1 표와 실제 라우터/스키마 일치 확인함 (prefix `/api/spec` 포함).

- **백엔드 누락**  
  - **Task 목록/생성 API 없음.**  
    - `POST /api/spec/plan/day` 는 `items[].task_id`(int)만 받으며, **DB에 이미 존재하는 Task의 PK**여야 함 (없으면 404).  
    - Task 모델(`backend.spec_loop.models.Task`)은 있으나, spec_loop 내에 Task를 list/create 하는 라우터는 없음.  
  - **프론트 연동 옵션:**  
    - (A) 백엔드에 `GET /api/spec/tasks`, `POST /api/spec/tasks`(title, est_minutes 등으로 Task 생성) 추가 후, PlanDay에서 Task 선택 + `task_id`/`planned_block_minutes`/`micro_steps` 로 전송.  
    - (B) 시드/픽스처로 task_id를 미리 넣어 두고, 프론트에서 “기존 Task 선택 + 분량/마이크로스텝만 입력” UI로 맞춤.

- **프론트–백 계약 불일치 (plan/day)**  
  - **현재 PlanDayPage** 는 `items: [{ title, est_minutes, priority, energy_cost, requires_focus, pain_sensitive }]` 형태로 보낼 수 있음.  
  - **실제 백엔드** `PlanDayRequest` 는 `items: [{ task_id, planned_block_minutes, micro_steps }]` 만 받음 (title/est_minutes/priority 등 필드 없음).  
  - **조치:** URL을 `POST /api/spec/plan/day` 로 통일하고, body는 Task API 추가 시 task_id 선택 후 위 스키마로 전송하거나, (B)일 때 선택된 task_id + planned_block_minutes + micro_steps 만 전송.

- **참고 (문서/UI 보강용)**  
  - `POST /api/spec/condition/checkin`: `min_condition_set.sleep_hours` 는 `"LT5"|"H5_6"|"H6_7"|"H7_8"|"GT8"`, `mood` 는 `"calm"|"ok"|"anxious"|"low"|"irritated"` (Literal).  
  - `POST /api/spec/resistance/event`: `trigger` 는 문자열; 백엔드에는 7종 enum(예: START_AVERSION, OVERWHELM, PERFECTIONISM, PAIN, FATIGUE, CONFLICT, UNKNOWN)이 있으므로 드롭다운에 이 값 사용 권장.

---

## 6. 결과물 정리

- **이 문서**: 일정관리 백엔드 기준으로 “무엇이 있고, 무엇이 없고, 어떤 순서로 UI를 붙이면 되는지” 정리.
- **§3 프롬프트**: 개발된 기능 전부를 UI로 만들 때 그대로 복사해 쓰는 **재사용 가능한 지시문**.
- **§4 순서**: 백엔드 계약을 바꾸지 않고, 이미 만든 페이지를 최대한 활용하면서 나머지 화면을 채우는 순서.
- **프론트 디자인·퍼포먼스 제안**: 트렌디·창의적 효과 및 퍼포먼스 가이드는 **`docs/FRONTEND_DESIGN_PROPOSAL.md`** 참고.

이걸 기준으로 하면 “백엔드는 있는데 프론트가 없다”는 상태에서, **일정관리 백엔드에 대응하는 UI를 빠짐없이** 만들 수 있다.
