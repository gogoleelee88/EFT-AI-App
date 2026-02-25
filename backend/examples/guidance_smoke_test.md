# Guidance Pipeline Smoke Test (MoodTalk v2.0)

## 1. Failover 테스트 (signal_degrade=true → 로컬 템플릿)

### Request

```http
POST /api/guidance/generate
Content-Type: application/json
```

```json
{
  "intake": {
    "core_emotion": "불안",
    "situation_context": "내일 발표가 있어서 걱정돼요",
    "automatic_thought": "잘못하면 망할 것 같아요",
    "physical_sensation": "가슴이 조여요",
    "intensity": 7,
    "immediate_goal": "잠깐이라도 안정 찾기"
  },
  "selected_theme_id": "micro_task_bridging",
  "signal_degrade": true,
  "confidence": null
}
```

### Expected Response (GuidanceOutputState)

`signal_degrade=true` 이므로 PolicyEngine이 `scenario_id="standard_grounding"`으로 고정, NLG는 base_text Chunk 사용.

```json
{
  "guidance_id": "<uuid>",
  "captions": [
    { "seq": 1, "text": "편안하게 눈을 감고 호흡에 집중합니다.", "hold_ms": 2500, "type": "intro" },
    { "seq": 2, "text": "천천히 숨을 들이쉬고 내쉬어 보세요. 지금 이 순간에만 집중해 보세요.", "hold_ms": 4000, "type": "main" }
  ],
  "silence_ms": 700~1500,
  "voice_profile": "qwen_female_calm",
  "action_context": {
    "phase": "grounding",
    "block_type": "grounding_breath",
    "scenario_id": "standard_grounding",
    "scenario_blocks": [ ... ],
    "pace": "normal",
    "intervention_rate": "med",
    "output_mode": "caption"
  },
  "next_cursor": { "scenario_id": "standard_grounding", "next_block_index": 2 },
  "meta": {
    "is_failover": true,
    "model": "local"
  }
}
```

## 2. Theme 추천 (checkin 확장)

### Request (프론트 수집 항목 7~8개와 동일)

```http
POST /api/emotion/checkin
Content-Type: application/json
```

```json
{
  "session_id": "sess-smoke-1",
  "user_id": null,
  "core_emotion": "불안",
  "situation_context": "업무 마감이 밀려요",
  "automatic_thought": "다 망할 것 같아요",
  "physical_sensation": "가슴이 조여요",
  "coping_attempt": "혼자 참음",
  "immediate_goal": "한 걸음만 나가기",
  "intensity_before": 6,
  "available_time": 10
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| session_id | O | 세션 ID |
| user_id | - | 사용자 ID (로그인 시) |
| core_emotion | O | 핵심 감정 |
| situation_context | O | 상황 맥락 |
| automatic_thought | O | 자동사고 |
| physical_sensation | - | 신체 감각 |
| coping_attempt | - | 대처 시도 (프론트 behavioral_reaction) |
| immediate_goal | - | 즉시 목표 |
| intensity_before | O | 0~10 강도 |
| available_time | - | 사용 가능 시간(분), 8번째 항목 |

### Expected Response (기존 필드 + Optional)

```json
{
  "ok": true,
  # MODULE_MODE=pro: LLM 기반 추천 | lite: 규칙 기반
  "theme_recommendations": [
    { "theme_id": "self_compassion", "title": "Self-Compassion (자기 자비)", "estimated_min": 8, "summary": "..." },
    { "theme_id": "thought_labeling", "title": "Thought Labeling (인지적 거리두기)", "estimated_min": 6, "summary": "..." },
    { "theme_id": "micro_task_bridging", "title": "Micro-Task Bridging (실행 트리거)", "estimated_min": 5, "summary": "..." }
  ],
  "default_theme_id": "thought_labeling",
  "decision_trace": ["Intent null or unknown, using fallback (core_emotion/intensity)", "core_emotion=불안 intensity=8", "Selected default_theme_id=thought_labeling"]
}
```

### MODULE_MODE (테마 추천 전략)

| MODULE_MODE | 동작 | 설정 |
|-------------|------|------|
| lite (기본) | 규칙 기반 (키워드/강도 매칭) | `.env` 없으면 기본 |
| pro | LLM 기반 (맥락 이해) + 실패 시 Rule fallback | `MODULE_MODE=pro` |

## 3. 정상 경로 (signal_degrade=false, Qwen 시도)

Qwen API 사용 가능 시 `meta.is_failover: false`, `meta.model: "qwen-2.5-7b"` (또는 실제 모델명).  
실패 시 로컬 템플릿으로 폴백되어 `is_failover: true`, `model: "local"`.

---

## 4. 시나리오 각색 + 표정 데이터 (Scenario Adaptation + face_data)

표정 데이터(우울한 표정)가 들어갔을 때, 결과 자막의 `bridge_advice` 블록에 "표정이 많이 어두우시네요, 괜찮아요" 같은 맞춤 멘트가 포함되는지 확인.

### Request

```http
POST /api/guidance/generate
Content-Type: application/json
```

```json
{
  "intake": {
    "core_emotion": "우울",
    "situation_context": "요즘 무기력해요",
    "automatic_thought": "아무것도 하기 싫어요",
    "intensity": 6,
    "immediate_goal": "조금이라도 움직이기",
    "face_data": {
      "dominant_emotion": "sad",
      "intensity": 0.8
    }
  },
  "selected_theme_id": "self_compassion",
  "signal_degrade": false,
  "confidence": 0.7
}
```

### Expected Response (요약)

- `action_context.scenario_id`, `action_context.scenario_blocks`: 테마 `self_compassion` 시나리오 뼈대.
- `captions`: Chunk당 최대 2개. 첫 호출이면 intro + bridge_advice 또는 intro + main 등.
- `next_cursor`: 다음 Chunk 요청 시 사용. `{ "scenario_id": "self_compassion", "next_block_index": 2 }` 등.
- **bridge_advice** 블록의 `text`에 사용자 표정/감정을 반영한 맞춤 멘트 포함 가능.  
  Qwen 실패 시 Fallback으로 base_text만 사용되어 `is_failover: true`.

---

## 5. Chunk 연속 진행 (cursor=null → next_cursor → 2~3회 호출)

엔드포인트 1개 유지, cursor로 연속 Chunk 요청 시 시나리오가 진행됨.

### 1회 호출 (cursor=null, 첫 Chunk)

**Request**

```json
{
  "intake": {
    "core_emotion": "불안",
    "situation_context": "업무 과부하",
    "automatic_thought": "밀린 일이 많아요",
    "intensity": 6,
    "immediate_goal": "한 걸음만 나가기"
  },
  "selected_theme_id": "micro_task_bridging",
  "signal_degrade": false,
  "confidence": 0.7,
  "cursor": null
}
```

**Expected Response (요약)**

- `captions`: 최대 2개 (예: intro, main 또는 intro, bridge_advice).
- `next_cursor`: `{ "scenario_id": "micro_task_bridging", "next_block_index": 2 }` (다음 Chunk가 있으면).

### 2회 호출 (이전 next_cursor 전달)

**Request**

```json
{
  "intake": { ... },
  "selected_theme_id": "micro_task_bridging",
  "signal_degrade": false,
  "confidence": 0.7,
  "cursor": { "scenario_id": "micro_task_bridging", "next_block_index": 2 }
}
```

**Expected Response (요약)**

- `captions`: 다음 2블록 분량 (최대 2개).
- `next_cursor`: `{ "scenario_id": "micro_task_bridging", "next_block_index": 4 }` 또는 시나리오 끝이면 `null`.

### 3회 호출 (마지막 Chunk)

- `cursor`: 2회 호출에서 받은 `next_cursor` 전달.
- `captions`: 남은 블록(1~2개).
- `next_cursor`: `null` (시나리오 완료).

---

## 6. Timing Engine (arousal_level → hold_ms / silence_ms)

Grand Master v2: 인테이크의 각성 수준에 따라 자막 유지 시간(hold_ms)과 자막 간 침묵(silence_ms)을 보정.

### arousal_level 추정 순서

1. `intake.arousal_level` (0~1) 있으면 그대로 사용.
2. 없으면 `intake.intensity`(0~10) → `/10`으로 정규화.
3. 없으면 `intake.face_data.intensity` 또는 `face_data.arousal`.
4. 없으면 기본값 `0.5`.

### 동작

- **hold_ms**: pace로 블록별 min/mid/max 결정 후, arousal로 보정. 고각성(1에 가까움) → 더 긴 hold(진정), 저각성(0에 가까움) → 더 짧은 hold. 계수: 0.85~1.15.
- **silence_ms**: 고각성 → 1500ms, 저각성 → 700ms. 범위 500~2000ms.

### Request 예시 (arousal_level 명시)

```json
{
  "intake": {
    "core_emotion": "불안",
    "situation_context": "발표 전",
    "automatic_thought": "잘못되면 어떡하지",
    "intensity": 8,
    "arousal_level": 0.9
  },
  "selected_theme_id": "self_compassion",
  "signal_degrade": false
}
```

### Expected (요약)

- `captions[].hold_ms`: 블록 min/max 대비 arousal 보정 적용(고각성일수록 더 김).
- `silence_ms`: 약 1500 (arousal 0.9).
- `decision_trace`: `"Timing: arousal=0.90 → silence_ms=..."` 포함.

---

## 7. MODULE_MODE + TaskAtomChooser (Lite/Pro)

Grand Master v2: `config.MODULE_MODE`("lite" | "pro")로 Coach-First task_atom 선택 전략 분기.

### 설정

- 환경변수: `MODULE_MODE=lite` (기본) 또는 `MODULE_MODE=pro`
- `backend/config/settings.py`: `MODULE_MODE` 필드

### Lite (기본)

- 시나리오 `default_task` 그대로 사용. 없으면 `immediate_goal` 또는 기본문구.

### Pro

- `immediate_goal` + `situation_context` 키워드 매칭 → 구체적 task_atom (예: "물" → "물 한 잔 마시기").
- 매칭 없으면 `immediate_goal` 축약 또는 `default_task` fallback.
- 추후: user_history, KG/RAG 연동 확장.

### decision_trace 예시

```
TaskAtomChooser(lite): task_atom=한 걸음만 나가기
TaskAtomChooser(pro): task_atom=물 한 잔 마시기
```

---

## 8. Feedback Loop (Time-Sync Mechanism)

명상 종료 후 피드백 저장. "어떤 멘트가 먹혔는지" 데이터 수집.

### Request

```http
POST /api/guidance/feedback
Content-Type: application/json
```

```json
{
  "guidance_id": "uuid-from-generate-response",
  "best_moments": [1, 3, 5],
  "best_moments_detail": [
    { "seq": 1, "text": "편안하게 눈을 감고 호흡에 집중합니다." },
    { "seq": 3, "text": "괜찮아요. 천천히 숨 쉬세요." }
  ],
  "user_rating": 4,
  "session_id": "sess-xxx",
  "user_id": "user-xxx",
  "scenario_id": "self_compassion",
  "theme_id": "self_compassion"
}
```

### Expected Response

```json
{
  "ok": true,
  "trace_id": "abc123def456",
  "saved_at": "2025-01-28T12:00:00Z"
}
```

### 저장 형식 (data/guidance_feedback.jsonl)

- Lite: JSONL append만. Pro: 동일 + 추후 가중치 반영.
- `best_moments_detail`: 클라이언트가 `captions`에서 seq+text 추출해 전송.
