// KPI 로깅:
// - KPI1: Resume 카드 노출 후 30초 내 입력 재개율
// - KPI2: Stuck nudge 후 3분 내 진행 변화율

const { getRecentEvents, getRecentNudges, logEvent } = require('../storage/eventsRepo');

/**
 * 간단한 KPI 계산 루틴 (주기적으로 호출).
 * 현재는 "최근 보낸 nudge" 기준으로만 통계를 로깅한다.
 */
function tickKpiLogger() {
  const now = Date.now();

  // 최근 10분 내 nudge (resume/stuck 계열) 조회
  const tenMinMs = 10 * 60 * 1000;
  getRecentNudges(tenMinMs, (err, nudges) => {
    if (err || !nudges.length) return;

    const lastNudge = nudges[0];
    const delta = now - lastNudge.ts;

    // KPI1: Resume 계열 nudge 후 30초 내 KEY_ACTIVITY 발생 여부
    if (lastNudge.type === 'RESUME' && delta >= 30 * 1000 && delta <= 2 * 60 * 1000) {
      getRecentEvents(2 * 60 * 1000, ['KEY_ACTIVITY'], (eErr, events) => {
        if (eErr) return;
        const keyAfter = events.filter((e) => e.ts >= lastNudge.ts && e.type === 'KEY_ACTIVITY');
        const resumed = keyAfter.length > 0;
        logEvent('KPI', { kind: 'KPI1_RESUME_REENGAGE_30S', resumed, nudge_ts: lastNudge.ts }, 1.0);
      });
    }

    // KPI2: STUCK_NUDGE 후 3분 내 진행 변화 (APP_FOCUS/KEY_ACTIVITY 이벤트 존재 여부)
    if (lastNudge.type === 'STUCK_NUDGE' && delta >= 3 * 60 * 1000 && delta <= 10 * 60 * 1000) {
      getRecentEvents(10 * 60 * 1000, ['APP_FOCUS', 'KEY_ACTIVITY'], (eErr, events) => {
        if (eErr) return;
        const changed = events.filter((e) => e.ts >= lastNudge.ts).length > 0;
        logEvent('KPI', { kind: 'KPI2_STUCK_PROGRESS_3M', changed, nudge_ts: lastNudge.ts }, 1.0);
      });
    }
  });
}

module.exports = {
  tickKpiLogger,
};

