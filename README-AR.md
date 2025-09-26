# EFT AR 모듈 사용 가이드

## 설치 및 설정

### 1. 필수 모델 파일 다운로드
```bash
# public/models/ 폴더에 다음 파일들을 배치하세요:
# - pose_landmarker_lite.task (필수)
# - face_landmarker.task (선택)
```

모델 파일은 [MediaPipe Models](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker/index#models)에서 다운로드할 수 있습니다.

### 2. 기본 사용법

```tsx
import { ARSession } from '@/modules/ar';
import samplePlan from '@/modules/ar/sample-plan.json';

function MyARPage() {
  return (
    <div className="container mx-auto p-4">
      <ARSession 
        plan={samplePlan}
        autoPlay={true}
        enableTTS={true}
        enableSmoothing={true}
      />
    </div>
  );
}
```

## 주요 기능

### ARSession 컴포넌트
- **plan**: EFT 세션 플랜 (JSON)
- **autoPlay**: 자동 재생 여부 (기본: true)
- **enableTTS**: 음성 안내 활성화 (기본: true)
- **enableSmoothing**: 좌표 스무딩 활성화 (기본: true)

### EFT 포인트 타입
- `brow`: 눈썹 시작점
- `side_eye`: 눈 옆
- `under_eye`: 눈 밑
- `under_nose`: 코 밑
- `chin`: 턱
- `clavicle`: 쇄골 중앙
- `under_arm`: 겨드랑이 아래
- `top_head`: 정수리

### 세션 플랜 구조
```json
{
  "title": "세션 제목",
  "steps": [
    {
      "point": "brow",
      "side": "left",
      "durationSec": 5,
      "tip": "짧은 안내 메시지"
    }
  ]
}
```

## 개발자 가이드

### 커스텀 훅 사용
```tsx
import { useCamera, usePose, useStepPlayer } from '@/modules/ar';

function CustomARComponent() {
  const camera = useCamera();
  const pose = usePose();
  const player = useStepPlayer(plan);
  
  // 커스텀 로직 구현
}
```

### 포즈 매핑 커스터마이징
```tsx
import { mapEFTPoint } from '@/modules/ar';

// 커스텀 포인트 계산
const customPoint = mapEFTPoint(
  { landmarks }, 
  'brow', 
  'left'
);
```

## 트러블슈팅

### 카메라 권한 오류
- 브라우저 설정에서 카메라 권한 허용
- HTTPS 환경에서만 정상 작동

### 포즈 검출 안됨
- 조명이 충분한 환경에서 사용
- 카메라에서 1-2m 거리 유지
- 얼굴과 어깨가 화면에 보이도록 조정

### 성능 최적화
- `enableSmoothing=false`로 설정하여 성능 향상
- 낮은 해상도 카메라 설정 사용
- 불필요한 리렌더링 방지

## 추가 개발

### AI 세션 플랜 생성
vLLM 등을 사용하여 사용자 상담 결과를 바탕으로 자동 세션 플랜 생성:

```bash
# 시스템 프롬프트
"당신은 EFT 코치입니다. 사용자 감정/상황을 보고 EFT 세션 계획을 JSON으로 만듭니다..."

# 유저 입력
"내일 면접이 있어 불안하고 심장이 빨리 뛰어요."
```

### 라우팅 통합
```tsx
// pages/ar/session.tsx
import { ARSession } from '@/modules/ar';

export default function ARSessionPage() {
  const [plan, setPlan] = useState(null);
  
  useEffect(() => {
    // 백엔드에서 세션 플랜 가져오기
    fetchSessionPlan().then(setPlan);
  }, []);

  return plan ? <ARSession plan={plan} /> : <Loading />;
}
```