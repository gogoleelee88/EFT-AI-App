# 명상 가이드 기능 테스트 가이드

구현된 기능이 정상 동작하는지 확인하기 위한 테스트 방법입니다.

---

## 1. 사전 준비

### 1.1 백엔드 서버 실행

```bash
# 프로젝트 루트에서
cd c:\Users\lco20\EFT-AI-App

# UTF-8 환경 + 실행 (Windows)
set PYTHONUTF8=1
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

또는 `run-dev.bat` 실행 (경로 확인 후).

**확인**: http://127.0.0.1:8000/docs 에서 Swagger UI 접속 가능.

---

### 1.2 프론트엔드 실행

```bash
cd c:\Users\lco20\EFT-AI-App\frontend
npm run dev
```

**확인**: http://localhost:5173 접속 가능.

---

## 2. 앱 UI로 전체 플로우 테스트

### 2.1 진입 경로

| 경로 | 설명 |
|------|------|
| `/eft-strict` | 감정 수집 폼 (SlideIntake) |
| `/meditation/theme` | 테마 선택 (직접 접근 시 strictIntake 없으면 추천만) |

**권장**: 대시보드 → "감정 체크인" 또는 랜딩 → **EFT 시작** → `/eft-strict`

---

### 2.2 단계별 테스트

#### Step 1: 감정 입력 (SlideIntake)

1. http://localhost:5173/eft-strict 접속
2. 7단계 질문에 답변:
   - 핵심 감정: 예) 불안
   - 상황 맥락: 예) 발표 전이라 걱정돼요
   - 자동사고: 예) 잘못되면 어떡하지
   - 신체 감각: 예) 가슴이 조여요
   - 강도: 1~10 선택
   - 대처방식: 예) 혼자 참음
   - 즉시 목표: 예) 잠깐이라도 안정 찾기
3. 완료 시 EFT 스크립트 생성 요청 → **EFT AR** vs **명상** 선택 화면 표시

**확인**: "명상 (맞춤 가이드)" 버튼이 보이면 OK.

---

#### Step 2: 명상 선택 → 테마 선택

1. **명상 (맞춤 가이드)** 클릭
2. `/meditation/theme` 으로 이동
3. 추천 테마가 기본 선택됨 (예: thought_labeling)
4. 테마 선택 후 **다음** 클릭

**확인**: 3개 테마(자기 자비, 인지적 거리두기, 실행 트리거)가 보이면 OK.

---

#### Step 3: 세션 설계 → 명상 시작

1. `/meditation/session` 에서 세션 블록 구성 확인
2. 음성 선택 (선택 사항)
3. **명상 시작** 클릭

**확인**: `/meditation/run` 으로 이동.

---

#### Step 4: 명상 가이드 실행 (Guidance API 연동)

1. **맞춤 명상 가이드를 준비하고 있어요** 로딩 화면
2. 곧 **자막**이 표시됨 (예: "편안하게 눈을 감고 호흡에 집중합니다.")
3. `hold_ms`에 따라 자막이 자동 전환
4. 다음 Chunk가 있으면 "다음 가이드를 준비하고 있어요" 후 이어서 표시
5. **명상 종료** 클릭 → 별점(1~5) 모달 → 완료 클릭

**확인**:
- 자막이 순서대로 바뀌면 ✅
- 별점 모달이 뜨고 완료 후 대시보드로 이동하면 ✅

---

#### Step 5: 피드백 저장 확인

```bash
# backend/data/guidance_feedback.jsonl 확인
type c:\Users\lco20\EFT-AI-App\backend\data\guidance_feedback.jsonl
```

마지막 줄에 방금 제출한 피드백(guidance_id, best_moments, user_rating 등)이 있어야 함.

---

## 3. API 직접 테스트 (Swagger / curl)

### 3.1 Theme 추천 (emotion checkin)

```http
POST http://127.0.0.1:8000/api/emotion/checkin
Content-Type: application/json

{
  "session_id": "test-session-1",
  "core_emotion": "불안",
  "situation_context": "발표 전이라 걱정돼요",
  "automatic_thought": "잘못되면 어떡하지",
  "intensity_before": 7,
  "immediate_goal": "잠깐이라도 안정 찾기",
  "physical_sensation": "가슴이 조여요",
  "coping_attempt": "혼자 참음",
  "available_time": 10
}
```

**확인**: `theme_recommendations`, `default_theme_id` 응답.

---

### 3.2 Guidance 생성 (generate)

```http
POST http://127.0.0.1:8000/api/guidance/generate
Content-Type: application/json

{
  "intake": {
    "core_emotion": "불안",
    "situation_context": "발표 전이라 걱정돼요",
    "automatic_thought": "잘못되면 어떡하지",
    "intensity": 7,
    "immediate_goal": "잠깐이라도 안정 찾기"
  },
  "selected_theme_id": "self_compassion",
  "signal_degrade": true
}
```

**확인**:
- `guidance_id`, `captions` (seq, text, hold_ms), `next_cursor` 응답
- `signal_degrade: true` → 로컬 템플릿(base_text) 사용, vLLM 불필요

---

### 3.3 Guidance 피드백 (feedback)

```http
POST http://127.0.0.1:8000/api/guidance/feedback
Content-Type: application/json

{
  "guidance_id": "<위에서 받은 guidance_id>",
  "best_moments": [1, 2],
  "best_moments_detail": [
    { "seq": 1, "text": "편안하게 눈을 감고 호흡에 집중합니다." },
    { "seq": 2, "text": "괜찮아요. 천천히 숨 쉬세요." }
  ],
  "user_rating": 4,
  "theme_id": "self_compassion"
}
```

**확인**: `ok: true`, `trace_id`, `saved_at` 응답.

---

## 4. 기능별 체크리스트

| 기능 | 확인 방법 | 통과 조건 |
|------|-----------|-----------|
| **1. 텍스트 감정 수집** | SlideIntake 7단계 완료 | EFT AR / 명상 선택 화면 표시 |
| **2. 맞춤 명상 자막** | 명상 시작 후 | 내 감정 반영된 자막 표시 |
| **3. 시나리오 기반 NLG** | signal_degrade=false + vLLM 실행 시 | Qwen 각색 자막 |
| **4. 타이밍 조절** | arousal_level, intensity 입력 | hold_ms, silence_ms 응답에 반영 |
| **5. 톤 선택** | guide_tone 입력 (API) | decision_trace에 톤 기록 |
| **6. Coach task 추천** | micro_task_bridging 테마 + immediate_goal | task_atom 개인화 |
| **7. Chunk 연속** | next_cursor로 재요청 | 다음 2줄 수신 |
| **8. 피드백 저장** | 명상 종료 → 별점 | guidance_feedback.jsonl에 기록 |

---

## 5. vLLM 없이 테스트 (signal_degrade)

vLLM(모델) 서버가 없어도 **signal_degrade: true** 로 테스트 가능:

- Guidance API: base_text 기반 로컬 템플릿 사용
- 자막 품질은 낮지만, 흐름·연동 검증 가능

---

## 6. 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 자막이 안 나옴 | 백엔드 미실행 | 포트 8000에서 uvicorn 실행 |
| CORS 오류 | 프론트 포트 다름 | vite proxy 확인 (localhost:5173) |
| 404 /api/guidance | 라우터 미등록 | main.py에 guidance_router 포함 여부 확인 |
| Supabase 오류 | emotion/checkin 호출 시 | .env SUPABASE_* 설정 또는 해당 API 스킵 |
