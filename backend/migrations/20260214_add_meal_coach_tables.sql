-- Meal Condition Coaching schema (v1)
-- Generated: 2026-02-14

CREATE TABLE IF NOT EXISTS tenant_memberships (
  membership_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'Owner',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_tenant_memberships_tenant_user UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_tenant_memberships_tenant_id ON tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS ix_tenant_memberships_user_id ON tenant_memberships(user_id);

CREATE TABLE IF NOT EXISTS meal_logs (
  meal_id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  meal_state VARCHAR(16) NOT NULL,
  meal_time DATETIME NOT NULL,
  fasting_hours FLOAT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  track_selected VARCHAR(8) NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_meal_logs_tenant_id ON meal_logs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_meal_logs_user_id ON meal_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_meal_logs_meal_time ON meal_logs(meal_time);

CREATE TABLE IF NOT EXISTS meal_photos (
  photo_id VARCHAR(36) PRIMARY KEY,
  meal_id VARCHAR(36) NOT NULL,
  storage_uri TEXT NOT NULL,
  thumbnail_uri TEXT NULL,
  embedding_ref TEXT NULL,
  raw_store BOOLEAN NOT NULL DEFAULT 0,
  expires_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_meal_photos_meal_id ON meal_photos(meal_id);

CREATE TABLE IF NOT EXISTS nutrition_estimates (
  estimate_id VARCHAR(36) PRIMARY KEY,
  meal_id VARCHAR(36) NOT NULL,
  track VARCHAR(8) NOT NULL,
  calories INTEGER NOT NULL,
  carbs_g FLOAT NOT NULL,
  protein_g FLOAT NOT NULL,
  fat_g FLOAT NOT NULL,
  sodium_mg FLOAT NOT NULL,
  labels JSON NULL,
  confidence FLOAT NOT NULL,
  uncertainty_reason JSON NULL,
  source_refs JSON NULL,
  engine_version VARCHAR(64) NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  prompt_version VARCHAR(64) NOT NULL,
  dataset_version VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_nutrition_estimates_meal_id ON nutrition_estimates(meal_id);
CREATE INDEX IF NOT EXISTS ix_nutrition_estimates_created_at ON nutrition_estimates(created_at);

CREATE TABLE IF NOT EXISTS post_meal_checks (
  check_id VARCHAR(36) PRIMARY KEY,
  meal_id VARCHAR(36) NOT NULL,
  slot VARCHAR(8) NOT NULL,
  sleepiness INTEGER NOT NULL,
  focus_drop INTEGER NOT NULL,
  sluggishness INTEGER NOT NULL,
  gi_discomfort INTEGER NULL,
  headache INTEGER NULL,
  caffeine_used BOOLEAN NOT NULL DEFAULT 0,
  check_completion_time_ms INTEGER NULL,
  submitted_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_post_meal_checks_meal_slot UNIQUE (meal_id, slot)
);
CREATE INDEX IF NOT EXISTS ix_post_meal_checks_meal_id ON post_meal_checks(meal_id);
CREATE INDEX IF NOT EXISTS ix_post_meal_checks_submitted_at ON post_meal_checks(submitted_at);

CREATE TABLE IF NOT EXISTS meal_post_effects (
  effect_id VARCHAR(36) PRIMARY KEY,
  meal_id VARCHAR(36) NOT NULL UNIQUE,
  dip_score INTEGER NOT NULL,
  dip_score_t30 INTEGER NULL,
  dip_score_t90 INTEGER NULL,
  confidence FLOAT NOT NULL,
  confidence_bucket VARCHAR(16) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_meal_post_effects_created_at ON meal_post_effects(created_at);

CREATE TABLE IF NOT EXISTS meal_advice (
  advice_id VARCHAR(36) PRIMARY KEY,
  meal_id VARCHAR(36) NOT NULL,
  dip_score INTEGER NOT NULL,
  decision_mode VARCHAR(32) NOT NULL,
  task_mode VARCHAR(32) NOT NULL,
  next_action JSON NOT NULL,
  why_tokens JSON NOT NULL,
  confidence FLOAT NOT NULL,
  engine_version VARCHAR(64) NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  prompt_version VARCHAR(64) NOT NULL,
  dataset_version VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_meal_advice_meal_id ON meal_advice(meal_id);
CREATE INDEX IF NOT EXISTS ix_meal_advice_created_at ON meal_advice(created_at);

CREATE TABLE IF NOT EXISTS consent_logs (
  consent_id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  consent_type VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  granted BOOLEAN NOT NULL,
  metadata_json JSON NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at DATETIME NULL
);
CREATE INDEX IF NOT EXISTS ix_consent_logs_tenant_id ON consent_logs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_consent_logs_user_id ON consent_logs(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(36) NOT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(64) NULL,
  target_id VARCHAR(64) NULL,
  ip_hash VARCHAR(64) NULL,
  details JSON NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS device_tokens (
  token_id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  push_token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  last_seen_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_device_tokens_user_token UNIQUE (user_id, push_token)
);
CREATE INDEX IF NOT EXISTS ix_device_tokens_tenant_id ON device_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS ix_device_tokens_user_id ON device_tokens(user_id);

CREATE TABLE IF NOT EXISTS event_logs (
  event_id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  user_pseudo_id VARCHAR(64) NOT NULL,
  meal_id VARCHAR(36) NULL,
  event_name VARCHAR(64) NOT NULL,
  event_version VARCHAR(16) NOT NULL DEFAULT 'v1',
  payload JSON NOT NULL,
  event_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_event_logs_tenant_id ON event_logs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_event_logs_meal_id ON event_logs(meal_id);
CREATE INDEX IF NOT EXISTS ix_event_logs_event_name ON event_logs(event_name);
CREATE INDEX IF NOT EXISTS ix_event_logs_event_time ON event_logs(event_time);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idem_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id VARCHAR(64) NOT NULL,
  method VARCHAR(8) NOT NULL,
  path VARCHAR(255) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_body JSON NOT NULL,
  status_code INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_idempotency_scope_key UNIQUE (tenant_id, method, path, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_idempotency_keys_tenant_id ON idempotency_keys(tenant_id);
CREATE INDEX IF NOT EXISTS ix_idempotency_keys_expires_at ON idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS meal_scheduler_jobs (
  job_id VARCHAR(36) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  meal_id VARCHAR(36) NOT NULL,
  job_type VARCHAR(32) NOT NULL,
  due_at DATETIME NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  dedupe_key VARCHAR(128) NOT NULL,
  last_error TEXT NULL,
  sent_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_meal_scheduler_jobs_dedupe_key UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS ix_meal_scheduler_jobs_tenant_id ON meal_scheduler_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS ix_meal_scheduler_jobs_user_id ON meal_scheduler_jobs(user_id);
CREATE INDEX IF NOT EXISTS ix_meal_scheduler_jobs_meal_id ON meal_scheduler_jobs(meal_id);
CREATE INDEX IF NOT EXISTS ix_meal_scheduler_jobs_due_at ON meal_scheduler_jobs(due_at);

