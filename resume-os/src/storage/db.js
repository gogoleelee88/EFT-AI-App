// SQLite 스키마 초기화 및 마이그레이션
// 명세된 테이블:
// tasks, calendar_events, context_anchor, events, state_snapshots, nudges

const { openDb } = require('./sqlite');

function initializeSchema() {
  const db = openDb();

  db.serialize(() => {
    // tasks: 사용자가 관리하는 작업/목표
    db.run(
      `CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        goal TEXT,
        next_action TEXT,
        due_at INTEGER,
        location_hint TEXT,
        created_at INTEGER NOT NULL
      )`
    );

    // calendar_events: Google Calendar 등 외부 일정 동기화
    db.run(
      `CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        raw_json TEXT NOT NULL
      )`
    );

    // context_anchor: 특정 순간의 컨텍스트 앵커 (앱/윈도우/URL/스니펫)
    db.run(
      `CREATE TABLE IF NOT EXISTS context_anchor (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        app TEXT NOT NULL,
        window_title TEXT NOT NULL,
        url_hash TEXT,
        snippet_hash TEXT
      )`
    );

    // events: 센서/상태/코칭 등 모든 이벤트 로그
    db.run(
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        confidence REAL
      )`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts)`);

    // state_snapshots: 주기적으로 상태/스코어 스냅샷 저장
    db.run(
      `CREATE TABLE IF NOT EXISTS state_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        state TEXT NOT NULL,
        stuck_conf REAL,
        fatigue_score REAL,
        attention_score REAL,
        active_task_id INTEGER,
        FOREIGN KEY(active_task_id) REFERENCES tasks(id)
      )`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_state_snapshots_ts ON state_snapshots(ts)`);

    // nudges: 코칭/개입 기록 (budget, cooldown, snooze 정책용)
    db.run(
      `CREATE TABLE IF NOT EXISTS nudges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        accepted_bool INTEGER,
        snooze_minutes INTEGER,
        dismissed_bool INTEGER
      )`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_nudges_ts ON nudges(ts)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_nudges_type_ts ON nudges(type, ts)`);

    // daily_summary: DESIGN §3 하루 요약 (focus/idle/stuck 비율, 1문단 요약용)
    db.run(
      `CREATE TABLE IF NOT EXISTS daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        date TEXT NOT NULL,
        focus_ratio REAL,
        idle_ratio REAL,
        stuck_ratio REAL,
        distracted_ratio REAL,
        fatigued_ratio REAL,
        paragraph TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, date)
      )`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_daily_summary_user_date ON daily_summary(user_id, date)`);

    // daily_user_profile: 매일 사용자 프로파일 (상태 비율 + nudge + 앱/행동 집계 + 1문단 요약)
    db.run(
      `CREATE TABLE IF NOT EXISTS daily_user_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL DEFAULT 'default',
        date TEXT NOT NULL,
        focus_ratio REAL,
        idle_ratio REAL,
        stuck_ratio REAL,
        distracted_ratio REAL,
        fatigued_ratio REAL,
        nudge_total INTEGER,
        nudge_accepted INTEGER,
        nudge_dismissed INTEGER,
        nudge_snoozed INTEGER,
        top_apps_json TEXT,
        activity_labels_json TEXT,
        key_activity_total INTEGER,
        app_focus_switches INTEGER,
        summary_paragraph TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, date)
      )`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_daily_user_profile_user_date ON daily_user_profile(user_id, date)`);

    // user_profile: 사용자당 하나의 누적 프로파일 (맞춤화용)
    // - 선호 톤, nudge 패턴, 효과 있는 EFT, 감정/대화 패턴, 집중 골든타임, 막힐 때 앱
    // - 감정 패턴, 행동 패턴, 습관 패턴, 자주 하는 고민, 업무 방해요소
    db.run(
      `CREATE TABLE IF NOT EXISTS user_profile (
        user_id TEXT PRIMARY KEY,
        preferred_tone TEXT,
        nudge_patterns_json TEXT,
        effective_eft_json TEXT,
        emotion_chat_patterns_json TEXT,
        focus_golden_hours_json TEXT,
        stuck_context_json TEXT,
        questionnaire_summary_json TEXT,
        emotion_patterns_json TEXT,
        behavior_patterns_json TEXT,
        habit_patterns_json TEXT,
        frequent_concerns_json TEXT,
        frequent_blockers_json TEXT,
        updated_at INTEGER NOT NULL
      )`
    );
  });

  return db;
}

module.exports = {
  initializeSchema,
};

