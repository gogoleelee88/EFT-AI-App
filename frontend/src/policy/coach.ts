/**
 * Coaching Policy Engine
 * RED/YELLOW/GREEN decision system for meditation coaching
 *
 * ⚠️ CONTRACT SIGNATURE - DO NOT CHANGE:
 * - decideCoach function signature
 * - CoachDecision type definition
 * - CoachAction type definition
 */

import type { FaceSignals } from "../signals/face";

/**
 * ⚠️ CONTRACT TYPE - DO NOT MODIFY
 * Coaching action types
 */
export type CoachAction =
  | "눈을 감아보세요"
  | "심호흡을 해보세요"
  | "천천히 호흡해보세요"
  | "몸의 긴장을 풀어보세요"
  | "고개를 천천히 돌려보세요"
  | "잘하고 계세요!"
  | "집중을 유지하세요";

/**
 * ⚠️ CONTRACT TYPE - DO NOT MODIFY
 * Coaching decision output
 */
export interface CoachDecision {
  level: "GREEN" | "YELLOW" | "RED";
  actions: CoachAction[];
  cooldownSec: number;
}

/**
 * Last coaching time for cooldown management
 */
let lastCoachTime = 0;

/**
 * ⚠️ CONTRACT FUNCTION - SIGNATURE MUST NOT CHANGE
 *
 * Main policy engine: decides coaching level and actions
 *
 * @param face - Facial signals from MediaPipe
 * @param breathsPerMin - Breathing rate (optional)
 * @param rppgConfidence - rPPG confidence score (optional)
 * @returns CoachDecision with level, actions, and cooldown
 */
export function decideCoach(
  face: FaceSignals,
  breathsPerMin?: number | null,
  rppgConfidence?: number
): CoachDecision {
  const now = Date.now();

  // Default: GREEN level (all good)
  let decision: CoachDecision = {
    level: "GREEN",
    actions: ["잘하고 계세요!"],
    cooldownSec: 30,
  };

  // RED triggers (immediate coaching needed) - 테스트용 낮은 임계치
  const redTriggers: { triggered: boolean; action: CoachAction }[] = [
    {
      triggered: face.eyeOpen < 0.3 && face.perclos > 0.6,
      action: "눈을 감아보세요",
    },
    {
      triggered: face.tension > 0.6, // 0.7 → 0.6
      action: "몸의 긴장을 풀어보세요",
    },
    {
      triggered: Math.abs(face.head.yaw) > 20 || Math.abs(face.head.pitch) > 20, // 30 → 20
      action: "고개를 천천히 돌려보세요",
    },
  ];

  const activatedRed = redTriggers.filter((t) => t.triggered);

  if (activatedRed.length > 0) {
    decision = {
      level: "RED",
      actions: activatedRed.map((t) => t.action),
      cooldownSec: 8, // 10 → 8
    };
  } else {
    // YELLOW triggers (gentle reminders) - 테스트용 낮은 임계치
    const yellowTriggers: { triggered: boolean; action: CoachAction }[] = [
      {
        triggered: breathsPerMin !== null && breathsPerMin !== undefined && breathsPerMin < 8, // 6 → 8
        action: "심호흡을 해보세요",
      },
      {
        triggered: breathsPerMin !== null && breathsPerMin !== undefined && breathsPerMin > 20, // 빠른 호흡 감지
        action: "천천히 호흡해보세요",
      },
      {
        triggered: face.blinkRate > 25, // 30 → 25
        action: "집중을 유지하세요",
      },
      {
        triggered: face.tension > 0.4, // 0.5 → 0.4
        action: "몸의 긴장을 풀어보세요",
      },
    ];

    const activatedYellow = yellowTriggers.filter((t) => t.triggered);

    if (activatedYellow.length > 0) {
      decision = {
        level: "YELLOW",
        actions: activatedYellow.map((t) => t.action),
        cooldownSec: 12, // 15 → 12
      };
    }
  }

  // Cooldown check: don't coach too frequently
  const timeSinceLastCoach = (now - lastCoachTime) / 1000;
  if (timeSinceLastCoach < decision.cooldownSec) {
    // Still in cooldown, return GREEN with no action
    return {
      level: "GREEN",
      actions: [],
      cooldownSec: decision.cooldownSec - timeSinceLastCoach,
    };
  }

  // Update last coach time if not GREEN or has actions
  if (decision.level !== "GREEN" || decision.actions.length > 0) {
    lastCoachTime = now;
  }

  return decision;
}

/**
 * Reset cooldown timer (for testing or manual reset)
 */
export function resetCooldown(): void {
  lastCoachTime = 0;
}

/**
 * Get policy thresholds (for debugging/UI display)
 */
export function getPolicyThresholds() {
  return {
    red: {
      eyeOpen: 0.3,
      perclos: 0.7,
      tension: 0.7,
      headAngle: 30,
    },
    yellow: {
      breathRate: 6,
      blinkRate: 30,
      tension: 0.5,
    },
    cooldown: {
      red: 15,
      yellow: 20,
      green: 30,
    },
  };
}

/**
 * Evaluate overall meditation quality (0-100 score)
 */
export function evaluateMeditationQuality(
  face: FaceSignals,
  breathsPerMin: number | null,
  sessionDuration: number // in seconds
): number {
  let score = 100;

  // Deduct points for issues
  if (face.eyeOpen < 0.5) score -= 10; // Eyes should be open or gently closed
  if (face.tension > 0.5) score -= 20; // Tension is bad
  if (Math.abs(face.head.yaw) > 15) score -= 10; // Head should be centered
  if (face.blinkRate > 25) score -= 10; // Excessive blinking = distraction
  if (breathsPerMin !== null && breathsPerMin < 8) score -= 15; // Shallow breathing

  // Bonus for session duration
  if (sessionDuration > 300) score += 10; // 5+ minutes
  if (sessionDuration > 600) score += 10; // 10+ minutes

  return Math.max(0, Math.min(100, score));
}
