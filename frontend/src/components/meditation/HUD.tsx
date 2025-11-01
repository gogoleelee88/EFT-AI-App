/**
 * HUD (Heads-Up Display) Component
 * Real-time coaching feedback overlay
 */

import React from "react";
import type { CoachDecision } from "../../policy/coach";
import type { FaceSignals } from "../../signals/face";

interface HUDProps {
  coaching: CoachDecision | null;
  faceSignals: FaceSignals | null;
  breathRate: number | null;
  heartRate: number | null;
  rppgConfidence: number;
  sessionDuration: number; // in seconds
  showMetrics?: boolean;
}

export const HUD: React.FC<HUDProps> = ({
  coaching,
  faceSignals,
  breathRate,
  heartRate,
  rppgConfidence,
  sessionDuration,
  showMetrics = true,
}) => {
  // 디버깅: coaching decision 로그
  React.useEffect(() => {
    console.log('🎯 HUD decision:', {
      level: coaching?.level,
      actions: coaching?.actions,
      cooldown: coaching?.cooldownSec,
      breathRate,
      faceSignals: faceSignals ? {
        tension: faceSignals.tension.toFixed(2),
        eyeOpen: faceSignals.eyeOpen.toFixed(2),
        perclos: faceSignals.perclos.toFixed(2),
        blinkRate: faceSignals.blinkRate.toFixed(1),
        head: {
          pitch: faceSignals.head.pitch.toFixed(1),
          yaw: faceSignals.head.yaw.toFixed(1),
          roll: faceSignals.head.roll.toFixed(1)
        }
      } : null
    });
  }, [coaching, breathRate, faceSignals]);

  // Level colors
  const levelColors = {
    GREEN: "bg-emerald-500",
    YELLOW: "bg-amber-500",
    RED: "bg-rose-500",
  };

  // Hide HR/HRV if confidence < 0.4
  const showHeartRate = rppgConfidence >= 0.4 && heartRate !== null;

  // Determine coaching text - ALWAYS show something
  const getCoachingText = (): string => {
    if (!coaching) return "명상 준비 중...";

    if (coaching.actions.length > 0) {
      return coaching.actions.join(" · ");
    }

    // GREEN 억제 상태일 때도 메시지 표시
    return "좋아요. 지금 상태를 유지해요.";
  };

  const coachingText = getCoachingText();
  const level = coaching?.level || "GREEN";

  return (
    <>
      {/* Coaching messages - 하단 중앙 고정 - ALWAYS VISIBLE */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[min(92vw,560px)] z-40 pointer-events-none">
        <div className="bg-white/92 backdrop-blur border border-gray-200 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-3 whitespace-normal break-keep leading-snug text-sm">
          {/* Level indicator dot */}
          <div className={`w-3 h-3 rounded-full shrink-0 ${levelColors[level]}`} />

          {/* Coaching text */}
          <div className="flex-1 text-gray-900">
            {coachingText}
          </div>

          {/* Cooldown timer */}
          {coaching && (
            <div className="text-[10px] text-gray-400 shrink-0">
              cooldown {Math.round(coaching.cooldownSec)}s
            </div>
          )}
        </div>
      </div>

      {/* Bottom metrics panel - Heart rate only if available */}
      {showMetrics && showHeartRate && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="bg-white/90 backdrop-blur border border-gray-200 shadow rounded-2xl px-4 py-2">
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="text-gray-500">심박수</span>
              <span className="font-bold text-gray-900">
                {Math.round(heartRate)} BPM
              </span>
              <span className="text-xs text-gray-400">
                신뢰도 {Math.round(rppgConfidence * 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HUD;
