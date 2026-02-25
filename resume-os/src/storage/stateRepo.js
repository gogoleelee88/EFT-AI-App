// state_snapshots 테이블용 간단한 Repo
const { openDb } = require('./sqlite');

const db = openDb();

function insertStateSnapshot({ ts, state, stuck_conf, fatigue_score, attention_score, active_task_id = null }) {
  db.run(
    `INSERT INTO state_snapshots (ts, state, stuck_conf, fatigue_score, attention_score, active_task_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ts, state, stuck_conf, fatigue_score, attention_score, active_task_id],
    (err) => {
      if (err) console.error('[stateRepo] insertStateSnapshot error:', err);
    }
  );
}

function getRecentStateSnapshots(sinceMs, cb) {
  const sinceTs = Date.now() - sinceMs;
  db.all(
    'SELECT ts, state, stuck_conf, fatigue_score, attention_score, active_task_id FROM state_snapshots WHERE ts >= ? ORDER BY ts DESC',
    [sinceTs],
    (err, rows) => {
      if (err) {
        console.error('[stateRepo] getRecentStateSnapshots error:', err);
        cb(err, []);
        return;
      }
      cb(null, rows);
    }
  );
}

module.exports = {
  insertStateSnapshot,
  getRecentStateSnapshots,
};

