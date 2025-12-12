import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
// ✅ v6 최신 API: createXRStore 사용
import { XR, createXRStore } from '@react-three/xr';
import ResponsiveContainer from '@/components/layout/ResponsiveContainer';

export type ARBoxBreathingPageProps = Record<string, never>;

type BreathingStage = 'INHALE' | 'HOLD_AFTER_INHALE' | 'EXHALE' | 'HOLD_AFTER_EXHALE';

const STAGE_SEQUENCE: BreathingStage[] = ['INHALE', 'HOLD_AFTER_INHALE', 'EXHALE', 'HOLD_AFTER_EXHALE'];
const STAGE_DURATION_SECONDS = 4;
const STAGE_DURATION_MS = STAGE_DURATION_SECONDS * 1000;

const stageLabelMap: Record<BreathingStage, string> = {
  INHALE: '들이쉬기',
  HOLD_AFTER_INHALE: '멈추기',
  EXHALE: '내쉬기',
  HOLD_AFTER_EXHALE: '멈추기',
};

type Vec3 = [number, number, number];

// ✅ AR 물체 위치 최적화: 사용자 눈앞 0.5m ~ 1m 거리
const SQUARE_SIZE = 0.6; // meters (0.6m = 60cm, 안전한 크기)
const HALF = SQUARE_SIZE / 2;
const ORB_THRESHOLDS = [0.25, 0.5, 0.75] as const;

// ✅ AR 카메라 기본 위치: 사용자 눈 높이에서 시작
const AR_CAMERA_START_POSITION: Vec3 = [0, 1.6, 0]; // 1.6m = 평균 눈 높이

// 🎨 색상 변환 유틸리티: OKLCH → Hex
// Tailwind OKLCH 색상을 Three.js가 인식할 수 있는 Hex 코드로 변환
const THEME_COLORS = {
  // oklch(0.65 0.12 175) → 청록색 계열
  accent: '#4FB3BF',
  accentBright: '#5EC5D1',
  accentDim: '#3FA1AD',

  // oklch(0.55 0.15 280) → 보라색 계열
  primary: '#6D5BD0',
  primaryBright: '#7E6AD8',
  primaryDim: '#5C4ABF',

  // 보조 색상
  white: '#FFFFFF',
  lightGray: '#E5E7EB',
  mediumGray: '#9CA3AF',
} as const;

/**
 * ✅ Three.js 안전 색상 헬퍼
 * Tailwind OKLCH 색상을 Three.js Hex 코드로 매핑
 */
const getThreeColor = (colorKey: keyof typeof THEME_COLORS): string => {
  return THEME_COLORS[colorKey];
};

// ✅ AR 물체 위치 계산: 사용자 눈앞 0.7m 거리, 눈 높이보다 약간 아래
const stageToPosition = (stage: BreathingStage, progress: number): Vec3 => {
  const clamped = Math.min(Math.max(progress, 0), 1);

  // 사각형 중심: 사용자 눈앞 0.7m, 눈 높이보다 0.3m 아래
  const centerZ = -0.7; // 앞쪽으로 70cm
  const centerY = 1.3;  // 눈 높이(1.6m)보다 0.3m 아래
  const centerX = 0;    // 정중앙

  switch (stage) {
    case 'INHALE': // 상단 가장자리: 좌 → 우
      return [
        centerX - HALF + SQUARE_SIZE * clamped,
        centerY + HALF,
        centerZ
      ];
    case 'HOLD_AFTER_INHALE': // 우측 가장자리: 상 → 하
      return [
        centerX + HALF,
        centerY + HALF - SQUARE_SIZE * clamped,
        centerZ
      ];
    case 'EXHALE': // 하단 가장자리: 우 → 좌
      return [
        centerX + HALF - SQUARE_SIZE * clamped,
        centerY - HALF,
        centerZ
      ];
    case 'HOLD_AFTER_EXHALE': // 좌측 가장자리: 하 → 상
      return [
        centerX - HALF,
        centerY - HALF + SQUARE_SIZE * clamped,
        centerZ
      ];
    default:
      return [centerX, centerY, centerZ];
  }
};

const LightOrb: React.FC<{ position: Vec3; active: boolean }> = ({ position, active }) => (
  <mesh position={position}>
    <sphereGeometry args={[0.04, 18, 18]} />
    {/* ✅ OKLCH → Hex 변환 적용 */}
    <meshStandardMaterial
      color={getThreeColor('accent')}
      emissive={getThreeColor('accentBright')}
      emissiveIntensity={active ? 0.8 : 0.25}
      opacity={active ? 1 : 0.4}
      transparent
    />
  </mesh>
);

const GoalMarker: React.FC<{ position: Vec3 }> = ({ position }) => (
  <mesh position={[position[0], position[1], position[2]]}>
    <cylinderGeometry args={[0.08, 0.08, 0.15, 16]} />
    {/* ✅ OKLCH → Hex 변환 적용 */}
    <meshStandardMaterial
      color={getThreeColor('primary')}
      emissive={getThreeColor('primaryBright')}
      emissiveIntensity={0.35}
    />
  </mesh>
);

const Traveler: React.FC<{ position: Vec3 }> = ({ position }) => (
  <group position={position}>
    {/* 몸통: 작은 상자 */}
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.1, 0.1, 0.1]} />
      {/* ✅ OKLCH → Hex 변환 적용 */}
      <meshStandardMaterial
        color={getThreeColor('primary')}
        emissive={getThreeColor('primaryDim')}
        emissiveIntensity={0.2}
      />
    </mesh>
    {/* 머리: 작은 구 */}
    <mesh position={[0, 0.08, 0]}>
      <sphereGeometry args={[0.06, 16, 16]} />
      {/* ✅ OKLCH → Hex 변환 적용 */}
      <meshStandardMaterial
        color={getThreeColor('accent')}
        emissive={getThreeColor('accentDim')}
        emissiveIntensity={0.25}
      />
    </mesh>
  </group>
);

interface MovingDotProps {
  stage: BreathingStage;
  progress: number; // 0~1
}

const MovingDot: React.FC<MovingDotProps> = ({ stage, progress }) => {
  const clamped = Math.min(Math.max(progress, 0), 1);
  let x = 0;
  let y = 0;

  switch (stage) {
    case 'INHALE': // top edge: left -> right
      x = clamped;
      y = 0;
      break;
    case 'HOLD_AFTER_INHALE': // right edge: top -> bottom
      x = 1;
      y = clamped;
      break;
    case 'EXHALE': // bottom edge: right -> left
      x = 1 - clamped;
      y = 1;
      break;
    case 'HOLD_AFTER_EXHALE': // left edge: bottom -> top
      x = 0;
      y = 1 - clamped;
      break;
    default:
      break;
  }

  return (
    <div
      className="absolute h-4 w-4 rounded-full bg-accent shadow-lg shadow-accent/50 transition-transform duration-200 ease-linear"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
    />
  );
};

const ARBoxBreathingPage: React.FC<ARBoxBreathingPageProps> = () => {
  // ✅ v6 핵심: XRStore 생성 (컴포넌트 최상단에서 한 번만)
  const store = useMemo(() => createXRStore(), []);

  const [stageIndex, setStageIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(STAGE_DURATION_SECONDS);
  const [stageProgress, setStageProgress] = useState(0); // 0~1
  const [countDisplay, setCountDisplay] = useState(1);
  const rafRef = useRef<number | null>(null);
  const stageElapsedRef = useRef(0);
  const lastTimestampRef = useRef<number | null>(null);
  const [orbCollected, setOrbCollected] = useState<Record<BreathingStage, boolean[]>>({
    INHALE: [false, false, false],
    HOLD_AFTER_INHALE: [false, false, false],
    EXHALE: [false, false, false],
    HOLD_AFTER_EXHALE: [false, false, false],
  });
  const [cameraError, setCameraError] = useState<string | null>(null);

  const currentStage = useMemo<BreathingStage>(() => STAGE_SEQUENCE[stageIndex], [stageIndex]);

  const resetBreathing = () => {
    setStageIndex(0);
    setSecondsLeft(STAGE_DURATION_SECONDS);
    setStageProgress(0);
    setCountDisplay(1);
    setIsRunning(false);
    stageElapsedRef.current = 0;
    lastTimestampRef.current = null;
    setOrbCollected({
      INHALE: [false, false, false],
      HOLD_AFTER_INHALE: [false, false, false],
      EXHALE: [false, false, false],
      HOLD_AFTER_EXHALE: [false, false, false],
    });
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const toggleRunning = () => {
    setIsRunning((prev) => !prev);
  };

  const goNextStage = useCallback(() => {
    setStageIndex((prev) => (prev + 1) % STAGE_SEQUENCE.length);
    setSecondsLeft(STAGE_DURATION_SECONDS);
    setStageProgress(0);
    setCountDisplay(1);
    setOrbCollected((prev) => ({
      ...prev,
      [currentStage]: [false, false, false],
    }));
  }, [currentStage]);

  useEffect(() => {
    if (!isRunning) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimestampRef.current = null;
      return;
    }

    const tick = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }
      const delta = timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;
      stageElapsedRef.current += delta;

      if (stageElapsedRef.current >= STAGE_DURATION_MS) {
        const overflow = stageElapsedRef.current - STAGE_DURATION_MS;
        goNextStage();
        stageElapsedRef.current = overflow;
      }

      const progress = Math.min(stageElapsedRef.current / STAGE_DURATION_MS, 1);
      setStageProgress(progress);

      const secondsRemaining = Math.max(1, STAGE_DURATION_SECONDS - Math.floor(stageElapsedRef.current / 1000));
      setSecondsLeft(secondsRemaining);

      const count = Math.min(4, Math.floor(stageElapsedRef.current / 1000) + 1);
      setCountDisplay(count);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isRunning, goNextStage]);

  useEffect(() => {
    // 카메라 권한 요청
    const requestCamera = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraError(null);
      } catch {
        setCameraError('카메라 권한이 필요합니다.');
      }
    };
    requestCamera();
  }, []);

  const ringScale = useMemo(() => {
    switch (currentStage) {
      case 'INHALE':
        return 1.1;
      case 'EXHALE':
        return 0.9;
      default:
        return 1;
    }
  }, [currentStage]);

  const stagePosition = useMemo<Vec3>(
    () => stageToPosition(currentStage, stageProgress),
    [currentStage, stageProgress]
  );

  const orbPositions = useMemo(() => {
    const stageToPositions: Record<BreathingStage, Vec3[]> = {
      INHALE: ORB_THRESHOLDS.map((t) => stageToPosition('INHALE', t)),
      HOLD_AFTER_INHALE: ORB_THRESHOLDS.map((t) => stageToPosition('HOLD_AFTER_INHALE', t)),
      EXHALE: ORB_THRESHOLDS.map((t) => stageToPosition('EXHALE', t)),
      HOLD_AFTER_EXHALE: ORB_THRESHOLDS.map((t) => stageToPosition('HOLD_AFTER_EXHALE', t)),
    };
    return stageToPositions[currentStage];
  }, [currentStage]);

  useEffect(() => {
    ORB_THRESHOLDS.forEach((t, idx) => {
      if (!orbCollected[currentStage][idx] && stageProgress >= t) {
        setOrbCollected((prev) => {
          const next = { ...prev };
          const updated = [...next[currentStage]] as boolean[];
          updated[idx] = true;
          next[currentStage] = updated;
          return next;
        });
      }
    });
  }, [currentStage, stageProgress, orbCollected]);

  return (
    <ResponsiveContainer>
      <div className="flex min-h-screen flex-col bg-background text-foreground lg:min-h-0">
        <div className="flex flex-col gap-3 px-6 py-6 lg:px-8 lg:py-8">
          <div>
            <p className="text-sm font-medium text-foreground/70">Mindful AR</p>
            <h1 className="text-3xl font-bold tracking-tight text-primary">AR 박스호흡</h1>
            <p className="mt-1 text-base text-foreground/70">
              호흡 리듬에 맞춰 AR 화면과 함께 따라해 보세요.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-background/80 p-4 shadow-sm lg:p-6">
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border">
              {/*
                ✅ v6 변경사항 #1: ARButton 컴포넌트 제거
                → 일반 <button>으로 대체하고 onClick에서 store.enterAR() 호출

                배치 순서: Canvas 외부에 버튼 배치 (overlay 스타일)
              */}
              <button
                type="button"
                onClick={() => store.enterAR()}
                className="absolute right-3 top-3 z-10 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                AR 시작하기
              </button>

              {cameraError && (
                <div className="absolute left-3 top-3 z-10 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground shadow">
                  {cameraError}
                </div>
              )}

              {/*
                ✅ AR 카메라 최적화:
                - 기본 카메라 위치: [0, 1.5, 3] (3m 뒤에서 바라봄)
                - AR 모드 진입 시: 자동으로 사용자 위치로 이동
                - 물체 배치: 사용자 눈앞 0.7m, 눈 높이보다 0.3m 아래
              */}
              <Canvas
                camera={{ position: [0, 1.5, 3], fov: 60 }}
                gl={{ alpha: true }}
                style={{ background: 'transparent' }}
              >
                {/*
                  ✅ v6 변경사항 #2: XR 컴포넌트에 store prop 전달 필수!
                */}
                <XR store={store}>
                  {/*
                    🔆 조명 설정: AR 환경에서 물체가 잘 보이도록 밝기 조정
                    - ambientLight: 전체 밝기 (너무 어두우면 안 보임)
                    - directionalLight: 입체감 연출
                  */}
                  <ambientLight intensity={0.8} />
                  <directionalLight position={[2, 4, 2]} intensity={0.6} />

                  {/* 호흡 경로를 따라 이동하는 여행자 */}
                  <Traveler position={stagePosition} />

                  {/* 수집 가능한 빛 구슬들 (크기 축소: 0.07 → 0.04) */}
                  {orbPositions.map((pos, idx) => (
                    <LightOrb
                      key={`orb-${currentStage}-${idx}`}
                      position={pos}
                      active={!orbCollected[currentStage][idx]}
                    />
                  ))}

                  {/* 현재 단계의 목표 지점 마커 (크기 축소) */}
                  <GoalMarker position={stageToPosition(currentStage, 1)} />
                </XR>
              </Canvas>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="relative flex h-56 w-56 items-center justify-center">
                <div className="absolute inset-4 rounded-2xl border-2 border-accent/70" />
                <div
                  className="absolute inset-4 rounded-2xl bg-accent/10 transition-transform duration-700 ease-in-out"
                  style={{ transform: `scale(${ringScale})` }}
                />
                <div className="absolute inset-4">
                  <MovingDot stage={currentStage} progress={stageProgress} />
                </div>
                <div className="flex flex-col items-center justify-center gap-1 rounded-full bg-background/80 px-5 py-3 text-center shadow-sm backdrop-blur">
                  <span className="text-sm font-semibold text-primary">{stageLabelMap[currentStage]}</span>
                  <span className="text-4xl font-bold text-foreground">{countDisplay}</span>
                  <span className="text-xs font-medium text-foreground/70">남은 {secondsLeft}s</span>
                </div>
              </div>
              <p className="text-sm text-foreground/70">
                4초 들이쉬기 → 4초 멈추기 → 4초 내쉬기 → 4초 멈추기 (사각형 경로 따라가기)
              </p>
            </div>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3 px-6 pb-8 pt-2 lg:px-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={toggleRunning}
              className="rounded-xl bg-primary px-4 py-3 text-center text-base font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {isRunning ? '일시정지' : '시작'}
            </button>
            <button
              type="button"
              onClick={resetBreathing}
              className="rounded-xl bg-secondary px-4 py-3 text-center text-base font-semibold text-foreground transition hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              리셋
            </button>
            <button
              type="button"
              onClick={() => {
                window.history.back();
              }}
              className="rounded-xl bg-accent px-4 py-3 text-center text-base font-semibold text-accent-foreground transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              종료/뒤로가기
            </button>
          </div>
        </div>
      </div>
    </ResponsiveContainer>
  );
};

export default ARBoxBreathingPage;
export { ARBoxBreathingPage };
