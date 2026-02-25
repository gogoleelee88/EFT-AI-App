# Phase 6: 실제 인증 로직 구현 설계

> 작성일: 2026-02-10
> 미션 검증 시스템 설계

---

## 📋 목표

Phase 1~5에서 **미션 설정**이 완성되었습니다.
Phase 6에서는 **실제 미션 검증 및 알람 해제**를 구현합니다.

---

## 1. 전체 아키텍처

```
알람 시간 도달
  ↓
알람 UI 표시 (전체 화면 또는 푸시)
  ↓
사용자 미션 수행
  ↓
미션 검증 시스템
  ├─ 사진 인증: 업로드 → OCR/객체 검출
  ├─ 장소 인증: GPS/Wi-Fi 확인
  └─ 시간 확인: 화면 캡처/사진
  ↓
미션 조합 모드 판정
  ├─ strict: 모두 통과 필요
  ├─ basic: 사진만 통과
  └─ flexible: 1개만 통과
  ↓
알람 해제 OR 재시도
  ↓
결과 저장 (성공률 업데이트)
```

---

## 2. 백엔드 설계

### 2.1 새 모델: MissionResult

```python
class MissionResult(Base):
    """미션 수행 결과"""
    __tablename__ = "mission_results"

    result_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id"), nullable=False, index=True)
    mission_template_id = Column(Integer, ForeignKey("mission_templates.mission_template_id"), nullable=True)

    # 미션 정보
    mission_type = Column(String(32), nullable=False)  # photo | location | time_check
    
    # 검증 결과
    passed = Column(Boolean, nullable=False)  # 통과 여부
    score = Column(Float, nullable=True)  # 신뢰도 점수 (0.0~1.0)
    
    # 검증 증거 (JSON)
    evidence = Column(JSON, nullable=True)
    # photo: { image_url, ocr_result[], detected_objects[], confidence }
    # location: { gps: {lat, lng, distance_m}, wifi_matched, bluetooth_matched }
    # time_check: { screenshot_url, app_detected, file_opened, file_modified_at }
    
    # 메타데이터
    attempted_at = Column(DateTime(timezone=True), server_default=func.now())
    verified_at = Column(DateTime(timezone=True), nullable=True)
```

### 2.2 새 API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/spec/missions/verify/photo` | 사진 업로드 → OCR/객체 검출 검증 |
| POST | `/api/spec/missions/verify/location` | GPS/Wi-Fi 위치 검증 |
| POST | `/api/spec/missions/verify/time` | 화면 캡처 검증 |
| POST | `/api/spec/missions/check-alarm` | 알람 해제 가능 여부 판정 |
| POST | `/api/spec/missions/dismiss-alarm` | 알람 해제 및 결과 저장 |

### 2.3 사진 검증 서비스 (ChatGPT Vision)

```python
# backend/services/vision_service.py

async def verify_photo_mission(
    image_file: UploadFile,
    requirement: str,
    ocr_keywords: list[str] = None,
    objects_required: list[str] = None
) -> dict:
    """ChatGPT Vision API로 사진 검증"""
    
    # 1. 이미지 Base64 인코딩
    image_data = await image_file.read()
    base64_image = base64.b64encode(image_data).decode()
    
    # 2. ChatGPT Vision API 호출
    prompt = f"""이 사진이 다음 요구사항을 만족하는지 검증하세요:

요구사항: {requirement}
필요 키워드: {ocr_keywords}
필요 객체: {objects_required}

JSON 형식으로 응답:
{{
  "passed": true/false,
  "confidence": 0.0~1.0,
  "detected_text": ["텍스트1", "텍스트2"],
  "detected_objects": ["object1", "object2"],
  "reason": "검증 결과 설명"
}}"""

    response = await openai.chat.completions.create(
        model="gpt-4o",  # Vision 지원 모델
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        response_format={"type": "json_object"},
        max_tokens=500
    )
    
    result = json.loads(response.choices[0].message.content)
    return result
```

### 2.4 GPS 검증 서비스

```python
# backend/services/location_service.py

def verify_location_mission(
    current_gps: dict,  # {lat, lng}
    target_place: Place
) -> dict:
    """GPS 거리 계산 및 검증"""
    
    from math import radians, cos, sin, asin, sqrt
    
    # Haversine 공식으로 거리 계산
    lat1, lon1 = radians(current_gps["lat"]), radians(current_gps["lng"])
    lat2, lon2 = radians(target_place.gps_lat), radians(target_place.gps_lng)
    
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    distance_m = 6371000 * c  # 지구 반지름(m)
    
    passed = distance_m <= target_place.gps_radius
    
    return {
        "passed": passed,
        "distance_m": round(distance_m, 1),
        "radius_m": target_place.gps_radius,
        "confidence": 1.0 if passed else 0.0
    }
```

### 2.5 알람 해제 판정 로직

```python
# backend/services/alarm_service.py

def check_alarm_dismissal(
    mission_results: list[MissionResult],
    combination_mode: str
) -> bool:
    """미션 조합 모드에 따라 알람 해제 가능 여부 판정"""
    
    passed_missions = [r for r in mission_results if r.passed]
    total_missions = len(mission_results)
    
    if combination_mode == "strict":
        # 모든 미션 통과 필요
        return len(passed_missions) == total_missions
    
    elif combination_mode == "basic":
        # 사진 미션만 통과하면 OK
        photo_missions = [r for r in mission_results if r.mission_type == "photo"]
        if photo_missions:
            return all(r.passed for r in photo_missions)
        return len(passed_missions) >= 1
    
    elif combination_mode == "flexible":
        # 아무 1개만 통과
        return len(passed_missions) >= 1
    
    return False
```

---

## 3. 프론트엔드 설계

### 3.1 새 컴포넌트

```
frontend/src/components/alarm/
  ├── AlarmOverlay.tsx           ← 알람 전체 화면
  ├── MissionVerificationUI.tsx  ← 미션 검증 UI
  ├── PhotoUploadForm.tsx        ← 사진 업로드 폼
  ├── LocationCheckForm.tsx      ← 위치 확인 폼
  └── MissionResultSummary.tsx   ← 검증 결과 요약
```

### 3.2 AlarmOverlay.tsx 구조

```typescript
interface AlarmOverlayProps {
  task: string;
  microAction: string;
  missions: MissionConfig[];
  combinationMode: MissionCombinationMode;
  onDismiss: () => void;
}

// UI 구조
┌──────────────────────────────────┐
│ ⏰ 알람: 수학 공부하기            │
├──────────────────────────────────┤
│ 🎯 한 문제만 풀기                │
│ • 문제에 동그라미 치기            │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ 미션 완료하기                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│ □ 미션1: 📸 사진 인증            │
│   [사진 찍기]                    │
│                                  │
│ □ 미션2: 📍 장소 인증            │
│   [위치 확인]                    │
│                                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                  │
│ [나중에 하기] [미션 완료]        │
│                                  │
└──────────────────────────────────┘
```

---

## 4. 구현 순서

### Step 1: 백엔드 미션 검증 인프라
- [x] MissionResult 모델 생성
- [ ] vision_service.py (ChatGPT Vision)
- [ ] location_service.py (GPS 거리 계산)
- [ ] alarm_service.py (알람 해제 판정)
- [ ] 파일 업로드 엔드포인트

### Step 2: 백엔드 검증 API
- [ ] POST /api/spec/missions/verify/photo
- [ ] POST /api/spec/missions/verify/location
- [ ] POST /api/spec/missions/check-alarm
- [ ] POST /api/spec/missions/dismiss-alarm

### Step 3: 프론트엔드 미션 검증 UI
- [ ] AlarmOverlay.tsx (알람 화면)
- [ ] PhotoUploadForm.tsx (사진 업로드)
- [ ] LocationCheckForm.tsx (위치 확인)
- [ ] MissionResultSummary.tsx (결과 요약)

### Step 4: 알람 스케줄러 (선택)
- [ ] 백엔드 Cron/Scheduler
- [ ] 푸시 알림 (FCM)
- [ ] 알람 UI 트리거

---

## 5. 기술 스택

### 사진 검증
- **ChatGPT Vision API** (gpt-4o)
- 이미지 → Base64 인코딩
- OCR + 객체 검출 → JSON 응답

### GPS 검증
- **Haversine 공식** (지구 표면 거리 계산)
- 브라우저 Geolocation API
- 정확도: ±30m

### 파일 저장
- **Firebase Storage** 또는 로컬 저장
- 이미지 압축 (1MB 이하)
- 보안: 사용자별 디렉토리

---

## 6. 비용 추정 (ChatGPT Vision)

| 항목 | 비용 |
|------|------|
| 사진 검증 1회 | ~$0.01 (gpt-4o Vision) |
| 일 100회 | $1/일 |
| 월 예상 | **$30/월** |

**절감 방안**:
- 기본 객체 검출은 로컬 (TensorFlow.js)
- Vision API는 최종 검증만 사용
- 캐싱: 동일 사진 재검증 방지

---

이제 Phase 6를 구현하시겠습니까?
