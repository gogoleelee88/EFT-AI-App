/**
 * TopStats - 상단 정보띠 컴포넌트
 * 세션 시간, 호흡, 긴장도, 품질, 세션 종료 버튼 통합
 */

import React from "react";
import type { FaceSignals } from "../../signals/face";

interface TopStatsProps {
  elapsedSec: number;
  breathsPerMin: number | null;
  faceSignals: FaceSignals | null;
  onEnd: () => void;
}

export const TopStats: React.FC<TopStatsProps> = ({
  elapsedSec,
  breathsPerMin,
  faceSignals,
  onEnd,
}) => {
  // Format time as MM:SS
  const formatTime = (sec: number): string => {
    return new Date(sec * 1000).toISOString().substring(14, 19);
  };

  return (
    <div
      className="
        fixed top-[env(safe-area-inset-top,8px)] left-1/2 -translate-x-1/2 z-30
        flex items-center gap-3 px-4 py-1.5
        bg-black/45 backdrop-blur-sm text-white rounded-full shadow-lg
        text-[13px] leading-none
        pointer-events-none
      "
    >
      {/* Session time */}
      <span className="tabular-nums font-mono">{formatTime(elapsedSec)}</span>

      <span className="opacity-60">|</span>

      {/* Breath rate */}
      <span className="flex items-center gap-1">
        <span>🫁</span>
        <span>{breathsPerMin ? `${breathsPerMin.toFixed(1)}/분` : "—"}</span>
      </span>

      {/* Eye Open & PERCLOS */}
      {faceSignals && (
        <>
          <span className="flex items-center gap-1">
            <span>👁️</span>
            <span>{Math.round(faceSignals.eyeOpen * 100)}%</span>
          </span>
          <span className="flex items-center gap-1 text-xs opacity-75">
            <span>PERCLOS</span>
            <span>{Math.round(faceSignals.perclos * 100)}%</span>
          </span>
        </>
      )}

      {/* Blink Rate */}
      {faceSignals && (
        <span className="flex items-center gap-1 text-xs opacity-75">
          <span>깜빡</span>
          <span>{Math.round(faceSignals.blinkRate)}/분</span>
        </span>
      )}

      {/* Tension */}
      {faceSignals && (
        <span className="flex items-center gap-1">
          <span>긴장</span>
          <span
            className={
              faceSignals.tension > 0.7
                ? "text-red-400"
                : faceSignals.tension > 0.5
                ? "text-yellow-400"
                : "text-green-400"
            }
          >
            {Math.round(faceSignals.tension * 100)}%
          </span>
        </span>
      )}

      {/* Quality */}
      {faceSignals && (
        <span className="flex items-center gap-1">
          <span>품질</span>
          <span
            className={
              faceSignals.quality > 0.7
                ? "text-green-400"
                : faceSignals.quality > 0.4
                ? "text-yellow-400"
                : "text-red-400"
            }
          >
            {Math.round(faceSignals.quality * 100)}%
          </span>
        </span>
      )}

      <span className="opacity-60">|</span>

      {/* Stop button - only this is clickable */}
      <span className="pointer-events-auto">
        <button
          onClick={onEnd}
          className="px-2.5 py-1 rounded-full bg-white text-gray-900 text-[12px] font-medium border border-black/10 shadow hover:bg-gray-100 transition"
        >
          세션 종료
        </button>
      </span>
    </div>
  );
};

export default TopStats;
