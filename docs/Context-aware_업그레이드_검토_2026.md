# Context-aware AI 업그레이드 프롬프트 검토 (2026)

## 1. 프롬프트에 대한 전체 의견

- **목표가 명확함**: Rule-based → Context-aware로의 전환, "가장 열악한 환경" 기준 설계는 실서비스 관점에서 타당함.
- **4가지 개선(Calibration, Environment Adaptation, Trajectory, TTS)** 이 프론트/백엔드/UX에 잘 나뉘어 있어 단계별 구현에 적합함.
- **Step 1(Frontend)** 에서 SignalProcessor + Kalman + Calibration + Luminance를 한 번에 묶은 것은 일관된 "신호 파이프라인" 관점에서 좋음.

## 2. 설계 시 유의할 점

| 항목 | 의견 |
|------|------|
| **face.ts 계약** | `FaceSignals` 타입/시그니처는 변경하지 말고, **그 아래에서** Kalman/Calibration을 적용하는 계층(SignalProcessor)을 두는 것이 안전함. |
| **Calibration 타이밍** | 5~10초는 사용자가 "편한 상태"로 있을 수 있는 시간. 도서관/지하철에서는 "지금은 침착해 주세요" 안내를 짧게 보여주고, 그 구간만 baseline으로 쓰는 것이 좋음. |
| **Delta 임계값 0.2** | 개인차가 크므로, 추후 A/B 테스트로 0.15~0.25 구간을 튜닝할 수 있게 상수/설정으로 두는 것을 권장함. |
| **Luminance** | MediaPipe 입력은 비디오 프레임이므로, 같은 `video` 요소를 캔버스에 그려 한 프레임의 밝기를 계산하면 됨. UI 전환은 "서서히" 하여 깜빡임을 줄이는 것이 좋음. |
| **Kalman** | tension만 쓸지, perclos/eyeOpen 등도 쓸지는 노이즈 수준에 따라 결정. 1차는 tension만 적용해도 효과가 큼. |
| **Silent 모드(고개 끄덕임/입모양)** | Step 1 범위 밖이지만, SignalProcessor 출력에 `gesture: 'nod' | 'lip_yes' | null` 같은 필드를 확장 가능하게 두면 이후 Step에서 붙이기 쉬움. |

## 3. Step 1 구현 방향 요약

- **SignalProcessor**: `face.ts`의 `analyzeFace()` 결과를 입력으로 받아, Kalman 필터 → Calibration(5~10초 baseline) → `tension_delta` 산출. 동일 비디오 프레임으로 Luminance 계산 함수 제공.
- **face_data**: `baseline_tension`, `tension_delta` 추가. 백엔드는 기존 `tension`과 호환되도록 `tension` = baseline + delta 형태로도 전달 가능.
- **MeditationRunPage**: Calibration Phase UI(예: "잠시 편하게 있어 주세요"), SignalProcessor 연동, Luminance에 따른 UI 테마 상태만 반영(Step 3에서 실제 테마 전환).

이어서 Step 1용 구체 코드를 제안합니다.

---

## 4. Step 1 구현 완료 요약 (코드 반영)

| 항목 | 파일 | 내용 |
|------|------|------|
| **SignalProcessor** | `frontend/src/signals/SignalProcessor.ts` | `KalmanFilter1D`, Calibration(5~10초, baseline_tension), `process(raw) → ProcessedFaceSignals`, `getLuminanceFromVideo()`, `isLowLight()` |
| **face_data 확장** | `frontend/src/utils/faceDataMapper.ts` | `tension_filtered`, `tension_delta`, `baseline_tension`, `calibration_done` 추가. Calibration 완료 시 Delta 기준(>0.2 긴장, >0.1 불안)으로 감정 판별 |
| **MeditationRunPage** | `frontend/src/pages/MeditationRunPage.tsx` | SignalProcessor ref 연동, `analyzeFace → process → faceSignalsToFaceData`. Calibration Phase 배너("잠시 편하게 있어 주세요"). Luminance 상태 + 저조도 시 `bg-[#faf8f5]` (Auto-Illumination). 긴급 감지 시 Calibration 후에는 `tension_delta > 0.2` 기준 적용 |

**다음 단계**: Step 2 (Backend ContextManager + Trajectory), Step 3 (UX/UI Auto-Illumination 고도화).
