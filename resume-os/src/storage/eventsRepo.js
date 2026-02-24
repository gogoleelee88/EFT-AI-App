// events 및 nudges, state_snapshots 관련 기본 CRUD 유틸
const { initializeSchema } = require('./db');

// 단일 글로벌 DB 연결 재사용 (간단화를 위해)
const db = initializeSchema();

function logEvent(type, payload, confidence = null) {
  const ts = Date.now();
  const json = JSON.stringify(payload ?? {});
  db.run(
    'INSERT INTO events (ts, type, payload_json, confidence) VALUES (?, ?, ?, ?)',
    [ts, type, json, confidence],
    (err) => {
      if (err) console.error('[eventsRepo] logEvent error:', err);
    }
  );
}

function insertNudge({ type, accepted_bool = null, snooze_minutes = null, dismissed_bool = null }, cb) {
  const ts = Date.now();
  db.run(
    'INSERT INTO nudges (ts, type, accepted_bool, snooze_minutes, dismissed_bool) VALUES (?, ?, ?, ?, ?)',
    [ts, type, accepted_bool ? 1 : 0, snooze_minutes, dismissed_bool ? 1 : 0],
    function onDone(err) {
      if (err) {
        console.error('[eventsRepo] insertNudge error:', err);
        if (cb) cb(err);
        return;
      }
      if (cb) cb(null, this.lastID);
    }
  );
}

function getRecentNudges(sinceMs, cb) {
  const sinceTs = Date.now() - sinceMs;
  db.all(
    'SELECT id, ts, type, accepted_bool, snooze_minutes, dismissed_bool FROM nudges WHERE ts >= ? ORDER BY ts DESC',
    [sinceTs],
    (err, rows) => {
      if (err) {
        console.error('[eventsRepo] getRecentNudges error:', err);
        cb(err, []);
        return;
      }
      const nudges = rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        type: r.type,
        accepted_bool: r.accepted_bool === null ? null : !!r.accepted_bool,
        snooze_minutes: r.snooze_minutes,
        dismissed_bool: r.dismissed_bool === null ? null : !!r.dismissed_bool,
      }));
      cb(null, nudges);
    }
  );
}

function getRecentEvents(sinceMs, types, cb) {
  const sinceTs = Date.now() - sinceMs;
  let sql = 'SELECT ts, type, payload_json, confidence FROM events WHERE ts >= ?';
  const params = [sinceTs];
  if (Array.isArray(types) && types.length > 0) {
    const placeholders = types.map(() => '?').join(',');
    sql += ` AND type IN (${placeholders})`;
    params.push(...types);
  }
  sql += ' ORDER BY ts DESC';
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[eventsRepo] getRecentEvents error:', err);
      cb(err, []);
      return;
    }
    const events = rows.map((r) => ({
      ts: r.ts,
      type: r.type,
      payload: JSON.parse(r.payload_json || '{}'),
      confidence: r.confidence,
    }));
    cb(null, events);
  });
}

/**
 * 특정 시간 구간 내 이벤트 조회 (매일 프로파일 집계용)
 * @param {number} startTs
 * @param {number} endTs
 * @param {string[]} [types] - 필터할 type (비우면 전체)
 * @param {function(Error?, Array)} cb
 */
function getEventsInRange(startTs, endTs, types, cb) {
  let sql = 'SELECT ts, type, payload_json, confidence FROM events WHERE ts >= ? AND ts <= ?';
  const params = [startTs, endTs];
  if (Array.isArray(types) && types.length > 0) {
    const placeholders = types.map(() => '?').join(',');
    sql += ` AND type IN (${placeholders})`;
    params.push(...types);
  }
  sql += ' ORDER BY ts ASC';
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('[eventsRepo] getEventsInRange error:', err);
      cb(err, []);
      return;
    }
    const events = rows.map((r) => ({
      ts: r.ts,
      type: r.type,
      payload: JSON.parse(r.payload_json || '{}'),
      confidence: r.confidence,
    }));
    cb(null, events);
  });
}

/**
 * 특정 시간 구간 내 nudges 조회 (매일 프로파일 집계용)
 * @param {number} startTs
 * @param {number} endTs
 * @param {function(Error?, Array)} cb
 */
function getNudgesInRange(startTs, endTs, cb) {
  db.all(
    'SELECT ts, type, accepted_bool, snooze_minutes, dismissed_bool FROM nudges WHERE ts >= ? AND ts <= ? ORDER BY ts ASC',
    [startTs, endTs],
    (err, rows) => {
      if (err) {
        console.error('[eventsRepo] getNudgesInRange error:', err);
        cb(err, []);
        return;
      }
      cb(
        null,
        rows.map((r) => ({
          ts: r.ts,
          type: r.type,
          accepted_bool: r.accepted_bool === null ? null : !!r.accepted_bool,
          snooze_minutes: r.snooze_minutes,
          dismissed_bool: r.dismissed_bool === null ? null : !!r.dismissed_bool,
        }))
      );
    }
  );
}

function updateNudgeDecision(id, { accepted_bool, snooze_minutes, dismissed_bool }) {
  const fields = [];
  const params = [];
  if (accepted_bool !== undefined) {
    fields.push('accepted_bool = ?');
    params.push(accepted_bool === null ? null : accepted_bool ? 1 : 0);
  }
  if (snooze_minutes !== undefined) {
    fields.push('snooze_minutes = ?');
    params.push(snooze_minutes);
  }
  if (dismissed_bool !== undefined) {
    fields.push('dismissed_bool = ?');
    params.push(dismissed_bool === null ? null : dismissed_bool ? 1 : 0);
  }
  if (!fields.length) return;

  const sql = `UPDATE nudges SET ${fields.join(', ')} WHERE id = ?`;
  params.push(id);
  db.run(sql, params, (err) => {
    if (err) console.error('[eventsRepo] updateNudgeDecision error:', err);
  });
}

module.exports = {
  logEvent,
  insertNudge,
  getRecentNudges,
  getRecentEvents,
  getEventsInRange,
  getNudgesInRange,
  updateNudgeDecision,
};


