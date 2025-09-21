# 빠른 참조: AI → EFT 연동 시스템

## 🚀 **빠른 테스트 URL**

### **기본 테스트**
```
http://localhost:5173/ar-holistic?emotion=stress&intensity=7&points=TH,EB,UE&duration=30&rounds=2
```

### **고급 테스트 (확언 포함)**
```
http://localhost:5173/ar-holistic?emotion=anxiety&intensity=8&points=EB,SE-L,SE-R,UE,CH&duration=45&rounds=3&tempo=55&side=both&affirm=나는%20안전하고%20평온합니다
```

### **프리셋 테스트**
```
http://localhost:5173/ar-holistic?preset=short&emotion=stress&intensity=6&duration=60
```

## 📋 **지원되는 파라미터**

| 파라미터 | 타입 | 범위 | 기본값 | 설명 |
|---------|------|------|---------|------|
| `emotion` | string | anger,anxiety,sadness,stress,fear,etc | stress | 감정 키 |
| `intensity` | number | 0-10 | 6 | 감정 강도 (SUDS) |
| `points` | string | TH,EB,SE-L,SE-R,UE,UN,CH,CB | 전체 | 탭핑 포인트 (쉼표 구분) |
| `duration` | number | 15-600 | 60 | 라운드당 지속시간 (초) |
| `rounds` | number | 1-20 | 3 | 라운드 수 |
| `tempo` | number | 30-120 | 50 | 가이드 템포 (BPM) |
| `side` | string | both,left,right | both | 좌우 선택 |
| `affirm` | string | any | - | 확언 문구 (URL 인코딩) |
| `preset` | string | full,short,upper | - | 포인트 프리셋 |

## 🎯 **포인트 코드 참조**

| 코드 | 한국어 | 영어 | 위치 |
|------|--------|------|------|
| `TH` | 정수리 | Top of Head | 머리 위 |
| `EB` | 눈썹 | Eyebrow | 눈썹 시작점 |
| `SE-L` | 눈 옆 (좌) | Side of Eye (Left) | 왼쪽 눈꼬리 |
| `SE-R` | 눈 옆 (우) | Side of Eye (Right) | 오른쪽 눈꼬리 |
| `UE` | 눈 밑 | Under Eye | 눈 아래 |
| `UN` | 코 밑 | Under Nose | 코 아래 |
| `CH` | 턱 | Chin | 턱 아래 |
| `CB` | 쇄골 | Collarbone | 쇄골 부위 |

## ⚠️ **주의사항**

### **제거된 포인트**
- ❌ `UA` (겨드랑이) - ARHolisticTest에서 미지원
- ❌ `wrist` (손목) - 매핑 제거됨

### **자동 변환**
- ✅ `SE` → `SE-L,SE-R` (자동 확장)
- ✅ `unknown_point` → 제거 + 콘솔 경고

## 🔧 **개발자 도구**

### **콘솔 디버깅**
```javascript
// 브라우저 콘솔에서 현재 파라미터 확인
console.log(window.location.search);

// 파라미터 객체로 파싱
const params = new URLSearchParams(window.location.search);
console.log(Object.fromEntries(params));
```

### **빠른 파라미터 생성**
```javascript
function generateARURL(emotion, intensity, points, duration = 60) {
  const params = new URLSearchParams({
    emotion,
    intensity: String(intensity),
    points: Array.isArray(points) ? points.join(',') : points,
    duration: String(duration),
    rounds: '3',
    tempo: '50',
    side: 'both'
  });
  return `/ar-holistic?${params.toString()}`;
}

// 사용 예시
const url = generateARURL('anxiety', 8, ['EB', 'UE', 'CH'], 45);
console.log(url);
```

## 🎨 **UI 상태 확인**

### **화면 요소 위치**
- **좌상단**: 감정/강도 pill
- **좌상단 아래**: 라운드/시간 pill
- **중앙**: 확언 텍스트 (래핑)
- **중앙 하단**: 현재 포인트 표시
- **포인트 위치**: 노란색 펄스 = 현재 포인트

### **예상 표시 내용**
```
[좌상단] 감정: anxiety (8/10)
[좌상단 아래] 라운드: 2/3 (25s / 45s)
[중앙] 나는 안전하고 평온합니다
[중앙 하단] 현재 포인트: UE
[포인트] 노란색 펄스 글로우 (UE 위치)
```

## 🐛 **문제 해결**

### **자주 발생하는 이슈**

#### 1. 파라미터가 적용 안 됨
```bash
# 해결: URL 인코딩 확인
확언="나는 안전하다" → affirm=%EB%82%98%EB%8A%94%20%EC%95%88%EC%A0%84%ED%95%98%EB%8B%A4
```

#### 2. 포인트가 안 보임
```bash
# 해결: 지원되는 포인트인지 확인
UA (겨드랑이) → 제거됨, CB (쇄골) 사용
wrist (손목) → 제거됨, CH (턱) 사용
```

#### 3. 파라미터 파싱 실패
```bash
# 해결: 타입과 범위 확인
intensity: "high" → intensity: 8 (숫자)
duration: 1000 → duration: 600 (최대값)
```

### **디버깅 체크리스트**
- [ ] URL 파라미터가 올바른 형식인가?
- [ ] 포인트가 지원되는 코드인가?
- [ ] 숫자 파라미터가 범위 내인가?
- [ ] 확언이 URL 인코딩되었나?
- [ ] 브라우저 콘솔에 경고가 있나?

## 📞 **지원 및 문의**

### **로그 위치**
- 브라우저 개발자 도구 → Console
- `[EFT]` 접두사로 시작하는 경고/에러 확인

### **테스트 도구**
- URL 파라미터 테스터: `URLSearchParams` 사용
- 포인트 검증: `ALLOWED_POINTS.has()` 함수
- 정규화 테스트: `normalizePoints()` 함수

---

**🎯 빠른 시작**: 위의 테스트 URL을 복사해서 주소창에 붙여넣으면 즉시 맞춤화된 AR 세션을 체험할 수 있습니다!