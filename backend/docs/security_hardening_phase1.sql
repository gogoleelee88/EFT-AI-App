-- Security hardening phase 1 (additive, backward-compatible)
-- Target: PostgreSQL (SQLite users should keep create_all startup patch path)

-- 1) day_plans columns
-- PostgreSQL
ALTER TABLE day_plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
ALTER TABLE day_plans ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_day_plans_deleted_at ON day_plans(deleted_at);

-- 2) mission_runs
CREATE TABLE IF NOT EXISTS mission_runs (
  mission_run_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(36) NULL,
  day_id INTEGER NOT NULL,
  item_id VARCHAR(64) NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'started',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  dismissed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_runs_user_id ON mission_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_mission_runs_day_id ON mission_runs(day_id);
CREATE INDEX IF NOT EXISTS idx_mission_runs_state ON mission_runs(state);

-- 3) alarm_jobs
CREATE TABLE IF NOT EXISTS alarm_jobs (
  alarm_job_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id VARCHAR(36) NULL,
  day_id INTEGER NOT NULL,
  item_id VARCHAR(64) NULL,
  channel VARCHAR(24) NOT NULL DEFAULT 'push',
  send_at TIMESTAMP NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  dedupe_key VARCHAR(128) NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMP NULL,
  canceled_at TIMESTAMP NULL,
  last_error VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alarm_jobs_status_send_at ON alarm_jobs(status, send_at);
CREATE INDEX IF NOT EXISTS idx_alarm_jobs_day_id ON alarm_jobs(day_id);
