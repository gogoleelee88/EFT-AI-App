# 미션 설정 기능 백엔드 설정 가이드

> Phase 1 완료 후 필수 설정 사항

---

## 1. OpenAI API 키 설정

### 1.1 OpenAI API 키 발급

1. https://platform.openai.com/ 접속
2. 로그인 후 **API keys** 메뉴 이동
3. **Create new secret key** 클릭
4. 생성된 키 복사 (예: `sk-proj-...`)

### 1.2 .env 파일에 키 추가

`backend/.env` 파일을 열어서 다음 라인을 찾습니다:

```bash
# 🆕 OpenAI API 설정 (미션 설정 AI 추천용)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

`OPENAI_API_KEY=` 뒤에 복사한 키를 붙여넣습니다:

```bash
OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_KEY_HERE
OPENAI_MODEL=gpt-4o-mini
```

**주의**: API 키는 절대 Git에 커밋하지 마세요! (`.gitignore`에 `.env` 포함 확인)

---

## 2. 데이터베이스 테이블 생성

새로운 3개 테이블이 추가되었습니다:
- `micro_actions` — 미세행동 이력
- `mission_templates` — 미션 프리셋
- `places` — 장소 정보

### 2.1 자동 생성 (권장)

백엔드 서버를 실행하면 자동으로 테이블이 생성됩니다:

```bash
cd backend
python -m uvicorn main:app --reload
```

### 2.2 수동 생성 (선택)

Python 스크립트로 직접 생성:

```python
# create_tables.py
from backend.database import engine, Base
import backend.spec_loop.models  # 모든 모델 import

Base.metadata.create_all(bind=engine)
print("✅ 테이블 생성 완료!")
```

실행:
```bash
cd backend
python create_tables.py
```

---

## 3. 새로운 API 엔드포인트

### 3.1 장소 관리

```bash
# 장소 목록 조회
GET /api/spec/places?user_id=xxx

# 새 장소 등록
POST /api/spec/places
{
  "name": "스터디카페",
  "address": "서울시 강남구...",
  "gps_lat": 37.5,
  "gps_lng": 127.0,
  "wifi_ssid": "studycafe_5G",
  "verification_method": ["gps", "wifi"]
}

# 장소 수정
PUT /api/spec/places/1
{
  "name": "스터디카페 B지점"
}

# 장소 삭제
DELETE /api/spec/places/1
```

### 3.2 미세행동 조회/추천

```bash
# 특정 Task의 미세행동 이력
GET /api/spec/micro-actions?task_id=1&user_id=xxx

# AI 기반 미세행동 추천 (ChatGPT)
POST /api/spec/micro-actions/recommend?task_title=수학%20공부하기
```

### 3.3 미션 프리셋/추천

```bash
# 특정 미세행동의 미션 프리셋 조회
GET /api/spec/missions/presets?micro_action_id=42

# AI 기반 미션 추천 (ChatGPT)
POST /api/spec/missions/recommend?task_title=수학%20공부&micro_action_name=한%20문제만%20풀기
```

### 3.4 Task 최근 이력

```bash
# 최근 사용한 Task 목록 (성공률 포함)
GET /api/spec/tasks/recent?user_id=xxx&limit=10
```

### 3.5 미션 포함 DayPlan 저장

```bash
# 확장 엔드포인트 (미션 포함)
POST /api/spec/plan/day-with-mission
{
  "date": "2026-02-10",
  "mode": 70,
  "items": [
    {
      "task_title": "수학 공부하기",
      "est_minutes": 60,
      "planned_block_minutes": 25,
      "micro_steps": ["문제 풀기"],
      "micro_action": {
        "name": "한 문제만 풀기",
        "description": "1번 문제 풀이 시작",
        "start_trigger": "문제에 동그라미 치기",
        "source": "user_history"
      },
      "missions": [
        {
          "type": "photo",
          "enabled": true,
          "config": {
            "requirement": "동그라미 + 펜 + 문제집",
            "objects_required": ["pen", "book"]
          }
        }
      ],
      "missions_combination_mode": "basic",
      "alarm": {
        "time": "19:00",
        "repeat": "daily"
      }
    }
  ]
}
```

---

## 4. API 테스트

### 4.1 서버 실행

```bash
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4.2 헬스체크

```bash
curl http://localhost:8000/health
```

### 4.3 API 문서 확인

브라우저에서 열기:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

**mission** 태그 아래에 새로운 엔드포인트가 표시되는지 확인하세요.

---

## 5. 문제 해결

### OpenAI API 에러

```
❌ ChatGPT 미세행동 추천 실패: OpenAI client not available
```

**원인**: `OPENAI_API_KEY`가 설정되지 않음

**해결**:
1. `.env` 파일에서 `OPENAI_API_KEY=sk-proj-...` 확인
2. 서버 재시작
3. 폴백 모드로 작동 (규칙 기반 추천)

### Import 에러

```
ImportError: cannot import name 'MicroAction' from 'backend.spec_loop.models'
```

**원인**: `models/__init__.py`에 새 모델이 등록되지 않음

**해결**:
1. `backend/spec_loop/models/__init__.py` 확인
2. `MicroAction`, `MissionTemplate`, `Place` import 확인
3. `__all__` 리스트에 포함 확인

### 테이블 생성 실패

```
sqlalchemy.exc.OperationalError: no such table: micro_actions
```

**해결**:
```python
# 직접 테이블 생성
from backend.database import engine, Base
import backend.spec_loop.models
Base.metadata.create_all(bind=engine)
```

---

## 6. 비용 관리

### ChatGPT API 사용량 추정

| 요청 | 토큰(입력) | 토큰(출력) | 비용(gpt-4o-mini) |
|------|-----------|-----------|-------------------|
| 미세행동 추천 | ~500 | ~300 | $0.0003 |
| 미션 추천 | ~600 | ~400 | $0.0004 |
| **합계/계획 1건** | ~1,100 | ~700 | **$0.0007** |

**월 예상 비용** (일 1,000건 기준):
- $0.0007 × 1,000 × 30 = **$21/월**

### 비용 절감 팁

1. **폴백 활용**: API 키 없이도 규칙 기반 추천으로 작동
2. **캐싱**: 동일 Task에 대한 추천은 캐시 사용 (추후 구현)
3. **모델 선택**: `gpt-4o` 대신 `gpt-4o-mini` 사용 (20배 저렴)

---

## 7. 다음 단계: Phase 2 (프론트엔드)

백엔드 API가 준비되었습니다. 이제 프론트엔드를 구현하세요:

1. `frontend/src/types/mission.ts` — 타입 정의
2. `frontend/src/services/missionService.ts` — API 호출
3. `frontend/src/hooks/usePlanWizard.ts` — 위저드 상태 관리
4. `frontend/src/components/plan/` — 11개 컴포넌트 구현

자세한 내용은 `docs/미션설정_설계계획서.md`를 참고하세요.

---

## 8. 체크리스트

Phase 1 완료 확인:

- [x] MicroAction 모델 생성
- [x] MissionTemplate 모델 생성
- [x] Place 모델 생성
- [x] models/__init__.py에 등록
- [x] mission/schemas.py 작성
- [x] mission/service.py 작성
- [x] mission/router.py 작성
- [x] chatgpt_service.py 작성
- [x] planner/schemas.py 확장
- [x] planner/service.py 확장
- [x] main.py 라우터 등록
- [ ] .env에 OPENAI_API_KEY 입력 (사용자 작업)
- [ ] 서버 재시작 및 API 테스트

**Phase 1 백엔드 구축 완료! 🎉**
