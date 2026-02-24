# 감정/채팅 로그 → user_profile 동기화 규격

EFT 앱에서 감정 로그·채팅 로그·세션 피드백을 넘겨줄 때의 **이벤트 스키마**, **user_profile 필드 매핑**, **호출 시점**을 정의한다.

---

## 1. 목표

- EFT 앱(프론트/백엔드)에서 발생하는 **감정 체크인**, **AI 대화**, **명상/EFT 세션 피드백**을 이벤트로 전달받아
- resume-os(또는 동기화 서비스)의 **user_profile** 중 아래 필드를 갱신한다.
  - **emotion_patterns_json**: 감정 패턴 (주요 기분, 트리거, 주간 추이)
  - **frequent_concerns_json**: 자주 하는 고민 (키워드/주제, 횟수)
  - **emotion_chat_patterns_json**: 스트레스 트리거, 자주 나오는 키워드, 기분 추이
  - **effective_eft_json**: 효과 있었던 EFT/명상 유형 (세션 피드백 기반)

---

## 2. 이벤트 스키마 (EFT 앱 → 동기화 대상)

EFT 앱이 **동기화 API**에 보내는 이벤트는 공통 헤더 + 타입별 payload 를 갖는다.

### 2.1 공통 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `event_id` | string | 권장 | 이벤트 고유 ID (중복 전송 방지) |
| `user_id` | string | O | 사용자 식별자 (Firebase UID 등) |
| `type` | string | O | 이벤트 타입 (아래 표 참고) |
| `ts` | number | O | 발생 시각 (Unix ms) |
| `payload` | object | O | 타입별 payload |
| `source` | string | 선택 | `"eft_app"` / `"resume_os"` 등 출처 |

### 2.2 이벤트 타입별 payload

#### EMOTION_CHECKIN (감정 체크인)

사용자가 감정 체크인을 완료했을 때 1건 전송.

```json
{
  "event_id": "evt_xxx",
  "user_id": "user_abc",
  "type": "EMOTION_CHECKIN",
  "ts": 1707000000000,
  "payload": {
    "mood": "stress",
    "intensity": 7,
    "label_ko": "스트레스",
    "situation_note": "업무 마감 압박",
    "tags": ["업무", "마감", "압박"]
  }
}
```

| payload 필드 | 타입 | 필수 | 설명 |
|--------------|------|------|------|
| `mood` | string | O | 감정 코드 (stress, anxiety, sad, calm, happy, ...) |
| `intensity` | number | O | 1–10 강도 |
| `label_ko` | string | 선택 | 한글 라벨 |
| `situation_note` | string | 선택 | 사용자 입력 상황 메모 |
| `tags` | string[] | 선택 | 상황/원인 태그 (키워드 추출용) |

#### CHAT_MESSAGE (AI 대화 메시지)

대화 한 턴당 1건. 사용자 발화만 보내도 되고, AI 응답까지 포함해도 됨.

**사용자 발화:**

```json
{
  "event_id": "evt_yyy",
  "user_id": "user_abc",
  "type": "CHAT_MESSAGE",
  "ts": 1707000060000,
  "payload": {
    "role": "user",
    "text": "요즘 회사 일이 너무 많아서 잠도 못 자요.",
    "session_id": "sess_001",
    "turn_index": 1
  }
}
```

**AI 응답 (선택):**

```json
{
  "type": "CHAT_MESSAGE",
  "payload": {
    "role": "assistant",
    "text": "잠을 못 주무시는 게 힘드시겠어요. ...",
    "session_id": "sess_001",
    "turn_index": 2
  }
}
```

| payload 필드 | 타입 | 필수 | 설명 |
|--------------|------|------|------|
| `role` | string | O | `"user"` \| `"assistant"` |
| `text` | string | O | 발화/응답 텍스트 |
| `session_id` | string | 선택 | 대화 세션 ID |
| `turn_index` | number | 선택 | 턴 순서 |

#### CHAT_SESSION_END (대화 세션 종료)

한 대화 세션이 끝났을 때 1건. 요약/키워드가 있으면 함께 보낸다.

```json
{
  "event_id": "evt_zzz",
  "user_id": "user_abc",
  "type": "CHAT_SESSION_END",
  "ts": 1707003600000,
  "payload": {
    "session_id": "sess_001",
    "turn_count": 8,
    "extracted_keywords": ["업무", "수면", "스트레스", "마감"],
    "extracted_concerns": ["일이 많음", "잠 못 잠"],
    "dominant_mood": "stress"
  }
}
```

| payload 필드 | 타입 | 필수 | 설명 |
|--------------|------|------|------|
| `session_id` | string | O | 세션 ID |
| `turn_count` | number | 선택 | 턴 수 |
| `extracted_keywords` | string[] | 선택 | 추출 키워드 (EFT 앱/백엔드에서 분석) |
| `extracted_concerns` | string[] | 선택 | 추출된 고민 주제 |
| `dominant_mood` | string | 선택 | 세션 내 주된 감정 |

#### EFT_SESSION_FEEDBACK (명상/EFT 세션 피드백)

사용자가 세션 완료 후 피드백을 남겼을 때 1건.

```json
{
  "event_id": "evt_fff",
  "user_id": "user_abc",
  "type": "EFT_SESSION_FEEDBACK",
  "ts": 1707007200000,
  "payload": {
    "session_type": "stress_release_eft",
    "session_id": "eft_sess_001",
    "mood_before": 4,
    "mood_after": 7,
    "helpfulness": 5,
    "would_repeat": true,
    "note": "호흡이 도움이 됐어요"
  }
}
```

| payload 필드 | 타입 | 필수 | 설명 |
|--------------|------|------|------|
| `session_type` | string | O | 세션 유형 (stress_release_eft, box_breathing, ...) |
| `session_id` | string | 선택 | 세션 ID |
| `mood_before` | number | 선택 | 세션 전 기분 (1–10) |
| `mood_after` | number | 선택 | 세션 후 기분 (1–10) |
| `helpfulness` | number | 선택 | 도움됨 정도 (1–5 등) |
| `would_repeat` | boolean | 선택 | 다시 할 의향 |
| `note` | string | 선택 | 사용자 메모 |

---

## 3. user_profile 필드 매핑

동기화 쪽에서 위 이벤트를 받아 **user_profile** 의 다음 필드를 갱신한다.

### 3.1 emotion_patterns_json

| 목표 필드 | 채우는 이벤트 | 로직 예시 |
|-----------|----------------|-----------|
| `dominantMoods` | EMOTION_CHECKIN, CHAT_SESSION_END | mood / dominant_mood 빈도 집계 → 상위 N개 |
| `triggers` | EMOTION_CHECKIN.tags, CHAT_SESSION_END.extracted_keywords | 태그/키워드 빈도 → “트리거” 후보 |
| `weeklyTrend` | EMOTION_CHECKIN (날짜별) | 요일별/주간 평균 intensity 또는 mood 분포 |

**구조 예시 (갱신 후):**

```json
{
  "dominantMoods": [
    { "mood": "stress", "count": 12, "lastTs": 1707000000000 },
    { "mood": "anxiety", "count": 5, "lastTs": 1706900000000 }
  ],
  "triggers": [
    { "tag": "업무", "count": 8 },
    { "tag": "수면", "count": 4 }
  ],
  "weeklyTrend": [
    { "dow": 1, "avgIntensity": 6.2, "dominantMood": "stress" }
  ]
}
```

### 3.2 frequent_concerns_json

| 목표 필드 | 채우는 이벤트 | 로직 예시 |
|-----------|----------------|-----------|
| 항목 | CHAT_SESSION_END.extracted_concerns, CHAT_MESSAGE(role=user) 분석 | 고민 문구/키워드 빈도 집계 |

**구조 예시:**

```json
[
  { "concern": "일이 많음", "count": 5, "lastAt": 1707003600000 },
  { "concern": "잠 못 잠", "count": 3, "lastAt": 1707000000000 }
]
```

### 3.3 emotion_chat_patterns_json

| 목표 필드 | 채우는 이벤트 | 로직 예시 |
|-----------|----------------|-----------|
| `stressTriggers` | EMOTION_CHECKIN.tags, CHAT_SESSION_END.extracted_keywords | intensity 높은 체크인/세션의 태그·키워드 |
| `frequentKeywords` | CHAT_MESSAGE(role=user), CHAT_SESSION_END.extracted_keywords | 키워드/엔티티 빈도 |
| `moodTrends` | EMOTION_CHECKIN (시계열) | 일별/주별 mood·intensity 추이 |

**구조 예시:**

```json
{
  "stressTriggers": ["업무", "마감", "수면부족"],
  "frequentKeywords": [
    { "keyword": "회사", "count": 10 },
    { "keyword": "잠", "count": 7 }
  ],
  "moodTrends": [
    { "date": "2026-02-01", "avgIntensity": 6, "dominantMood": "stress" }
  ]
}
```

### 3.4 effective_eft_json

| 목표 필드 | 채우는 이벤트 | 로직 예시 |
|-----------|----------------|-----------|
| 항목 | EFT_SESSION_FEEDBACK | session_type 별 helpfulness / mood 개선 / would_repeat 집계 |

**구조 예시:**

```json
[
  { "sessionType": "stress_release_eft", "feedbackScore": 4.5, "count": 10, "avgMoodGain": 2.1 },
  { "sessionType": "box_breathing", "feedbackScore": 4.0, "count": 5, "avgMoodGain": 1.8 }
]
```

---

## 4. 호출 시점 (동기화 트리거)

EFT 앱과 동기화 계층이 어떻게 붙는지에 따라 다음 중 하나 또는 조합으로 사용한다.

### 4.1 실시간 푸시 (이벤트 발생 시마다)

- **대상**: EMOTION_CHECKIN, EFT_SESSION_FEEDBACK
- **시점**: 감정 체크인 제출 직후, 세션 피드백 제출 직후
- **방식**: EFT 앱(또는 백엔드)이 이벤트 1건씩 **동기화 API**로 POST → 수신 측에서 해당 user_id 에 대해 **emotion_patterns / effective_eft** 등만 갱신 후 **upsertProfile** 호출

### 4.2 세션 단위 (대화 세션 종료 시)

- **대상**: CHAT_SESSION_END
- **시점**: 한 대화 세션을 사용자가 종료했을 때, 또는 일정 시간 무응답 후 자동 종료 시 1건
- **방식**: payload 에 **extracted_keywords**, **extracted_concerns**, **dominant_mood** 를 넣어 전송 → 수신 측에서 **emotion_patterns**, **frequent_concerns**, **emotion_chat_patterns** 갱신 후 **upsertProfile**

### 4.3 배치 (주기적 일괄)

- **대상**: EMOTION_CHECKIN, CHAT_MESSAGE, CHAT_SESSION_END, EFT_SESSION_FEEDBACK 전부
- **시점**: 예) 매일 00:10, 또는 주 1회
- **방식**: EFT 앱(또는 백엔드)이 “지난 N일 이벤트”를 **동기화 API**로 일괄 전송 → 수신 측에서 전부 파싱 후 **derive + upsertProfile** 한 번에 실행

### 4.4 권장 조합

- **실시간**: EMOTION_CHECKIN, EFT_SESSION_FEEDBACK → 바로 **upsertProfile** 로 emotion_patterns, effective_eft 반영
- **세션 단위**: CHAT_SESSION_END → emotion_chat_patterns, frequent_concerns 반영
- **배치**: 새벽 1회 → 위 이벤트 전부로 **emotion_patterns / weeklyTrend** 등 재계산 후 **upsertProfile** (중복/누락 정리용)

---

## 5. 동기화 API (수신 측) 요구 사항

- **엔드포인트 예시**: `POST /api/sync/profile-events` (또는 EFT 앱이 호출할 URL)
- **Request body**: `{ "user_id": "user_abc", "events": [ { "event_id", "type", "ts", "payload" }, ... ] }`
- **중복 처리**: `event_id` 기준으로 이미 처리한 이벤트는 스킵
- **처리 순서**: 이벤트를 ts 기준 정렬 후 순서대로 적용하면, 같은 user_profile 행에 **upsertProfile** 로 필드만 병합 갱신

---

## 6. resume-os 측 구현 시 참고

- **user_profile** 갱신은 **userProfileRepo.upsertProfile(userId, updates, cb)** 만 사용하면 됨.
- EFT 앱에서 이벤트를 **파일/DB/HTTP** 등 어떤 경로로 넘기든, “이벤트 스키마 → updates 객체” 변환만 위 규격에 맞추면, 동일한 **user_profile** 행에 **emotion_patterns**, **frequent_concerns**, **emotion_chat_patterns**, **effective_eft** 를 계속 병합할 수 있다.
- **deriveProfileFromData** 는 지금처럼 로컬 events/nudges/daily_user_profile 만 사용하는 “로컬 전용” 유도 함수로 두고, EFT 쪽 이벤트는 **별도 수신 파이프라인**에서 위 매핑 규칙으로 **updates** 를 만든 뒤 **upsertProfile** 에 넘기는 구조로 분리하면 된다.
