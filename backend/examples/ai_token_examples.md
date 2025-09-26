# AI 액션 토큰 방출 가이드

## Claude/AI 모델에게 제공할 프롬프트 규칙

```
[액션 토큰 규칙]
사용자가 SUDS 측정, EFT 추천, 호흡 운동이 필요할 때 다음 형식의 토큰을 응답 텍스트 안에 삽입하세요.

- 토큰은 반드시 별도 줄에 단독으로 기록
- JSON 한 줄로 작성, 중괄호 내부에 줄바꿈 금지
- 텍스트는 사람에게 자연스럽게 보이고, 토큰은 시스템이 자동 처리

형식 예시:
[ask_suds: {"measurement_type":"pre","prompt_message":"EFT 세션 전 현재 스트레스 수준을 0~10으로 측정해주세요","context":"eft_session_start","priority":4}]

[recommend_eft: {"technique":"basic_tapping","reason":"스트레스 완화에 효과적입니다","difficulty":"beginner","estimated_duration":10,"priority":3}]
```

## 실제 AI 응답 예시

### 1. 스트레스 호소 → SUDS 측정 + EFT 추천

**사용자**: "요즘 일 때문에 너무 스트레스받아요. 잠도 안 와요."

**AI 응답**:
```
업무 스트레스로 힘드시겠어요. 잠까지 잘 못 주무시니 정말 고생이 많으세요.

먼저 현재 상태를 정확히 파악해보겠습니다.

[ask_suds: {"measurement_type":"check","prompt_message":"현재 느끼시는 스트레스 수준을 0~10으로 측정해주세요","context":"stress_assessment","priority":4}]

측정 후에는 기본 탭핑 기법으로 스트레스를 완화해보시는 것을 추천드립니다.

[recommend_eft: {"technique":"basic_tapping","reason":"업무 스트레스와 불안 완화에 효과적입니다","difficulty":"beginner","estimated_duration":10,"priority":3}]

충분한 수면을 위해서는 잠자리에 들기 전 간단한 호흡 운동도 도움이 될 수 있어요.
```

### 2. EFT 세션 시작 → Pre SUDS

**사용자**: "EFT 탭핑을 해보고 싶어요."

**AI 응답**:
```
좋은 선택이세요! EFT 탭핑은 감정과 스트레스 완화에 매우 효과적입니다.

세션을 시작하기 전에 현재 상태를 측정해보겠습니다.

[ask_suds: {"measurement_type":"pre","prompt_message":"EFT 세션을 시작하기 전 현재 스트레스나 불편함의 정도를 0~10으로 측정해주세요","context":"eft_session_start","priority":5}]

측정이 완료되면 단계별로 탭핑을 안내해드리겠습니다.
```

### 3. EFT 세션 완료 → Post SUDS

**AI 응답**:
```
탭핑 세션을 완료하셨습니다! 수고하셨어요.

이제 세션 후 변화를 확인해보겠습니다.

[ask_suds: {"measurement_type":"post","prompt_message":"EFT 탭핑 후 현재 느끼시는 스트레스나 불편함의 정도를 0~10으로 다시 측정해주세요","context":"eft_session_complete","priority":5}]

이전과 비교해서 어떤 변화가 있었는지 알려주시면, 더 맞춤형 조언을 드릴 수 있습니다.
```

## 토큰 파라미터 가이드

### ask_suds 토큰

```json
{
  "measurement_type": "pre|post|check",  // 필수
  "prompt_message": "사용자에게 보여줄 설명",  // 필수
  "context": "측정 상황 (선택사항)",
  "priority": 1-5  // 1=낮음, 5=높음
}
```

**measurement_type 사용 가이드:**
- `"pre"`: EFT/호흡 세션 시작 전 측정
- `"post"`: EFT/호흡 세션 완료 후 측정
- `"check"`: 일반적인 현재 상태 체크

### recommend_eft 토큰

```json
{
  "technique": "basic_tapping|advanced_tapping|breathing|...",  // 필수
  "reason": "추천 이유 설명",  // 필수
  "difficulty": "beginner|intermediate|advanced",  // 기본: beginner
  "estimated_duration": 5-60,  // 예상 소요 시간(분)
  "priority": 1-5
}
```

## 주의사항

1. **자연스러운 대화 우선**: 토큰은 대화의 자연스러운 흐름에 방해되지 않게 배치
2. **과도한 토큰 방지**: 한 응답에 토큰 3개 이하 권장
3. **컨텍스트 고려**: 사용자 상황에 맞는 적절한 measurement_type 선택
4. **명확한 안내**: prompt_message는 사용자가 이해하기 쉽게 작성

## 실제 프론트엔드 처리 결과

위 토큰들이 처리되면 사용자에게는:

1. **깔끔한 텍스트**: 토큰이 제거된 자연스러운 대화
2. **인라인 카드**: SUDS 측정 UI가 채팅창에 자동 삽입
3. **매끄러운 플로우**: 측정 → 기록 → 다음 단계 자동 연결

이렇게 AI가 능동적으로 사용자의 세션을 가이드하며 데이터를 수집할 수 있습니다.