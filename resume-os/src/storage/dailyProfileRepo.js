// daily_user_profile: 매일 사용자 프로파일 집계 (상태 비율 + nudge + 앱/행동 + 1문단 요약)
const { openDb } = require('./sqlite');
const { getStateRatiosForDay } = require('./dailySummaryRepo');
const { getEventsInRange, getNudgesInRange } = require('./eventsRepo');

const db = openDb();

function getDateRange(dateStr) {
  const startTs = new Date(dateStr + 'T00:00:00').getTime();
  const endTs = new Date(dateStr + 'T23:59:59.999').getTime();
  return { startTs, endTs };
}

/**
 * 특정 날짜의 프로파일 데이터 집계 (상태 비율, nudge, 앱/행동, 요약 문단)
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {function(Error?, Object)} cb - profile 객체
 */
function buildProfileForDay(dateStr, cb) {
  const { startTs, endTs } = getDateRange(dateStr);

  getStateRatiosForDay(dateStr, (err, ratios) => {
    if (err) {
      cb(err);
      return;
    }

    getNudgesInRange(startTs, endTs, (nErr, nudges) => {
      if (nErr) {
        cb(nErr);
        return;
      }

      const nudge_total = nudges.length;
      const nudge_accepted = nudges.filter((n) => n.accepted_bool === true).length;
      const nudge_dismissed = nudges.filter((n) => n.dismissed_bool === true).length;
      const nudge_snoozed = nudges.filter((n) => n.snooze_minutes != null && n.snooze_minutes > 0).length;

      getEventsInRange(startTs, endTs, ['APP_FOCUS', 'KEY_ACTIVITY', 'ACTIVITY_RECOG'], (eErr, events) => {
        if (eErr) {
          cb(eErr);
          return;
        }

        const focusEvents = events.filter((e) => e.type === 'APP_FOCUS');
        const keyEvents = events.filter((e) => e.type === 'KEY_ACTIVITY');
        const activityEvents = events.filter((e) => e.type === 'ACTIVITY_RECOG');

        const appCounts = {};
        focusEvents.forEach((e) => {
          const app = e.payload?.app || 'unknown';
          appCounts[app] = (appCounts[app] || 0) + 1;
        });
        const topApps = Object.entries(appCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([app, count]) => ({ app, count }));

        const labelCounts = {};
        activityEvents.forEach((e) => {
          const label = e.payload?.label || 'Unknown';
          labelCounts[label] = (labelCounts[label] || 0) + 1;
        });
        const activityLabels = Object.entries(labelCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([label, count]) => ({ label, count }));

        const key_activity_total = keyEvents.reduce((sum, e) => sum + (e.payload?.key_presses || 0), 0);
        const app_focus_switches = focusEvents.length;

        const summary_paragraph = buildSummaryParagraph({
          dateStr,
          ratios,
          nudge_total,
          nudge_accepted,
          nudge_dismissed,
          nudge_snoozed,
          topApps,
          activityLabels,
          key_activity_total,
          app_focus_switches,
        });

        cb(null, {
          ...ratios,
          nudge_total,
          nudge_accepted,
          nudge_dismissed,
          nudge_snoozed,
          top_apps_json: JSON.stringify(topApps),
          activity_labels_json: JSON.stringify(activityLabels),
          key_activity_total,
          app_focus_switches,
          summary_paragraph,
        });
      });
    });
  });
}

/**
 * 템플릿 기반 1문단 요약 (향후 LLM으로 대체 가능)
 */
function buildSummaryParagraph(agg) {
  const {
    dateStr,
    ratios,
    nudge_total,
    nudge_accepted,
    nudge_dismissed,
    nudge_snoozed,
    topApps,
    activityLabels,
    key_activity_total,
    app_focus_switches,
  } = agg;

  const focusPct = Math.round((ratios.focus_ratio || 0) * 100);
  const idlePct = Math.round((ratios.idle_ratio || 0) * 100);
  const stuckPct = Math.round((ratios.stuck_ratio || 0) * 100);
  const distractedPct = Math.round((ratios.distracted_ratio || 0) * 100);

  const parts = [];

  parts.push(`${dateStr} 기준으로`);
  if (focusPct > 0) parts.push(`집중 비율 ${focusPct}%`);
  if (idlePct > 0) parts.push(`대기 ${idlePct}%`);
  if (stuckPct > 0) parts.push(`막힘 ${stuckPct}%`);
  if (distractedPct > 0) parts.push(`산만 ${distractedPct}%`);
  parts.push('입니다.');

  if (nudge_total > 0) {
    parts.push(
      `재개 알림은 ${nudge_total}회 중 ${nudge_accepted}회 수락, ${nudge_dismissed}회 거절, ${nudge_snoozed}회 스누즈였습니다.`
    );
  }

  if (topApps.length > 0) {
    const top = topApps.slice(0, 3).map((a) => a.app).join(', ');
    parts.push(`주로 사용한 앱: ${top}.`);
  }

  if (key_activity_total > 0) {
    parts.push(`키 입력 집계 ${key_activity_total}회, 앱 전환 ${app_focus_switches}회.`);
  }

  if (activityLabels.length > 0) {
    const labels = activityLabels.slice(0, 3).map((l) => l.label).join(', ');
    parts.push(`인식된 행동: ${labels}.`);
  }

  return parts.join(' ');
}

/**
 * daily_user_profile 행 upsert
 */
function upsertDailyProfile(userId, dateStr, profile, cb) {
  const now = Date.now();
  db.run(
    `INSERT INTO daily_user_profile (
      user_id, date, focus_ratio, idle_ratio, stuck_ratio, distracted_ratio, fatigued_ratio,
      nudge_total, nudge_accepted, nudge_dismissed, nudge_snoozed,
      top_apps_json, activity_labels_json, key_activity_total, app_focus_switches,
      summary_paragraph, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      focus_ratio = excluded.focus_ratio,
      idle_ratio = excluded.idle_ratio,
      stuck_ratio = excluded.stuck_ratio,
      distracted_ratio = excluded.distracted_ratio,
      fatigued_ratio = excluded.fatigued_ratio,
      nudge_total = excluded.nudge_total,
      nudge_accepted = excluded.nudge_accepted,
      nudge_dismissed = excluded.nudge_dismissed,
      nudge_snoozed = excluded.nudge_snoozed,
      top_apps_json = excluded.top_apps_json,
      activity_labels_json = excluded.activity_labels_json,
      key_activity_total = excluded.key_activity_total,
      app_focus_switches = excluded.app_focus_switches,
      summary_paragraph = excluded.summary_paragraph,
      created_at = excluded.created_at`,
    [
      userId || 'default',
      dateStr,
      profile.focus_ratio ?? 0,
      profile.idle_ratio ?? 0,
      profile.stuck_ratio ?? 0,
      profile.distracted_ratio ?? 0,
      profile.fatigued_ratio ?? 0,
      profile.nudge_total ?? 0,
      profile.nudge_accepted ?? 0,
      profile.nudge_dismissed ?? 0,
      profile.nudge_snoozed ?? 0,
      profile.top_apps_json ?? '[]',
      profile.activity_labels_json ?? '[]',
      profile.key_activity_total ?? 0,
      profile.app_focus_switches ?? 0,
      profile.summary_paragraph ?? null,
      now,
    ],
    (err) => {
      if (err) console.error('[dailyProfileRepo] upsertDailyProfile error:', err);
      if (cb) cb(err);
    }
  );
}

/**
 * 어제/오늘에 대해 프로파일 집계 후 저장 (배치)
 * @param {string} [userId='default']
 * @param {function(Error?)} [cb]
 */
function runDailyProfileBatch(userId, cb) {
  const callback = typeof userId === 'function' ? userId : cb;
  const uid = typeof userId === 'string' ? userId : 'default';

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dates = [yesterday.toISOString().slice(0, 10), today.toISOString().slice(0, 10)];

  let done = 0;
  const onDone = (err) => {
    done++;
    if (done === 2 && callback) callback(err);
  };

  dates.forEach((dateStr) => {
    buildProfileForDay(dateStr, (err, profile) => {
      if (err) {
        onDone(err);
        return;
      }
      upsertDailyProfile(uid, dateStr, profile, onDone);
    });
  });
}

/**
 * 특정 날짜의 프로파일 조회
 * @param {string} userId
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {function(Error?, Object|null)} cb
 */
function getDailyProfile(userId, dateStr, cb) {
  db.get(
    `SELECT * FROM daily_user_profile WHERE user_id = ? AND date = ?`,
    [userId || 'default', dateStr],
    (err, row) => {
      if (err) {
        cb(err, null);
        return;
      }
      if (!row) {
        cb(null, null);
        return;
      }
      const profile = {
        ...row,
        top_apps_json: row.top_apps_json ? JSON.parse(row.top_apps_json) : [],
        activity_labels_json: row.activity_labels_json ? JSON.parse(row.activity_labels_json) : [],
      };
      cb(null, profile);
    }
  );
}

module.exports = {
  buildProfileForDay,
  upsertDailyProfile,
  runDailyProfileBatch,
  getDailyProfile,
};
