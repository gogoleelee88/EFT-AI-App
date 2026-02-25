# 계획서(작업지시서) 대조 결과: 누락·충돌·모호 + 수정 반영

**대상**: SPEC_VERTICAL_SLICE_WORK_ORDER.md vs SPEC.md + GAP_ANALYSIS + 결정사항  
**목표**: 누락 0, 충돌 해결, 모호 최소화. 코드 작성 금지.

---

## 1. 누락 항목 리스트 (원문 근거 포함)

아래는 SPEC·GAP·결정사항에 있으나 **작업지시서에 명시가 없거나 약한 항목**이다.

| # | 원문 근거 | 위치 | 작업지시서 상태 | 조치 |
|---|-----------|------|-----------------|------|
| 1 | **「Level 0(기본): 30초 체크인(질문 1~3개, 선택지 5개 이하)로만 수집」** | F1 | 30초는 “UX 목표, 백엔드 미검증”만 있음. **“30초 체크인”**이 UX 목표임을 문서·체크리스트에 문구로 없음. | 계획서에 “30초 체크인 = UX 목표(클라이언트 타이머/안내용), 백엔드 검증 없음” 명시. |
| 2 | **「보조 추론은 항상 inferred=true로 명시 표기(사용자에게도 “추정” 라벨)」** | F1 | 체크리스트 61에 inferred_flags·추정 라벨 있으나, **응답/저장 시 inferred=true → 사용자 노출용 “추정” 라벨** 연결이 한 문장으로 없음. | Slice 7·체크리스트에 “behavior_inference.inferred=true 시 응답 inferred_flags 및 UI ‘추정’ 라벨 사용” 명시. |
| 3 | **「delay: … Scheduler가 DayPlan 간 이동 + 알림 재설정」** | F5, GAP 5 | Adapter에 “Scheduler에 알림 재설정 위임” 있으나, **Scheduler 모듈 책임**에 “delay 시 DayPlan 간 이동·알림 재설정”이 없음. | 모듈 책임 표에 Scheduler: “delay 시 DayPlan 간 이동 + 알림 재설정 담당” 추가. |
| 4 | **「원칙: “기분”보다 START/RESUME 같은 행동 이벤트가 1순위 KPI」** | E, GAP 6 | execution_logs·KPI 집계는 있으나 **“행동 이벤트 1순위”** 원칙이 모듈·체크리스트에 없음. | Slice 7 또는 공통 원칙에 “KPI 1순위: 행동 이벤트(TASK_START, TASK_RESUME 등), 기분/감정은 2차” 문구 추가. |
| 5 | **「이벤트: RESISTANCE_TECHNIQUE_END → 5분 윈도우 내 TASK_START」** | E, GAP 7 | LOCK_APPLIED/LOCK_EXPIRED는 있음. **RESISTANCE_TECHNIQUE_END**가 execution_logs event_type에 없음. 5분 내 START율은 resistance_events.outcome.started_within_5min 또는 로그로 계산 가능. | event_type 목록에 **RESISTANCE_TECHNIQUE_END** 추가하거나, “5분 내 START율은 resistance_events.outcome + execution_logs TASK_START로 산출”로 명시. |
| 6 | **「DayPlan 생성→첫 START까지 시간(TTFS)」** | E, GAP 9 | 체크리스트 60에 “TTFS·KPI 집계 가능” 있음. **TTFS 정의**(day_plans.created_at vs 첫 TASK_START ts)가 계획서 본문에 없음. | append-only 또는 DB 스키마 섹션에 “TTFS = 첫 TASK_START ts − day_plans.created_at(해당 day_id)” 한 줄 추가. |
| 7 | **「모드(40/70/100)별 완료율/중단율」**, **「Adapt 호출 후 30분 내 RESUME율」**, **「질문 수(체크인+저항)/일」**, **「Drop/Shrink/Swap 후 괴리 감소율」**, **「3일 연속 START streak」** | E, GAP 10 | “집계 가능”만 있고 **KPI 8개와 사용 테이블/필드**가 한곳에 나열되어 있지 않음. | 계획서에 “KPI 8개 목록 + 산출 방법(execution_logs/resistance_events/conditions 조인·집계)” 요약 표 추가. |
| 8 | **「ExecutionLog: … event_type(START/STOP/COMPLETE/RESUME), ts, context」** vs E 스키마 **metrics, condition_ref, resistance_event_ref** | C3, E, GAP 13 | execution_logs에 context·metrics 둘 다 있음. **C3의 context와 E의 context/metrics 관계**가 정의되지 않음. | “C3의 context = execution_logs.context(자유 맥락); E의 metrics = execution_logs.metrics(planned_minutes 등)” 명시. |
| 9 | **「위기 징후는 별도 안내(제품 안전 문구)」** | D, GAP 14 | 체크리스트 62 “상수/문서”만 있음. **위기 징후 시 안내 문구를 어디에 둘지**(상수 파일/문서 경로) 없음. | “위기 징후 안내 문구: spec_loop 상수 또는 docs 제품안전문구.md에 고정 문구 명시” 추가. |
| 10 | **이벤트 기반 예외 시 당일 2회째 모드 전환 허용 여부** | B1, 결정 3 | “1회 초과 시 409”만 있고, **예외 조건(통증 급증·저항 폭주·중단불가) 충족 시 당일 2회째 허용**할지 문구 없음. | “이벤트 예외(통증 급증·저항 폭주·중단불가) 충족 시에만 당일 2회째 전환 허용; 그 외 409” 명시. |

---

## 2. 충돌 항목과 우선순위 적용 여부

| 충돌 | 우선순위 제안(GAP·결정) | 작업지시서 반영 여부 | 비고 |
|------|-------------------------|------------------------|------|
| **모드: score 구간 vs pain 강제** | pain 안전 규칙 우선. pain>=9→40, pain>=7→max70 먼저 적용 후 score 구간 적용. | **적용됨.** Slice 2·내부 흐름에 “pain override 적용 … → final_mode 결정” 명시. | 유지. |
| **모드 상향 vs 당일 1회** | 하루 1회 제한 우선. 당일 1회 전환 후 “3회 연속 START” 있어도 그날 추가 상향 불가(또는 예외로만). 3회 연속 START는 “다음 날” 상향 조건. | **적용됨.** “모드 상향 당일 금지”(Slice 6), test_mode_up_not_allowed_same_day. | 유지. |
| **Condition 요청/저장 스키마** | 요청에 condition_id 없음. 저장/응답에만 condition_id, ts. | **적용됨.** CheckinRequest condition_id 없음, 체크리스트 52. | 유지. |
| **Adapt “필요 시”** | 모드 하향·score 구간 변경·pain 강제로 당일 계획과 어긋날 때만. (1) pain/모드 적용 후 (2) DayPlan.mode≠final_mode 등이면 adapt. | **적용됨.** 내부 흐름 4·5에 “adapt 필요 조건 … 필요 시 apply_adaptation” 명시. | 유지. |
| **D “보호/최적화” vs B1 1줄** | B1 1줄 기본, 70/40 설명 시 “보호·최적화” 병기. | **적용됨.** 체크리스트 58, test_mode_down_uses_protect_optimize_wording. | 유지. |
| **30~90초 vs 60초 기법** | 충돌 아님. B3 30~90·90초 상한 유지. | **적용됨.** duration_sec 30~90, lock_sec=120. | 유지. |

**요약**: pain override > score, 하루 1회 > 상향 조건, 요청/저장 스키마 분리, Adapt 필요 시 조건 모두 작업지시서에 반영됨. 위 “누락” 보완만 추가하면 됨.

---

## 3. 모호 항목 (결정 필요 질문, 최대 5개)

| # | 모호한 부분 | 관련 문구 | 결정이 필요한 질문 |
|---|-------------|-----------|---------------------|
| 1 | **이벤트 예외 충족 시 당일 2회째 전환** | B1 “이벤트 기반 예외”, 결정 3 | 통증 급증·저항 폭주·중단불가가 **당일 이미 1회 전환한 뒤** 발생했을 때, 그 전환을 “2회째”로 허용할지, 아니면 예외는 “1회 전환 전”에만 적용하고 2회째는 무조건 409할지? |
| 2 | **RESISTANCE_TECHNIQUE_END 기록 위치** | E “RESISTANCE_TECHNIQUE_END → 5분 윈도우 내 TASK_START” | 기법 종료 시 **execution_logs에 event_type=RESISTANCE_TECHNIQUE_END를 INSERT**할지, 아니면 **resistance_events.outcome.started_within_5min**만으로 5분 내 START율을 집계할지? |
| 3 | **mode_changes.date와 day_id** | 하루 1회 = date 기준 | mode_changes.date = 전환 발생 **일자**, day_id = 그날의 day_plan으로 고정할지? (1일 1 day_plan 전제인지 명시할지?) |
| 4 | **DayPlan “생성” 시점** | E TTFS “DayPlan 생성→첫 START” | TTFS 분모는 **POST /plan/day 최초 성공 시각(day_plans.created_at)**으로 할지, **PLAN_COMMIT 이벤트 시각**으로 할지? |
| 5 | **RAG 도입 시 저장/출력 범위** | D “RAG는 선호/효과 있었던 행동만 저장, 출력은 옵션” | RAG는 현재 Slice 범위 외이나, **정책 문서에 “저장=행동만, 출력=옵션 제시형”**을 반드시 명시할지, 코드 상 주석/상수로만 둘지? |

---

## 4. 수정된 계획서(변경점만 요약)

아래 변경을 **SPEC_VERTICAL_SLICE_WORK_ORDER.md**에 반영하면 된다.

### 4.1 §1 모듈 책임 표

- **Scheduler** 행에 추가:  
  “Job 큐/백그라운드 실행(시뮬, 미디어, RAG). **delay 시 DayPlan 간 이동 + 알림 재설정 담당.** DB 기반 job 테이블 + 폴링 워커.”

### 4.2 §2 내부 호출 흐름

- 3번 단계 다음에 한 줄 추가:  
  “**이벤트 예외**(통증 급증·저항 폭주·중단불가) 충족 시에만 당일 2회째 모드 전환 허용; 그 외 2회째 요청은 409.”

### 4.3 §3 DB·append-only

- **event_type** 목록에 **RESISTANCE_TECHNIQUE_END** 추가.  
  그리고 주: “5분 내 START율: resistance_events.outcome.started_within_5min 또는 execution_logs RESISTANCE_TECHNIQUE_END + TASK_START ts로 산출.”
- **TTFS** 정의 한 줄 추가:  
  “TTFS = 해당 day_id의 첫 execution_logs.ts(event_type=TASK_START) − day_plans.created_at.”
- **C3 context vs E** 정의 한 줄 추가:  
  “C3의 context = execution_logs.context; E의 metrics = execution_logs.metrics(planned_minutes, executed_minutes, focus_quality).”

### 4.4 §4 Slice 2

- 체크리스트에 추가:  
  “[ ] **30초 체크인** = UX 목표(클라이언트 타이머/안내용), 백엔드 검증 없음(결정 4).”  
  “[ ] 이벤트 예외 충족 시에만 당일 2회째 전환 허용; 그 외 409.”

### 4.5 §4 Slice 7

- 체크리스트에 추가:  
  “[ ] **행동 이벤트 1순위 KPI**: START/RESUME 등 행동 이벤트가 기분/감정보다 1순위(E).”  
  “[ ] behavior_inference.inferred=true 시 **응답 inferred_flags + UI ‘추정’ 라벨** 사용(F1).”  
  “[ ] **위기 징후 안내**: 상수 파일 또는 docs 제품안전문구.md에 고정 문구 명시(D).”

### 4.6 §5 누락 방지 체크리스트

- 다음 행 추가(번호 이어붙임):
  - **30초 체크인 UX 목표** (F1, 결정 4): condition 문서/상수 | test_api_contracts 또는 문서.
  - **Scheduler delay 시 알림 재설정** (F5): scheduler 모듈 책임·delay 연동 | test_adaptation_actions::test_delay_scheduler_hook.
  - **행동 이벤트 1순위 KPI** (E): execution_logs·집계 로직 | test_api_contracts::test_execution_logs_queryable_for_kpi.
  - **RESISTANCE_TECHNIQUE_END 또는 5분 내 START 산출** (E): event_type 또는 outcome | test 문서 또는 pytest.
  - **TTFS 정의** (E): day_plans.created_at, execution_logs TASK_START | test_api_contracts::test_execution_logs_queryable_for_kpi.
  - **KPI 8개 목록+산출 방법** (E): docs 또는 계획서 표 | 문서.
  - **C3 context vs E metrics** (C3,E): execution_logs 스키마 주석 | test_api_contracts.
  - **위기 징후 안내 문구 위치** (D): 상수/docs | 문서.
  - **이벤트 예외 시 당일 2회째 전환 정책** (B1, 결정 3): mode_change/service | test_mode_change.

### 4.7 새 섹션(선택): KPI 8개 요약 표

- 계획서 본문 또는 부록에 아래 표 추가 권장.

| KPI | 산출 방법(테이블/필드) |
|-----|------------------------|
| EFT 후 5분 내 START율 | resistance_events.outcome.started_within_5min 또는 RESISTANCE_TECHNIQUE_END + TASK_START ts |
| 2분 행동 잠금 준수율 | LOCK_APPLIED ~ LOCK_EXPIRED 구간 이탈 여부(execution_logs) |
| TTFS | 첫 TASK_START ts − day_plans.created_at |
| 모드별 완료율/중단율 | execution_logs event_type, mode별 집계 |
| Adapt 후 30분 내 RESUME율 | ADAPT_APPLIED ts 후 30분 내 TASK_RESUME |
| 질문 수/일 | conditions + resistance_events count by day |
| Drop/Shrink/Swap 후 괴리 감소율 | execution_logs.metrics planned vs executed |
| 3일 연속 START streak | execution_logs TASK_START by date, 연속 3일 |

---

---

## 5. PM 결정사항 업데이트(모호 5개 답변) 반영 완료

| # | 질문(모호) | PM 답변 | 반영 문서·위치 |
|---|------------|---------|----------------|
| 1 | 당일 2회째 mode 전환 허용 여부 | 기본 409 (MODE_CHANGE_LIMIT). 예외 = 보호 목적 하향만. 상향 2회째 당일 절대 금지. | 작업지시서 §2, §3 mode_changes, Slice 2, 체크리스트 74. 구현계획 §4.7, §5 결정 2, §9. |
| 2 | RESISTANCE_TECHNIQUE_END 로깅 | ExecutionLog event_type enum **변경 안 함**. ResistanceEvent에 technique_end_ts(또는 end_ts 서버 계산). 5분 내 START = technique_end_ts 기준 5분 내 TASK_START. (선택) kpi_events 테이블. | 작업지시서 §3 resistance_events·execution_logs, KPI 표, Slice 1, 체크리스트 69·77. 구현계획 §3. |
| 3 | mode_changes와 day_id | 1 user + 1 date = 1 DayPlan. UNIQUE(user_id, date). mode_changes는 day_id(FK) 귀속. date 없거나 day_plans.date와 동일(정합성). | 작업지시서 §3 day_plans·mode_changes, Slice 1, 체크리스트 75·76. 구현계획 §3. |
| 4 | TTFS 분모 | PLAN_COMMIT 시각. 없으면 fallback day_plans.created_at. TTFS = first TASK_START ts − (PLAN_COMMIT or created_at). | 작업지시서 §3 TTFS, KPI 표, 체크리스트 70. 구현계획 §3 execution_logs 주. |
| 5 | RAG 정책 문서화 | 정책 문서에 저장=행동/전술만, 출력=옵션만 명시. v1: RAG OFF 또는 stub, 정책+인터페이스만. 내러티브 생성 금지. | 작업지시서 §7 RAG·§8, Slice 7 체크리스트, 체크리스트 78. 구현계획 §9. |

---

**문서 버전**: 2 (PM 결정 5개 반영)  
**다음**: SPEC_VERTICAL_SLICE_WORK_ORDER.md·SPEC_IMPLEMENTATION_PLAN.md에 위 결정 반영 완료. 모호 5개 해소됨.
