/**
 * BreathPacer - 호흡 메트로놈 애니메이션
 * 4-4 호흡법 또는 4-7-8 호흡법 시각적 가이드
 */

import React, { useEffect, useState } from "react";

interface BreathPacerProps {
  mode?: "4-4" | "4-7-8";
  autoStart?: boolean;
}

type Phase = "inhale" | "hold" | "exhale";

export const BreathPacer: React.FC<BreathPacerProps> = ({
  mode = "4-4",
  autoStart = true,
}) => {
  console.log('🫁 BreathPacer mounted! autoStart:', autoStart);

  const [phase, setPhase] = useState<Phase>("inhale");
  const [progress, setProgress] = useState(0);
  const [isActive, setIsActive] = useState(autoStart);

  console.log('🫁 BreathPacer render:', { isActive, phase, progress });

  // 호흡 타이밍 설정
  const timing = mode === "4-4"
    ? { inhale: 4, hold: 4, exhale: 6 }
    : { inhale: 4, hold: 7, exhale: 8 };

  const totalCycle = timing.inhale + timing.hold + timing.exhale;

  useEffect(() => {
    if (!isActive) return;

    const startTime = performance.now();
    let animationFrame: number;

    const animate = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const cycleTime = elapsed % totalCycle;

      let currentPhase: Phase;
      let phaseProgress: number;

      if (cycleTime < timing.inhale) {
        currentPhase = "inhale";
        phaseProgress = cycleTime / timing.inhale;
      } else if (cycleTime < timing.inhale + timing.hold) {
        currentPhase = "hold";
        phaseProgress = (cycleTime - timing.inhale) / timing.hold;
      } else {
        currentPhase = "exhale";
        phaseProgress = (cycleTime - timing.inhale - timing.hold) / timing.exhale;
      }

      setPhase(currentPhase);
      setProgress(phaseProgress);

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [isActive, timing.inhale, timing.hold, timing.exhale, totalCycle]);

  // Ease 함수 (부드러운 왕복 애니메이션)
  const ease = (x: number): number => {
    return 0.5 - 0.5 * Math.cos(Math.PI * x);
  };

  // 좌우 위치 계산 (화면 끝에서 끝으로, ease 적용)
  const getHorizontalPosition = (): number => {
    if (phase === "inhale") {
      return ease(progress) * 100; // 0% → 100% (왼쪽에서 오른쪽으로)
    } else if (phase === "hold") {
      return 100; // 오른쪽 끝에서 유지
    } else {
      return ease(1 - progress) * 100; // 100% → 0% (오른쪽에서 왼쪽으로)
    }
  };

  // 원형 크기 계산 (기존 애니메이션용)
  const getCircleSize = (): number => {
    const minSize = 60;
    const maxSize = 140;

    if (phase === "inhale") {
      return minSize + (maxSize - minSize) * progress;
    } else if (phase === "hold") {
      return maxSize;
    } else {
      return maxSize - (maxSize - minSize) * progress;
    }
  };

  // 색상 결정
  const getColor = (): string => {
    if (phase === "inhale") return "bg-blue-500";
    if (phase === "hold") return "bg-yellow-500";
    return "bg-green-500";
  };

  // 텍스트
  const getText = (): string => {
    if (phase === "inhale") return "들이마시기";
    if (phase === "hold") return "멈추기";
    return "내쉬기";
  };

  const getSubText = (): string => {
    const remaining = Math.ceil(
      (phase === "inhale" ? timing.inhale : phase === "hold" ? timing.hold : timing.exhale) *
        (1 - progress)
    );
    return `${remaining}초`;
  };

  const circleSize = getCircleSize();
  const horizontalPos = getHorizontalPosition();

  // 디버깅: 1초마다 상태 출력
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      console.log('🫁 Breath:', { phase, progress: progress.toFixed(2), size: circleSize.toFixed(0) });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive, phase, progress, circleSize]);

  if (!isActive) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-[min(92vw,560px)]">
      <div className="flex flex-col items-center gap-4">
        {/* 수평 호흡 가이드 바 */}
        <div className="w-full">
          {/* 트랙 (배경 바) */}
          <div className="relative h-2 rounded-full bg-white/50 backdrop-blur border border-black/10">
            {/* 이동하는 포인터 */}
            <div
              className="absolute -top-1 -translate-x-1/2 transition-all duration-100 ease-linear"
              style={{ left: `${horizontalPos}%` }}
            >
              <div className={`w-4 h-4 rounded-full ${getColor()} shadow-lg border-2 border-white`} />
            </div>
          </div>

          {/* 텍스트 정보 */}
          <div className="mt-3 text-center">
            <div className="text-sm font-medium text-gray-700">{getText()}</div>
            <div className="text-xs text-gray-500">{getSubText()}</div>
          </div>
        </div>

        {/* 모드 표시 */}
        <div className="bg-black/70 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-xs font-medium">
          {mode === "4-4" ? "4-4 호흡법" : "4-7-8 호흡법"}
        </div>
      </div>
    </div>
  );
};

export default BreathPacer;
