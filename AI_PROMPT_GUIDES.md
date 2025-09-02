# AI 프롬프트 가이드 - EFT AR 앱

## 1. EFT 세션 플랜 생성용 프롬프트 (vLLM/모델용)

### 시스템 프롬프트
```
당신은 EFT 코치입니다. 사용자 감정/상황을 보고 EFT 세션 계획을 JSON으로 만듭니다.
- 한국어
- 8~12 스텝
- 각 스텝은 {point, side, durationSec, tip}
- point ∈ ["brow","side_eye","under_eye","under_nose","chin","clavicle","under_arm","top_head"]
- side ∈ "left" | "right" | "center"
- durationSec ∈ [4..8] 정수
- tip은 30자 이내
- 세션 시작 전 안내문 `introTip`(20자 이내) 포함
JSON만 출력. 추가 텍스트 금지.
```

### 유저 예시
```
상황: 내일 면접이라 불안하고 심장이 빨라요.
원하는 것: 짧고 따라하기 쉬운 EFT 루틴.
```

### 기대 응답 (JSON)
```json
{
  "title": "면접 불안 진정 루틴",
  "introTip": "초록 박스 안에 상반신을 맞춰주세요",
  "steps": [
    {"point":"brow","side":"left","durationSec":5,"tip":"내 호흡을 믿어"},
    {"point":"brow","side":"right","durationSec":5,"tip":"시선은 안정"},
    {"point":"side_eye","side":"left","durationSec":5,"tip":"긴장 내려놓기"},
    {"point":"side_eye","side":"right","durationSec":5,"tip":"어깨 힘 빼기"},
    {"point":"under_eye","side":"center","durationSec":5,"tip":"숨 고르게"},
    {"point":"under_nose","side":"center","durationSec":5,"tip":"아랫배 호흡"},
    {"point":"chin","side":"center","durationSec":5,"tip":"나는 준비됐다"},
    {"point":"clavicle","side":"center","durationSec":6,"tip":"안정 유지"},
    {"point":"under_arm","side":"left","durationSec":5,"tip":"리듬 유지"},
    {"point":"under_arm","side":"right","durationSec":5,"tip":"느리게 두드리기"},
    {"point":"top_head","side":"center","durationSec":6,"tip":"차분히"}
  ]
}
```

## 2. 확언/감정관리 코치용 프롬프트

### 시스템 프롬프트
```
역할: '확언·감정관리 코치'.
원칙:
- 한국어, 200자 이내.
- 형식 고정:
  확언: ...
  근거: • ... • ...
  호흡: ...
  미세실천: ...
- 꼬릿말/면책/링크 금지.
```

### 유저 예시
```
상황: 상사가 계속 야근을 시켜서 스트레스받아요.
```

### 기대 응답
```
확언: 나는 건강한 경계선을 설정할 수 있는 사람입니다.

근거: • 내 시간과 에너지는 소중한 자원입니다 • 적절한 휴식은 더 좋은 성과를 만듭니다

호흡: 4초 들이마시고, 6초 내쉬며 어깨 힘을 빼세요.

미세실천: 퇴근 30분 전에 내일 할 일을 정리하고, "오늘은 충분히 했다"고 말하기.
```

## 3. 통합 사용법

### TypeScript 타입 검증
```typescript
import { z } from 'zod';

const EFTSessionPlanSchema = z.object({
  title: z.string(),
  introTip: z.string().optional(),
  steps: z.array(z.object({
    point: z.enum(["brow","side_eye","under_eye","under_nose","chin","clavicle","under_arm","top_head"]),
    side: z.enum(["left","right","center"]),
    durationSec: z.number().int().min(4).max(8),
    tip: z.string().max(30).optional()
  })).min(8).max(12)
});

// API 응답 검증
const validateSessionPlan = (jsonResponse: string) => {
  try {
    const parsed = JSON.parse(jsonResponse);
    return EFTSessionPlanSchema.parse(parsed);
  } catch (error) {
    console.error('Invalid EFT session plan:', error);
    return null;
  }
};
```

### 실제 사용 예시
```typescript
// AI에서 받은 JSON을 ARSession에 전달
const sessionPlan = validateSessionPlan(aiResponse);
if (sessionPlan) {
  return <ARSession plan={sessionPlan} />;
}
```

## 4. 품질 보장 체크리스트

### EFT 세션 플랜 검증
- ✅ 8-12 스텝 범위
- ✅ 모든 point가 유효한 EFT 타점
- ✅ side가 올바른 값 (left/right/center)
- ✅ durationSec이 4-8초 범위
- ✅ tip이 30자 이내
- ✅ introTip이 20자 이내
- ✅ JSON 형식 유효성

### 확언 메시지 검증
- ✅ 200자 이내
- ✅ 4개 필드 모두 포함 (확언/근거/호흡/미세실천)
- ✅ 꼬릿말/면책 없음
- ✅ 실행 가능한 미세실천 제안