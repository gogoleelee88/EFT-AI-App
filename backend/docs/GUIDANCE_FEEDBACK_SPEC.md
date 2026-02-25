# Guidance Feedback Loop - 구현 방향 (프로젝트 구조와 조화)

## 1. 현재 프로젝트 패턴 정리

| 레이어 | 패턴 | 예시 |
|--------|------|------|
| **Router** | `APIRouter(prefix="/api/xxx")`, Pydantic Req/Res | `guidance_router`, `suds` |
| **Service** | 비즈니스 로직, 저장 의존성 분리 | `suds_logger.append_suds()`, `intake_storage` |
| **Types** | `guidance_schema.py`, `chat_models.py` | GuidanceOutputState, CaptionItem |
| **Storage** | Lite: JSONL append (`data/*.jsonl`) | `suds.jsonl` |
| **MODULE_MODE** | Lite(단순 로그) vs Pro(추천 반영) | TaskAtomChooser |

---

## 2. 구현 방향 요약

```
POST /api/guidance/feedback
     ↓
GuidanceFeedbackService.append_feedback()
     ↓
data/guidance_feedback.jsonl  (Lite: append only)
     ↓ (Pro 확장 시)
Supabase / 분석 Job
```

- **기존 suds 패턴**과 동일: JSONL append + 선택적 DB 연동
- **guidance_router**에 같은 prefix로 추가 (`/api/guidance/feedback`)
- **MODULE_MODE**: Lite = 로그만, Pro = 동일 로그 + 추후 가중치 반영

---

## 3. 파일 구조 (추가/수정)

```
backend/
├── routers/
│   └── guidance_router.py      # POST /feedback 추가
├── services/
│   └── guidance_feedback_service.py   # 신규 (suds_logger 패턴)
├── types/
│   └── guidance_schema.py      # GuidanceFeedbackRequest/Response 추가
├── data/
│   └── guidance_feedback.jsonl # 신규 (append-only)
└── docs/
    └── GUIDANCE_FEEDBACK_SPEC.md  # 본 문서
```

---

## 4. API 스펙

### Request: `POST /api/guidance/feedback`

```json
{
  "guidance_id": "uuid",
  "best_moments": [1, 3, 5],
  "best_moments_detail": [
    { "seq": 1, "text": "어깨에 힘을 빼세요" },
    { "seq": 3, "text": "괜찮아요. 천천히 숨 쉬세요" }
  ],
  "user_rating": 4,
  "session_id": "sess-xxx",
  "user_id": "user-xxx",
  "scenario_id": "anxiety_deep",
  "theme_id": "self_compassion"
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| guidance_id | O | 어떤 명상 세션인지 (generate 응답의 guidance_id) |
| best_moments | O | 표정/수동 피드백으로 좋아진 자막의 seq 리스트 |
| best_moments_detail | - | seq + text (어떤 멘트가 먹혔는지 분석용) |
| user_rating | O | 1~5 별점 |
| session_id | - | 세션 ID (있으면) |
| user_id | - | 사용자 ID (로그인 시) |
| scenario_id | - | action_context에서 전달 |
| theme_id | - | 선택된 테마 |

### Response

```json
{
  "ok": true,
  "trace_id": "abc123",
  "saved_at": "2025-01-28T12:00:00Z"
}
```

---

## 5. JSONL 저장 형식 (suds.jsonl 패턴)

```json
{
  "trace_id": "abc123",
  "guidance_id": "uuid",
  "best_moments": [1, 3, 5],
  "best_moments_detail": [
    { "seq": 1, "text": "어깨에 힘을 빼세요" },
    { "seq": 3, "text": "괜찮아요. 천천히 숨 쉬세요" }
  ],
  "user_rating": 4,
  "session_id": "sess-xxx",
  "user_id": "user-xxx",
  "scenario_id": "anxiety_deep",
  "theme_id": "self_compassion",
  "saved_at": "2025-01-28T12:00:00Z",
  "timestamp": "2025-01-28T12:00:00Z"
}
```

- **Lite**: 위 형식으로 JSONL append
- **Pro**: 동일 로그 + 추후 `best_moments_detail` 기반 theme/caption 가중치 업데이트

---

## 6. guidance_id와 captions 관계

- `guidance_id`는 generate 시마다 새로 생성되며 **서버에 저장하지 않음**
- 피드백 시 "어떤 멘트가 먹혔는지"를 알려면 **클라이언트가 캡션 정보를 함께 전송**해야 함
- `best_moments_detail`: 클라이언트가 `GuidanceOutputState.captions`에서 seq + text를 추출해 전송

---

## 7. 프론트엔드 연동 흐름

1. `/api/guidance/generate` 호출 → `guidance_id`, `captions` 수신
2. 명상 재생 중: seq별로 표정 변화 감지 또는 수동 "이 순간 좋았어요" 버튼
3. 종료 시: `best_moments` = 표정/수동 피드백된 seq 목록
4. `best_moments_detail` = `captions`에서 해당 seq의 `{seq, text}` 추출
5. `POST /api/guidance/feedback` 전송

---

## 8. MODULE_MODE 분기

| 모드 | 현재 동작 | 추후 확장 |
|------|-----------|-----------|
| Lite | JSONL append만 | - |
| Pro | 동일 | JSONL/DB 기반 theme·caption 가중치 → 추천 반영 |

---

## 9. 구현 순서 제안

1. `guidance_schema.py`: `GuidanceFeedbackRequest`, `GuidanceFeedbackResponse` 추가
2. `guidance_feedback_service.py`: `append_feedback()` (suds_logger 패턴)
3. `guidance_router.py`: `POST /feedback` 엔드포인트 추가
4. `guidance_smoke_test.md`: §8 Feedback 예시 추가

---

## 10. 프라이버시 고려

- `best_moments` / `user_rating`: 서비스 개선·추천용 데이터
- 표정 기반 수집 시 **명시적 동의** 필요 (온보딩 또는 설정)
- 수동 "좋았어요" 버튼만 사용 시 동의 요건 상대적으로 완화
