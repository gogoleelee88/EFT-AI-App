// daily_summary 테이블: 하루 단위 상태 비율 집계 (DESIGN §3)
const { openDb } = require('./sqlite');

const db = openDb();

const STATES = ['FOCUSING', 'IDLE', 'STUCK', 'DISTRACTED', 'FATIGUED', 'UNKNOWN'];

/**
 * 특정 날짜(YYYY-MM-DD)의 state_snapshots에서 상태별 비율 계산
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {function(Error?, { focus_ratio, idle_ratio, stuck_ratio, distracted_ratio, fatigued_ratio }?)} cb
 */
function getStateRatiosForDay(dateStr, cb) {
  const startTs = new Date(dateStr + 'T00:00:00').getTime();
  const endTs = new Date(dateStr + 'T23:59:59.999').getTime();
  db.all(
    'SELECT state FROM state_snapshots WHERE ts >= ? AND ts <= ? ORDER BY ts',
    [startTs, endTs],
    (err, rows) => {
      if (err) {
        cb(err);
        return;
      }
      const total = rows.length;
      const counts = { FOCUSING: 0, IDLE: 0, STUCK: 0, DISTRACTED: 0, FATIGUED: 0, UNKNOWN: 0 };
      rows.forEach((r) => {
        if (counts[r.state] !== undefined) counts[r.state]++;
        else counts.UNKNOWN++;
      });
      const ratios = {};
      STATES.forEach((s) => {
        ratios[s.toLowerCase() + '_ratio'] = total > 0 ? counts[s] / total : 0;
      });
      cb(null, {
        focus_ratio: ratios.focusing_ratio,
        idle_ratio: ratios.idle_ratio,
        stuck_ratio: ratios.stuck_ratio,
        distracted_ratio: ratios.distracted_ratio,
        fatigued_ratio: ratios.fatigued_ratio,
      });
    }
  );
}

/**
 * daily_summary 행 삽입 또는 업데이트 (user_id, date 기준)
 * @param {string} userId
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {{ focus_ratio, idle_ratio, stuck_ratio, distracted_ratio, fatigued_ratio, paragraph? }} data
 * @param {function(Error?)} cb
 */
function upsertDailySummary(userId, dateStr, data, cb) {
  const now = Date.now();
  db.run(
    `INSERT INTO daily_summary (user_id, date, focus_ratio, idle_ratio, stuck_ratio, distracted_ratio, fatigued_ratio, paragraph, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       focus_ratio = excluded.focus_ratio,
       idle_ratio = excluded.idle_ratio,
       stuck_ratio = excluded.stuck_ratio,
       distracted_ratio = excluded.distracted_ratio,
       fatigued_ratio = excluded.fatigued_ratio,
       paragraph = COALESCE(excluded.paragraph, paragraph),
       created_at = excluded.created_at`,
    [
      userId || 'default',
      dateStr,
      data.focus_ratio ?? 0,
      data.idle_ratio ?? 0,
      data.stuck_ratio ?? 0,
      data.distracted_ratio ?? 0,
      data.fatigued_ratio ?? 0,
      data.paragraph ?? null,
      now,
    ],
    (err) => {
      if (err) console.error('[dailySummaryRepo] upsertDailySummary error:', err);
      if (cb) cb(err);
    }
  );
}

/**
 * 어제/오늘 날짜에 대해 state 비율을 계산해 daily_summary에 저장 (배치)
 * @param {string} [userId='default']
 * @param {function(Error?)} [cb]
 */
function runDailySummaryBatch(userId, cb) {
  const callback = typeof userId === 'function' ? userId : cb;
  const uid = typeof userId === 'string' ? userId : 'default';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dates = [
    yesterday.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  ];

  let done = 0;
  const onDone = (err) => {
    done++;
    if (done === 2 && callback) callback(err);
  };

  dates.forEach((dateStr) => {
    getStateRatiosForDay(dateStr, (err, ratios) => {
      if (err) {
        onDone(err);
        return;
      }
      upsertDailySummary(uid, dateStr, ratios, onDone);
    });
  });
}

module.exports = {
  getStateRatiosForDay,
  upsertDailySummary,
  runDailySummaryBatch,
};
