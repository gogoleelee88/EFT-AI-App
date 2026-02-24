-- Menstrual extension migration for spec_loop.
-- Run once on the target database. This script is SQLite-friendly.

ALTER TABLE conditions ADD COLUMN condition_domain TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE conditions ADD COLUMN metrics JSON;
ALTER TABLE conditions ADD COLUMN data_quality TEXT;
ALTER TABLE conditions ADD COLUMN confidence TEXT;

CREATE TABLE IF NOT EXISTS cycle_model_states (
  cycle_state_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NULL,
  date DATE NOT NULL,
  last_period_start_date DATE NULL,
  avg_cycle_len_days INTEGER NULL,
  cycle_len_std_days INTEGER NULL,
  irregularity_level TEXT NOT NULL DEFAULT 'MED',
  phase_prob JSON NULL,
  next_period_window JSON NULL,
  confidence TEXT NOT NULL DEFAULT 'low',
  evidence_snapshot JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cycle_model_states_user_date
  ON cycle_model_states(user_id, date);

CREATE TABLE IF NOT EXISTS daily_condition_summaries (
  summary_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NULL,
  day_id INTEGER NULL,
  condition_id INTEGER NULL,
  date DATE NOT NULL,
  drivers JSON NULL,
  confidence TEXT NULL,
  evidence_snapshot JSON NULL,
  menstrual_score INTEGER NULL,
  data_quality TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(day_id) REFERENCES day_plans(day_id) ON DELETE SET NULL,
  FOREIGN KEY(condition_id) REFERENCES conditions(condition_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_condition_summaries_user_date
  ON daily_condition_summaries(user_id, date);

CREATE INDEX IF NOT EXISTS ix_cycle_model_states_date ON cycle_model_states(date);
CREATE INDEX IF NOT EXISTS ix_daily_condition_summaries_date ON daily_condition_summaries(date);
