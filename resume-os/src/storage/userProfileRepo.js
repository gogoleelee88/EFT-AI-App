/**
 * user_profile: 사용자당 하나의 누적 프로파일 (맞춤화용)
 *
 * JSON 필드 구조 (기본 + 감정/행동/습관/고민/방해요소 정리):
 * - preferred_tone: "encouraging" | "formal" | "brief" 등
 * - nudge_patterns_json: { byType: { RESUME: { sent, accepted, dismissed, snoozed }, ... }, acceptRate, snoozeRate }
 * - effective_eft_json: [{ sessionType, feedbackScore, count }, ...]
 * - emotion_chat_patterns_json: { stressTriggers: [], frequentKeywords: [], moodTrends: [] }
 * - focus_golden_hours_json: [{ hour, avgFocusRatio }, ...]
 * - stuck_context_json: { topAppsWhenStuck: [], frequentSituations: [] }
 * - questionnaire_summary_json: { categories: {}, insightSummary: "" }
 * - emotion_patterns_json: { dominantMoods: [], triggers: [], weeklyTrend: [] }   // 감정 패턴
 * - behavior_patterns_json: { responseToStress: [], focusBehaviors: [] }         // 행동 패턴
 * - habit_patterns_json: [{ habit: "", frequency: "", context: "" }, ...]         // 습관 패턴
 * - frequent_concerns_json: [{ concern: "", count: 0, lastAt: 0 }, ...]           // 자주 하는 고민 (감정/채팅에서 추출)
 * - frequent_blockers_json: [{ blocker: "", context: "", count: 0 }, ...]        // 업무 막히는 방해요소 (막힐 때 앱/상황)
 */

const { openDb } = require('./sqlite');
const { getEventsInRange, getNudgesInRange } = require('./eventsRepo');

const db = openDb();

const PROFILE_KEYS = [
  'preferred_tone',
  'nudge_patterns_json',
  'effective_eft_json',
  'emotion_chat_patterns_json',
  'focus_golden_hours_json',
  'stuck_context_json',
  'questionnaire_summary_json',
  'emotion_patterns_json',
  'behavior_patterns_json',
  'habit_patterns_json',
  'frequent_concerns_json',
  'frequent_blockers_json',
];

function parseJson(val) {
  if (val == null || val === '') return null;
  try {
    return JSON.parse(val);
  } catch (_) {
    return null;
  }
}

/**
 * 프로파일 조회 (user_id 기준 1행)
 * @param {string} userId
 * @param {function(Error?, Object|null)} cb - JSON 필드는 파싱된 객체로 반환
 */
function getProfile(userId, cb) {
  const uid = userId || 'default';
  db.get('SELECT * FROM user_profile WHERE user_id = ?', [uid], (err, row) => {
    if (err) {
      cb(err, null);
      return;
    }
    if (!row) {
      cb(null, null);
      return;
    }
    const profile = { user_id: row.user_id, updated_at: row.updated_at };
    PROFILE_KEYS.forEach((key) => {
      const val = row[key];
      profile[key.replace('_json', '')] = key.endsWith('_json') ? parseJson(val) : val;
    });
    cb(null, profile);
  });
}

/**
 * 프로파일 병합 업데이트 (넣은 필드만 갱신)
 * @param {string} userId
 * @param {Object} updates - preferred_tone, nudge_patterns, emotion_patterns 등 (키는 _json 제외한 이름 가능)
 * @param {function(Error?)} cb
 */
function upsertProfile(userId, updates, cb) {
  const uid = userId || 'default';
  const now = Date.now();

  const cols = [];
  const vals = [];
  PROFILE_KEYS.forEach((col) => {
    const shortKey = col.replace('_json', '');
    const val = updates[shortKey] !== undefined ? updates[shortKey] : updates[col];
    if (val === undefined) return;
    cols.push(col);
    vals.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
  });
  if (!cols.length) {
    if (cb) cb(null);
    return;
  }
  cols.push('updated_at');
  vals.push(now);

  const placeholders = cols.map(() => '?').join(', ');
  const conflictSet = cols.map((c) => `${c} = excluded.${c}`).join(', ');
  const sql = `INSERT INTO user_profile (user_id, ${cols.join(', ')})
     VALUES (?, ${placeholders})
     ON CONFLICT(user_id) DO UPDATE SET ${conflictSet}`;
  db.run(sql, [uid, ...vals], (err) => {
    if (err) console.error('[userProfileRepo] upsertProfile error:', err);
    if (cb) cb(err);
  });
}

/**
 * 기존 데이터(nudges, daily_user_profile, events)로부터 프로파일 필드 유도
 * - nudge 패턴, 막힐 때 앱, 집중 높은 시간대 등
 * - 감정/고민/방해요소는 구조만 채우고, 추후 감정·채팅 로그 연동 시 채움
 */
function deriveProfileFromData(userId, cb) {
  const uid = userId || 'default';
  const now = Date.now();
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startTs = sevenDaysAgo.getTime();
  const endTs = today.getTime();

  getNudgesInRange(startTs, endTs, (err, nudges) => {
    if (err) {
      cb(err, null);
      return;
    }

    const byType = {};
    let accepted = 0;
    let dismissed = 0;
    let snoozed = 0;
    nudges.forEach((n) => {
      const t = n.type || 'UNKNOWN';
      if (!byType[t]) byType[t] = { sent: 0, accepted: 0, dismissed: 0, snoozed: 0 };
      byType[t].sent += 1;
      if (n.accepted_bool === true) {
        accepted += 1;
        byType[t].accepted += 1;
      }
      if (n.dismissed_bool === true) {
        dismissed += 1;
        byType[t].dismissed += 1;
      }
      if (n.snooze_minutes != null && n.snooze_minutes > 0) {
        snoozed += 1;
        byType[t].snoozed += 1;
      }
    });

    const total = nudges.length;
    const nudge_patterns = {
      byType,
      totalSent: total,
      acceptRate: total > 0 ? accepted / total : 0,
      dismissRate: total > 0 ? dismissed / total : 0,
      snoozeRate: total > 0 ? snoozed / total : 0,
    };

    db.all(
      `SELECT date, focus_ratio, stuck_ratio, top_apps_json, app_focus_switches
       FROM daily_user_profile WHERE user_id = ? AND date >= ? AND date <= ?
       ORDER BY date DESC`,
      [uid, sevenDaysAgo.toISOString().slice(0, 10), today.toISOString().slice(0, 10)],
      (eErr, rows) => {
        if (eErr) {
          cb(eErr, null);
          return;
        }

        const focusByHour = {};
        const stuckAppCounts = {};
        rows.forEach((r) => {
          const focusRatio = r.focus_ratio || 0;
          const stuckRatio = r.stuck_ratio || 0;
          const date = r.date;
          const hour = date ? 12 : 12;
          if (!focusByHour[hour]) focusByHour[hour] = { sum: 0, n: 0 };
          focusByHour[hour].sum += focusRatio;
          focusByHour[hour].n += 1;

          if (stuckRatio > 0.1 && r.top_apps_json) {
            try {
              const apps = JSON.parse(r.top_apps_json);
              apps.forEach((a) => {
                stuckAppCounts[a.app] = (stuckAppCounts[a.app] || 0) + (a.count || 0);
              });
            } catch (_) {}
          }
        });

        const focus_golden_hours = Object.entries(focusByHour)
          .map(([h, v]) => ({ hour: Number(h), avgFocusRatio: v.n > 0 ? v.sum / v.n : 0 }))
          .filter((x) => x.avgFocusRatio > 0.3)
          .sort((a, b) => b.avgFocusRatio - a.avgFocusRatio)
          .slice(0, 5);

        const topStuckApps = Object.entries(stuckAppCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([app, count]) => ({ app, count }));

        const stuck_context = {
          topAppsWhenStuck: topStuckApps,
          frequentSituations: [],
        };

        const updates = {
          nudge_patterns,
          focus_golden_hours,
          stuck_context,
          emotion_patterns: { dominantMoods: [], triggers: [], weeklyTrend: [] },
          behavior_patterns: { responseToStress: [], focusBehaviors: [] },
          habit_patterns: [],
          frequent_concerns: [],
          frequent_blockers: topStuckApps.map((a) => ({ blocker: a.app, context: 'stuck_high', count: a.count })),
        };

        cb(null, updates);
      }
    );
  });
}

/**
 * derive 후 upsert 한 번에 실행 (배치용)
 * @param {string} [userId='default']
 * @param {function(Error?)} [cb]
 */
function refreshProfileFromData(userId, cb) {
  const uid = userId || 'default';
  deriveProfileFromData(uid, (err, updates) => {
    if (err) {
      if (cb) cb(err);
      return;
    }
    upsertProfile(uid, updates, cb);
  });
}

module.exports = {
  getProfile,
  upsertProfile,
  deriveProfileFromData,
  refreshProfileFromData,
  PROFILE_KEYS,
};
