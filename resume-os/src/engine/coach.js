// Proactive Coach: 상태 + 정책 기반으로 nudge 트리거를 결정

const { evaluateNudgeBudget } = require('./nudgeBudget');
const { getRecentNudges, logEvent, insertNudge } = require('../storage/eventsRepo');
const { getRecentStateSnapshots } = require('../storage/stateRepo');
const eventBus = require('./eventBus');

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

/**
 * 최근 state_snapshots 를 기준으로 특정 상태가 얼마나 지속됐는지(분)를 추정.
 * @param {string} state
 * @param {{ts:number,state:string}[]} snapshots
 */
function getStateDurationMinutes(state, snapshots) {
  if (!snapshots.length) return 0;
  const now = Date.now();
  const lastOther = snapshots.find((s) => s.state !== state);
  const sinceTs = lastOther ? lastOther.ts : snapshots[snapshots.length - 1].ts;
  return (now - sinceTs) / 60000;
}

/**
 * 현재 상태 snapshot을 받아, IDLE/STUCK/DISTRACTED 트리거를 평가하고 필요 시 nudge를 생성.
 * Non-Negotiable: nudgeBudget 평가를 반드시 거친다.
 */
function evaluateProactiveCoach(snapshot) {
  const now = snapshot.ts;

  // 최근 상태 스냅샷(15분) 조회
  getRecentStateSnapshots(FIFTEEN_MIN_MS, (err, snaps) => {
    if (err) return;

    const idleMinutes = getStateDurationMinutes('IDLE', snaps);
    const stuckMinutes = getStateDurationMinutes('STUCK', snaps);
    const distractedMinutes = getStateDurationMinutes('DISTRACTED', snaps);

    let desiredNudgeType = null;

    // IDLE 7~12분 + 할 일 있음 (MVP: 할 일 조건은 나중에 강화, 지금은 상태만으로)
    if (snapshot.state === 'IDLE' && idleMinutes >= 7 && idleMinutes <= 12) {
      desiredNudgeType = 'RESUME';
    }

    // STUCK conf ≥ 0.75 가 8~15분 지속
    if (
      snapshot.state === 'STUCK' &&
      snapshot.stuck_conf >= 0.75 &&
      stuckMinutes >= 8 &&
      stuckMinutes <= 15
    ) {
      desiredNudgeType = 'STUCK_NUDGE';
    }

    // DISTRACTED + 업무 불일치 (MVP: 단순 DISTRACTED 상태만으로 트리거)
    if (snapshot.state === 'DISTRACTED' && distractedMinutes >= 5) {
      desiredNudgeType = 'DISTRACTION_NUDGE';
    }

    if (!desiredNudgeType) return;

    // 최근 nudges 조회 → 정책 엔진에 전달
    const twoHoursMs = 2 * 60 * 60 * 1000;
    getRecentNudges(twoHoursMs, (nErr, recentNudges) => {
      if (nErr) return;
      const budget = evaluateNudgeBudget(now, recentNudges);
      if (!budget.allowed) {
        logEvent('COACHING', { action: 'nudge_blocked', reason: budget.reason, requested_type: desiredNudgeType }, 1.0);
        return;
      }

      // 허용된 경우 nudge 레코드 생성 + COACHING 이벤트 로그 + EventBus로 UI에 알림
      insertNudge(
        {
          type: desiredNudgeType,
          accepted_bool: null,
          snooze_minutes: null,
          dismissed_bool: null,
        },
        (err, id) => {
          if (err) return;
          const payload = { id, type: desiredNudgeType, ts: now, state: snapshot.state };
          logEvent('COACHING', { action: 'nudge_triggered', ...payload }, 0.95);
          logEvent('KPI', { kind: 'NUDGE_SENT', type: desiredNudgeType, ts: now }, 1.0);
          eventBus.emit('nudge', payload);
        }
      );
    });
  });
}

module.exports = {
  evaluateProactiveCoach,
};

