# MoodTalk v2.0 단계별 구현 로드맵

**기준**: MoodTalk 최종 설계 명세서 v2.0  
**분기 위치**: 감정 수집 완료 = `EFTStrictPage` 마지막 단계 (`SlideIntake` onComplete → `handleSubmit` 성공 시)

---

## 0. 분기 UX (진입점)

- **위치**: `EFTStrictPage` — `handleSubmit` 성공 후, 기존처럼 바로 `/ar-holistic`으로 가지 않고 **선택 화면** 노출.
- **선택지**:
  - **EFT AR** → 기존과 동일: `setEftScript` + `navigate("/ar-holistic", { state })`
  - **명상** → `navigate("/meditation/theme", { state: { strictIntake, eft_script?, chatResponse? } })`
- **저장**: EmotionCheckin은 기존처럼 `/api/emotion/checkin` 호출 지점 유지(필요 시 `handleSubmit` 전/후에 한 번만 호출).

---

## 1. 테마 추천/선택 (Theme Recommendation)

- **경로**: `/meditation/theme`
- **입력**: `strict_intake`(StrictIntakeInput), (선택) IntakeAnalyzer 출력(`intent`, `theme_recommendations`).
- **UI**: 명상 테마 3개 카드(테마명, 예상 시간, 한 줄 요약, 기대 효과 배지). 기본 1순위 선택, 사용자가 변경 가능.
- **출력**: `selected_theme_id`, `selected_estimated_min` → Session Planner 입력으로 전달.
- **다음**: 테마 선택 후 → `/meditation/session` 또는 음성 선택으로.

---

## 2. 세션 설계 (Session Planner)

- **입력**: `intake_struct`, `selected_theme_id`, `constraints`, `tone`, `activation_goal`.
- **출력**: `session_plan` (total_s, blocks: breath_regulation, body_release, defusion, reframing_bridge, activation 등).
- **구현**: 백엔드 규칙/LLM 조합 → 고정 블록 템플릿 + 테마별 매핑. Phase 구조: Regulation → Reframing → Activation.

---

## 3. 음성 선택 (Voice Selection)

- **UI**: Calm Female / Warm Male / Neutral AI 등 선택. `VoiceProfile`(voice_id, language, pitch, speed, emotion_style).
- **저장**: `user_voice_preference` (세션/사용자별).

---

## 4. TTS 연동 (Qwen3-TTS)

- **역할**: PolicyEngine → GuidanceAction → LLM(NLG) → TTS → 오디오 출력. TTS는 “말하기만”.
- **PWA**: 재생 안정화(Wake Lock, 백그라운드 시 표준 가이드 모드 전환).

---

## 5. Policy Engine + 실시간 가이드

- **입력**: State Vector(Regulation + Execution), Event(tension_spike, attention_drop 등), confidence.
- **출력**: GuidanceAction(phase, block_type, prompt_style, instruction_kind, task_atom, constraints, safety_guards).
- **규칙**: Trend-based, confidence-gated, Phase 전환 조건(명세서 5절).

---

## 6. 멀티모달 상태 추정

- **Vision**: gaze_stability, blink_rate, head_pose, micro_tension proxies, head_motion_energy, camera_quality.
- **rPPG**: HR 추세(hr_trend_slope), rppg_quality; 절대값보다 추세 사용. 품질 낮으면 failover.
- **State Vector v2**: stress, arousal, recovery, focus, agitation, valence / energy, agency, self_efficacy, task_readiness.

---

## 7. 명상 세션 런타임

- **화면**: 기준선 측정 안내, Perception-safe Consent, “카메라 없이 진행” 옵션.
- **피드백**: 부드러운 호흡 파동 등 “가이드 최적화” 메시지. signal_degrade 시 표준 가이드 모드.
- **종료**: 세션 요약 + 개인화 제안.

---

## 8. 데이터/저장

- **저장**: feature, state, action, Δstate, voice preference만. 원본 영상/음성/원본 PPG 저장 금지.
- **API**: 기존 EmotionCheckin(/api/emotion/checkin), 필요 시 v1/session/{id}/events|state|actions(NDJSON 등) 확장.

---

## 구현 순서 요약

| 단계 | 내용 | 의존 |
|------|------|------|
| 0 | EFTStrictPage 완료 후 **EFT AR / 명상** 선택 화면 | 없음 |
| 1 | 명상 테마 추천/선택 페이지, 선택 결과 저장 | 0 |
| 2 | Session Planner(고정/스텁 시나리오 가능) | 1 |
| 3 | 음성 선택 UX + TTS 파이프라인 | 2 |
| 4 | Policy Engine(규칙 기반) + GuidanceAction → LLM 문장 | 2, 3 |
| 5 | 멀티모달 상태 추정(Vision/rPPG) + State Vector | - |
| 6 | 명상 세션 런타임 UI + Wake Lock, failover | 4, 5 |
| 7 | 세션 요약, 개인화 | 6 |

이 로드맵대로 단계적으로 v2.0 전체를 구현할 수 있습니다.
