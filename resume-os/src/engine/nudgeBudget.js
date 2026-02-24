// Nudge Budget / Cooldown 정책 엔진
// - 30분당 개입 1회 이하
// - 사용자가 2회 연속 거절하면 90분 쿨다운
// - Snooze: 15/30/60분 동안 재개입 금지

/**
 * @typedef {Object} NudgeRecord
 * @property {number} ts - 밀리초 타임스탬프 (Date.now())
 * @property {string} type - nudge type (e.g., 'RESUME', 'STUCK', ...)
 * @property {boolean | null} [accepted_bool]
 * @property {number | null} [snooze_minutes]
 * @property {boolean | null} [dismissed_bool]
 */

const THIRTY_MIN_MS = 30 * 60 * 1000;
const NINETY_MIN_MS = 90 * 60 * 1000;

/**
 * 최근 nudge 기록과 현재 시각을 기준으로, 새로운 nudge를 보낼 수 있는지 평가한다.
 *
 * @param {number} nowMs - 현재 시각 (Date.now())
 * @param {NudgeRecord[]} recentNudges - 시간 역순 정렬 권장(가장 최근이 앞)
 * @returns {{ allowed: boolean; reason?: string }}
 */
function evaluateNudgeBudget(nowMs, recentNudges) {
  const nudges = [...recentNudges].sort((a, b) => b.ts - a.ts);

  // Snooze 정책: 마지막 nudge에 snooze_minutes가 설정되어 있고, 아직 기간 내라면 차단
  const last = nudges[0];
  if (last && last.snooze_minutes && last.snooze_minutes > 0) {
    const snoozeMs = last.snooze_minutes * 60 * 1000;
    if (nowMs - last.ts < snoozeMs) {
      return { allowed: false, reason: 'snoozed' };
    }
  }

  // 30분당 1회 이하: 최근 30분 내 모든 nudge 개수 확인
  const within30 = nudges.filter((n) => nowMs - n.ts <= THIRTY_MIN_MS);
  if (within30.length >= 1) {
    return { allowed: false, reason: 'budget_30min' };
  }

  // 2회 연속 거절 → 90분 쿨다운
  // "거절" 정의: accepted_bool === false 또는 dismissed_bool === true
  const rejects = nudges.filter(
    (n) => n.accepted_bool === false || n.dismissed_bool === true
  );
  if (rejects.length >= 2) {
    const firstReject = rejects[0];
    const secondReject = rejects[1];
    // 두 번째로 최근 거절부터 90분 이내면 쿨다운
    if (nowMs - secondReject.ts <= NINETY_MIN_MS) {
      return { allowed: false, reason: 'cooldown_90min' };
    }
  }

  return { allowed: true };
}

module.exports = {
  evaluateNudgeBudget,
};

