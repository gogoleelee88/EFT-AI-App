# 일정관리(spec_loop) 프론트엔드 디자인 제안 — 트렌디·창의적·퍼포먼스

**전제**: `FRONTEND_UI_BUILD_PROMPT.md` §5 재검수 완료, 백엔드 API 누락 없음.  
**목적**: 트렌디하면서도 창의적인 비주얼·모션·퍼포먼스로 일정관리 UI를 차별화.  
**스택**: React + TypeScript + Tailwind (기존 프로젝트 전제).

---

## 1. 디자인 방향 (톤앤매너)

| 구분 | 제안 |
|------|------|
| **컨셉** | "생산성 × 웰니스" — 차분하지만 에너지가 느껴지는, **다크 베이스 + 포인트 컬러** 또는 **소프트 글래스모피즘**. |
| **타이포** | 제목: **Clash Display / Satoshi / Pretendard Bold** 등 강한 서체. 본문: **Pretendard / SUIT** 로 가독성. |
| **컬러** | 모드 100/70/40을 색으로 구분: 100=에메랄드/민트, 70=앰버/골드, 40=인디고/라벤더. 체크인 슬라이더는 **그라데이션 트랙** (낮음→높음). |
| **카드** | 둥근 모서리(12–16px), 얇은 보더 또는 **backdrop-blur + 반투명 배경**, 약한 그림자. Diff(변경)는 **좌측 컬러 바** 또는 **들쭉날쭉 아이콘**(추가/삭제/축소)으로 한눈에. |

---

## 2. 트렌디·창의적 효과 제안

### 글래스모피즘 (Glassmorphism)
- Checkin 결과 카드, 모드 뱃지, 플로팅 CTA: `bg-white/10 dark:bg-black/20 backdrop-blur-xl border border-white/20`.
- 스크롤 시 상단 헤더만 블러 적용해 "떠 있는" 느낌.

### 마이크로 인터랙션
- **저항 이벤트**: 트리거 선택 시 카드가 살짝 "들쭉" (scale 1.02 + shadow 강화), 제출 후 **120초 타이머**는 원형 프로그레스 + 숫자 카운트다운.
- **Diff 표시**: 기존 계획 → 조정 후 계획 전환 시 **stagger 애니메이션**(아이템이 0.05s 간격으로 fade-in + slide-up).
- **시뮬레이션 Job 폴링**: pending → completed 전환 시 **confetti 또는 파티클 1회** (canvas-confetti 또는 CSS만으로 점 5–10개 튀는 효과).

### 모드 시각화
- 100/70/40을 **게이지 링** 또는 **수평 바**로 표시. 현재 모드만 강조, 나머지는 회색 톤.
- 모드 하향 시 짧은 **토스트**: "수면/피로/통증 신호로 시작 성공률을 우선해요" (백엔드 `MODE_DOWN_REASON_LINE` 활용).

### 2분 착수 CTA
- **그라데이션 버튼** + 호버 시 살짝 밝아짐 + 클릭 시 **ripple 효과**(CSS 또는 작은 훅).
- "지금 2분만 착수하기" 문구 + 아이콘(타이머/손가락).

### 저항 트리거 선택
- 7종 트리거를 **칩/필 태그**로 나열. 선택 시 테두리+배경 강조.
- intensity는 **슬라이더 + 이모지 또는 라벨**(0=괜찮음 → 10=매우 힘듦)로 직관화.

### 일정 입력(PlanDay)
- Task 선택: **드롭다운 또는 검색 가능한 리스트** (Task API 연동 시).
- `planned_block_minutes`: **스텝 입력기**(+ / -) 또는 슬라이더.
- micro_steps: **태그 입력** 형태(엔터로 추가, x로 삭제).

---

## 3. 디자인 퍼포먼스 (성능·접근성)

| 항목 | 제안 |
|------|------|
| **애니메이션** | `transform` + `opacity` 위주. `width`/`height` 애니메이션 최소화. `will-change` 는 호버/활성 구간에만 짧게 적용 후 제거. |
| **폰트** | WOFF2 + `font-display: swap`. 서브셋(한글 자주 쓰는 글자만)으로 용량 절감. |
| **이미지/아이콘** | SVG 우선. 인라인 SVG 또는 스프라이트. |
| **리스트 가상화** | Task/일정 리스트 50개 이상이면 **react-window** 또는 **TanStack Virtual** 로 가상 스크롤. |
| **폴링** | Job 폴링 **3–5초 간격**, 탭 비가시 시 `visibilitychange` 로 일시 정지. 완료/실패 시 즉시 중단. |
| **접근성** | 포커스 링(`focus-visible`), 슬라이더/버튼에 `aria-*`, 모드/상태 변경 시 `aria-live` 영역에 짧은 안내. |
| **다크 모드** | `prefers-color-scheme` + 사용자 토글. CSS 변수로 테마 색 한곳에서 관리. |

---

## 4. 구현 우선순위 (디자인)

1. **Phase 1** — 톤 통일: 컬러 변수, 카드 스타일(글래스/보더), 모드 100/70/40 색·뱃지.
2. **Phase 2** — CTA + Diff: "2분 착수" 버튼 스타일, Diff stagger 애니메이션, 모드 하향 토스트.
3. **Phase 3** — 저항/시뮬: 트리거 칩, 120초 타이머, Job 완료 시 소규모 축하 효과.
4. **Phase 4** — 퍼포먼스: 폰트/리스트 최적화, 폴링 제어, 접근성 점검.

---

## 5. 보수적 실행 단계 (한 번에 완결 가능한 최소 단위)

**원칙**: 각 단계는 **한 번에 한 명령/한 대화에서 완결 가능한 크기**로 나눔. 단계가 크면 누락·애매함이 생기므로, 보수적으로 잘게 나눔.

**의존 관계**: 아래 번호 순서대로 진행. 이전 단계 산출물을 다음 단계에서 사용.

| 단계 | 목표 | 범위(파일/대상) | 산출물 | 의존 |
|------|------|-----------------|--------|------|
| **S1** | 디자인 토큰 도입 | `index.css` 또는 `tailwind.config` + CSS 변수 | 모드 색(100=에메랄드, 70=앰버, 40=인디고), 카드 radius(12–16px), shadow, 글래스용 배경/보더 값 | 없음 |
| **S2** | 일정관리 공통 컴포넌트 | 새 파일 1~2개 | `SpecCard`(글래스 카드 클래스 적용), `ModeBadge`(100/70/40 뱃지) | S1 |
| **S3** | Checkin 페이지 톤 적용 | `CheckinRebalancePage.tsx` | 카드→SpecCard, 모드 표시→ModeBadge, 2분 착수 버튼 그라데이션+문구+아이콘 | S2 |
| **S4** | Diff + 모드 하향 토스트 | `CheckinRebalancePage` 또는 `PlanDiffList` 등 | 기존 vs 조정 후 리스트 stagger 애니메이션(0.05s 간격 fade-in + slide-up), final_mode 70/40일 때 토스트 한 줄 | S3 |
| **S5** | 저항 이벤트 — 폼·API | 새 페이지 또는 모달 1개 | 트리거 7종 칩 선택, intensity 0~10 슬라이더, day_id 전달, POST `/api/spec/resistance/event` 호출 | S2(카드/뱃지) |
| **S6** | 저항 이벤트 — 응답 UI | S5와 동일 페이지/모달 | 응답 후 120초 카운트다운(원형 프로그레스+숫자), lock_applied 안내, adapt_required 시 문구+유도. 트리거 칩 선택 시 scale 1.02 + shadow | S5 |
| **S7** | 수동 Adapt UI | Checkin 결과 또는 별도 페이지 | "수동으로 계획 조정" 버튼, day_id·condition_id·mode 전달, POST `/api/spec/adapt/day` 호출, updated_plan 표시 | S2 |
| **S8** | 시뮬 실행 + Job 폴링 | Checkin 또는 Plan 상세 + 훅/컴포넌트 | "시뮬레이션 실행" 버튼 → POST `/api/spec/simulate/day` → 202 + job_id → GET `/api/spec/jobs/{job_id}` 3~5초 간격 폴링, 탭 비가시 시 `visibilitychange`로 일시정지 | 없음(API만) |
| **S9** | 시뮬 완료 시 축하 효과 | S8과 동일 | status=completed 시 confetti 또는 CSS 파티클 1회 | S8 |
| **S10** | PlanDay API·body 맞춤 | `PlanDayPage.tsx` | fetch URL `/api/spec/plan/day`, body는 `items: [{ task_id, planned_block_minutes, micro_steps }]` 만. (Task 없으면 시드 task_id 선택 또는 안내) | 없음 |
| **S11** | PlanDay 입력 UI + 디자인 | `PlanDayPage.tsx` | Task 선택(드롭다운/리스트), planned_block_minutes 스텝 입력기(+/-), micro_steps 태그 입력(엔터 추가·x 삭제), SpecCard·ModeBadge 적용 | S2, S10 |
| **S12** | Dashboard 진입점 + 헤더 블러 | `Dashboard.tsx`, 레이아웃/헤더 1곳 | 일정 입력·컨디션 반영·저항 기록 진입점 정리; 스크롤 시 상단 헤더 backdrop-blur | S3, S5, S7 |
| **S13** | 접근성·다크 모드 | 이미 만든 일정관리 화면 + theme | `focus-visible` 포커스 링, 슬라이더/버튼 `aria-*`, 모드·상태 변경 시 `aria-live` 한 줄; CSS 변수로 라이트/다크, 사용자 토글 + `prefers-color-scheme` | S3~S12 |

### 단계별 “한 번에 할 일” 요약 (복사용)

- **S1**: CSS 변수로 모드색·카드·글래스 값 정의. Tailwind에 연결할지 여부만 결정 후 적용.
- **S2**: `SpecCard`, `ModeBadge` 컴포넌트 만들기. S1 변수 사용.
- **S3**: CheckinRebalancePage에 SpecCard, ModeBadge, 2분 착수 그라데이션 버튼 적용.
- **S4**: Diff 리스트 stagger 애니메이션 추가. final_mode 70/40일 때 토스트 한 줄 추가.
- **S5**: 저항 이벤트 폼(트리거 칩 7종, intensity 슬라이더) + POST resistance/event.
- **S6**: 저항 응답 UI(120초 타이머, adapt_required 안내) + 칩 선택 시 scale/shadow.
- **S7**: 수동 조정 버튼 + POST adapt/day + updated_plan 표시.
- **S8**: 시뮬 버튼 + simulate/day → job_id 폴링(간격·visibilitychange).
- **S9**: Job completed 시 confetti 또는 CSS 파티클 1회.
- **S10**: PlanDayPage fetch URL·body를 백엔드 계약에 맞춤(task_id, planned_block_minutes, micro_steps).
- **S11**: PlanDay에 Task 선택·스텝 입력기·태그 입력 UI + SpecCard·ModeBadge.
- **S12**: Dashboard 일정 진입점 정리 + 헤더 스크롤 블러.
- **S13**: focus-visible, aria, aria-live 보강 + 다크 모드(변수·토글).

이 순서로 적용하면 **목적(프론트 디자인 제안 누락 없이 구현)** 에 맞게, 한 번에 제대로 할 수 있는 크기로 단계가 나뉜다.

---

## 6. 단계별 검증(테스트) 제안

각 단계 완료 후 아래 항목으로 **제대로 만들었는지** 확인. ✅ 통과 기준을 만족하면 다음 단계로 진행.

### S1 — 디자인 토큰

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 코드 검사 | `index.css` 또는 `tailwind.config`/CSS에 `--spec-mode-100`, `--spec-mode-70`, `--spec-mode-40`(또는 동일 목적 변수명) 정의되어 있음 |
| 2 | 코드 검사 | 카드용 radius(12~16px), shadow, 글래스용 배경/보더 값이 변수 또는 Tailwind theme에 있음 |
| 3 | 브라우저 | 개발자도구 → 요소 선택 → 해당 변수가 `:root` 또는 상위에서 적용되는 것 확인 |

### S2 — SpecCard, ModeBadge

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 코드 검사 | `SpecCard` 컴포넌트 파일 존재, `backdrop-blur` 또는 글래스 관련 클래스 사용 |
| 2 | 코드 검사 | `ModeBadge` 컴포넌트 존재, mode(100/70/40)에 따라 다른 색/텍스트 표시 |
| 3 | 화면 | 임시 페이지나 Storybook에서 SpecCard·ModeBadge 렌더 시 카드가 반투명·블러, 뱃지가 100/70/40 구분되어 보임 |

### S3 — Checkin 톤 적용

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 코드 검사 | `CheckinRebalancePage`에서 카드 영역이 `SpecCard`(또는 동일 스타일) 사용 |
| 2 | 코드 검사 | 모드 표시에 `ModeBadge` 사용 |
| 3 | 화면 | 2분 착수 버튼이 그라데이션 + 문구("지금 2분만 착수하기" 등) + 아이콘으로 보임 |
| 4 | 화면 | `/checkin` 접속 시 레이아웃이 깨지지 않고, 카드·뱃지가 S1/S2 토큰과 일치 |

### S4 — Diff + 토스트

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | 체크인 제출 후 "기존 vs 조정 후" 리스트가 나타날 때, 아이템이 순차적으로(약 0.05s 간격) fade-in 또는 slide-up 되는지 확인 |
| 2 | 화면 | `final_mode`가 70 또는 40일 때 "수면/피로/통증 신호로 시작 성공률을 우선해요"에 해당하는 토스트 한 줄이 잠깐 표시됨 |
| 3 | 코드 검사 | Diff 리스트에 stagger용 delay(예: index * 50) 또는 CSS animation-delay 사용 |

### S5 — 저항 이벤트 폼·API

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | 트리거 7종(START_AVERSION, OVERWHELM, PERFECTIONISM, PAIN, FATIGUE, CONFLICT, UNKNOWN)이 칩/태그로 선택 가능 |
| 2 | 화면 | intensity 0~10 슬라이더(또는 동등 입력) 존재 |
| 3 | 네트워크 | 제출 시 `POST /api/spec/resistance/event` 호출, body에 `day_id`, `trigger`, `intensity` 포함 |
| 4 | 화면 | day_id를 어디선가 전달(라우트 state, 선택 등)받아 폼에서 사용 가능 |

### S6 — 저항 응답 UI

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | API 응답 후 120초 카운트다운이 원형 프로그레스(또는 막대) + 숫자로 표시됨 |
| 2 | 화면 | `lock_applied`(120) 안내 문구 노출 |
| 3 | 화면 | `adapt_required === true`일 때 계획 조정 유도 문구 또는 링크 표시 |
| 4 | 화면 | 트리거 칩 선택 시 시각적으로 살짝 커지거나 그림자 강화(scale/shadow) 느낌 확인 |

### S7 — 수동 Adapt

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | Checkin 결과 또는 별도 화면에 "수동으로 계획 조정" 버튼(또는 동일 의미) 존재 |
| 2 | 네트워크 | 클릭 시 `POST /api/spec/adapt/day` 호출, body에 `day_id`, `condition_id`, `mode` 포함 |
| 3 | 화면 | 응답의 `updated_plan`(또는 동일 필드)을 화면에 표시 |

### S8 — 시뮬 + 폴링

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | "시뮬레이션 실행"(또는 동일 의미) 버튼 존재, 클릭 시 요청 발생 |
| 2 | 네트워크 | `POST /api/spec/simulate/day` → 202 + `job_id` 수신 |
| 3 | 네트워크 | 이후 `GET /api/spec/jobs/{job_id}` 가 3~5초 간격으로 호출됨 |
| 4 | 코드 검사 | 탭 비가시 시(`visibilitychange` 또는 document.hidden) 폴링 일시정지 로직 존재 |

### S9 — 시뮬 완료 효과

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | Job `status === completed` 로 바뀌었을 때 confetti 또는 작은 파티클/튀는 효과가 1회 재생됨 |
| 2 | 코드 검사 | completed 전환 시점에 효과를 트리거하는 코드(예: useEffect 또는 이벤트) 존재 |

### S10 — PlanDay API 맞춤

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 코드 검사 | PlanDay 저장 시 `fetch`/axios URL이 `/api/spec/plan/day` (또는 base + `/api/spec/plan/day`) |
| 2 | 코드 검사 | 요청 body의 `items`가 `{ task_id, planned_block_minutes, micro_steps }` 형태(다른 키 없이) |
| 3 | 네트워크 | 실제 요청 시 Network 탭에서 위 URL·body 구조 확인 (task_id는 시드/선택 값 사용 시 200 또는 404만 나오면 구조는 통과) |

### S11 — PlanDay 입력 UI + 디자인

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | Task 선택 UI(드롭다운 또는 리스트, 시드/API 연동 시 선택 가능) |
| 2 | 화면 | planned_block_minutes용 스텝 입력기(+ / -) 또는 슬라이더 |
| 3 | 화면 | micro_steps 태그 입력: 엔터로 추가, x로 삭제 가능 |
| 4 | 화면 | SpecCard·ModeBadge(또는 S1/S2 스타일)가 PlanDay 페이지에 적용됨 |

### S12 — Dashboard + 헤더 블러

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 화면 | Dashboard에 "일정 입력"(또는 /plan/day), "컨디션 반영"(/checkin), "저항 기록"(저항 이벤트) 진입점이 한곳에 정리되어 있음 |
| 2 | 화면 | 일정관리 관련 화면에서 스크롤 시 상단 헤더에 `backdrop-blur`(또는 유사) 적용되어 "떠 있는" 느낌이 있음 |
| 3 | 코드 검사 | 헤더 또는 레이아웃에 스크롤 구간·blur 클래스 연결 로직 존재 |

### S13 — 접근성·다크 모드

| # | 검증 방법 | 통과 기준 |
|---|-----------|-----------|
| 1 | 코드 검사 | 전역 또는 일정관리 버튼/슬라이더에 `focus-visible` 스타일 또는 포커스 링 적용 |
| 2 | 코드 검사 | 슬라이더·주요 버튼에 `aria-label` 또는 `aria-labelledby` 등 `aria-*` 존재 |
| 3 | 코드 검사 | 모드/상태 변경을 읽어주는 `aria-live` 영역(또는 role="status" 등) 한 곳 이상 존재 |
| 4 | 화면 | 다크 모드 토글이 있고, 전환 시 테마 색이 CSS 변수 등으로 바뀜 |
| 5 | 코드 검사 | 라이트/다크 색이 CSS 변수로 정의되어 있으며, `prefers-color-scheme` 또는 사용자 선택에 따라 적용 |

---

### 검증 체크리스트 (한 장 요약)

완료한 단계에 ✅ 표시해 두고 넘어가면 된다.

```
S1  [ ] 토큰 변수 정의·브라우저 적용 확인
S2  [ ] SpecCard·ModeBadge 존재·렌더 확인
S3  [ ] Checkin에 카드·뱃지·2분 버튼 적용 확인
S4  [ ] Diff stagger·모드 하향 토스트 확인
S5  [ ] 저항 폼 7종 칩·슬라이더·POST 확인
S6  [ ] 120초 타이머·adapt 안내·칩 scale 확인
S7  [ ] 수동 조정 버튼·POST adapt·결과 표시 확인
S8  [ ] 시뮬 버튼·폴링·visibilitychange 확인
S9  [ ] completed 시 축하 효과 1회 확인
S10 [ ] PlanDay URL·body 계약 확인
S11 [ ] Task 선택·스텝·태그 UI·디자인 확인
S12 [ ] Dashboard 진입점·헤더 블러 확인
S13 [ ] focus/aria/aria-live·다크 토글 확인
```

이 검증을 통과한 뒤 다음 단계로 진행하면, **S1~S13을 제대로 만들었는지** 단계별로 확인할 수 있다.
