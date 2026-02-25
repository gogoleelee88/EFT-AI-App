## 실행 복귀 OS - 멀티모달 아키텍처 정렬안 (LifeLink 설계 반영)

이 문서는 기존 `resume-os`(실행 복귀 OS) 코드에,  
`멀티모달_AI명상_설계_2026-02-01.md` 에서 정리한 **센서→임베딩/상태→언어/요약** 아키텍처를 어떻게 반영했는지 정리한다.

---

### 1. 3 레이어 구조 매핑 (센서 → 상태 추정 → 언어/요약)

LifeLink 설계의 3계층:

- **Edge / Sensor 레이어**: 워치/폰 센서 수집, windowing
- **Motion / Encoder 레이어**: Signal Encoder, Watch Poser, M2T
- **LLM Orchestrator / Summary 레이어**: 질문/요약/프롬프트, Personalization

`resume-os` 에서의 매핑:

- **Sensors 레이어 (`src/sensors/`)**
  - `activeWindow.js`: active-win 으로 현재 앱/윈도우 타이틀 수집 → `APP_FOCUS` 이벤트
  - `input.js`: iohook 으로 키보드/마우스 집계 → `KEY_ACTIVITY` 이벤트
  - (OCR/웹캠은 정책상 off, `ocr.js` 는 ROI 전용 스텁만 존재)

- **State / Motion 레이어 (`src/engine/stateMachine.js`)**
  - `estimateState(events)`:
    - 최근 `KEY_ACTIVITY`/`APP_FOCUS` 집계를 기반으로  
      `FOCUSING / IDLE / STUCK / DISTRACTED / FATIGUED` 상태 추정
    - STUCK 은 backspace 비율↑ + 앱 전환 적음 → `stuck_conf` 상승
    - DISTRACTED 는 포커스 전환 과다
    - FATIGUED 는 키 입력 적음 + 짧은 idle 패턴
  - `runFocusTrackerOnce`:
    - 일정 window 내 events → 상태 추정 → callback 으로 전달
  - 상태 결과는 `state_snapshots` 테이블에 저장 (`src/storage/stateRepo.js`)

- **Coach / LLM/요약 레이어 (향후 확장)**
  - 현재는 Proactive Coach + KPI 로깅까지 구현:
    - `src/engine/coach.js`:  
      상태 스냅샷을 기반으로 IDLE/STUCK/DISTRACTED 트리거 → nudge 후보 결정
    - LLM을 붙이면:
      - STUCK 구간/앱/파일 컨텍스트를 `M2T` + 질문 템플릿(예/아니오+선택지)로 변환
      - "어디가 막혔는지"를 최소 질문으로 물어보고, 회고/요약 문장 생성

---

### 2. “불확실하면 질문한다” 트리거 반영 아이디어

LifeLink 설계의 질문 트리거(5.1)를 `resume-os`에 맞게 해석:

- **후보 조건**
  - `stuck_conf` 가 0.6~0.8 사이(애매한 막힘)인데 시간이 길어지는 경우
  - 최근 10~20분간 `STATE_CHANGE` 가 거의 없고, `IDLE`/`UNKNOWN` 비율이 높을 때
  - 특정 컨텍스트(앱/레포/파일)에서 `STUCK_NUDGE` 가 자주 발생하는 패턴

- **추후 구현 방향 (LLM Orchestrator)**
  - `src/engine/coach.js` 에서 `desiredNudgeType === 'STUCK_NUDGE'` 인 경우,
  - 단순 카드 문구 대신, LLM을 통해 아래와 같은 최소 질문 생성:
    - “지금 어떤 작업에서 막히셨나요? (코드 작성 / 디버깅 / 문서 작성 / 기타)”
    - “지금은 새로운 일을 시작하려는 중인가요, 아까 하던 걸 이어가려는 중인가요?”
  - 사용자의 답변은 `events` 또는 별도 `interaction_turn` 스타일 테이블로 저장해  
    향후 개인화/요약에 활용.

---

### 3. 하루 요약/분석(LifeLink의 Day Summary → 실행 복귀 OS로 확장)

LifeLink의 일일 요약 구조를 `resume-os`에 적용하면:

- **활동 세그먼트에 해당하는 것**:
  - `state_snapshots` + `events.APP_FOCUS` 를 시간축으로 묶어  
    `ActivitySegment(start, end, state, app, window_title)` 유사 구조 생성

- **집계/요약 예시**:
  - 파이차트:
    - 하루 동안 `FOCUSING / IDLE / STUCK / DISTRACTED` 각각의 총 시간 비율
  - 타임라인:
    - “09:00–10:20 VSCode (FOCUSING)”, “10:20–11:00 브라우저( DISTRACTED )” 등
  - 1문단 요약 (향후 LLM):
    - 입력: 하루 state/앱/파일 패턴 + Proactive Coach 로그 + Nudge 응답
    - 출력: “오전에는 비교적 집중이 잘 되었지만, 오후 3시 이후 브라우저 전환이 잦아지며 집중도가 떨어졌습니다…” 형태의 텍스트

- **daily_summary 테이블(향후)**:
  - `user_id, date, paragraph, focus_ratio, idle_ratio, stuck_ratio, created_at`  
  - 지금은 설계만 두고, Batch Job에서 계산/저장을 추가할 수 있다.

---

### 4. Personalization / Memory (user_label_memory 개념의 재해석)

LifeLink의 `user_label_memory` (label별 centroid_vector, samples_count…) 는  
실행 복귀 OS에서 다음과 같이 활용 가능:

- **사용자별 “막힘 패턴/딴짓 패턴” 프로토타입**
  - 특정 조합:
    - `app = VSCode`, `repo = 프로젝트 A`, `시간대 = 야간`, `backspace_ratio 높음`  
    - 이 조합이 자주 `STUCK` 으로 끝난다면, “이 사람의 취약 컨텍스트”로 메모리화
  - 반대로:
    - `app = VSCode`, `branch = main`, `시간대 = 오전`, `포커스 전환 적음`  
    - “이 사람의 집중 골든 타임/환경”으로 메모리화

- **구현 방향**
  - 현재는 `events` + `state_snapshots`만 있으므로,
  - 추후 `context_anchor` (app, window_title, url_hash, snippet_hash)를 확장해  
    상태와 함께 `user_label_memory` 스타일로 centroid/통계를 유지할 수 있다.

---

### 5. 운영/비기능 요구사항 반영 포인트

LifeLink 문서의 운영/비기능 요구사항 중 `resume-os`에 바로 적용되는 것:

- **성능/비용**
  - 입력 이벤트는 이미 집계 형태(`KEY_ACTIVITY`, `APP_FOCUS`)로만 저장 → 로그 폭발 방지
  - 상태 추정/코칭 루프는 1분/5분 등 저빈도 실행으로 CPU 사용 제한

- **프라이버시/보안**
  - 키 입력 내용/스크린 OCR/원본 영상은 저장/전송 안 함(코드 수준으로 강제)
  - 로컬 SQLite 기반으로, 사용자별 데이터는 OS 계정 단위로 격리
  - 추후 “특정 날짜의 state/events/nudges 삭제” 기능을 `state_snapshots`/`events`/`nudges`에 추가해  
    LifeLink의 “이 날의 기록 삭제” 요구사항과 맞춰갈 수 있음.

---

### 6. 한 문단 요약 (실행 복귀 OS 버전)

실행 복귀 OS는 데스크톱의 입력/포커스 시그널을 로컬에서 집계하고,  
Multimodal Focus Tracker로 `FOCUSING / IDLE / STUCK / DISTRACTED / FATIGUED` 상태를 추정한다.  
상태가 장시간 IDLE 이거나 STUCK/DISTRACTED 패턴이 지속될 경우, Proactive Coach가 Nudge Budget 정책(30분당 1회, 2회 연속 거절 시 90분 쿨다운, Snooze 15/30/60분)을 준수하며 재개입 카드를 띄운다.  
사용자의 수락/거절/스누즈 응답과 센서 기반 이벤트는 `events`, `state_snapshots`, `nudges`에 축적되어,  
향후 LLM 기반 질문/요약/개인화 모듈이 “언제/어디서/무엇을 할 때 잘 집중하는지, 어디서 자주 막히는지”를 설명하는 일일 요약과 실행 복귀 전략으로 확장될 수 있다.

