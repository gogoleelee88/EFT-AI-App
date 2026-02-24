-- Menstrual module core tables
-- Policy: fertile window display disabled by default (phase-only mode).

CREATE TABLE IF NOT EXISTS menstrual_events (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_date DATE NULL,
    event_ts TIMESTAMPTZ NULL,
    event_type VARCHAR(64) NOT NULL,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_sensitive BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_menstrual_events_user_id ON menstrual_events(user_id);
CREATE INDEX IF NOT EXISTS ix_menstrual_events_event_date ON menstrual_events(event_date);
CREATE INDEX IF NOT EXISTS ix_menstrual_events_event_type ON menstrual_events(event_type);
CREATE INDEX IF NOT EXISTS ix_menstrual_events_is_sensitive ON menstrual_events(is_sensitive);

CREATE TABLE IF NOT EXISTS menstrual_day_summaries (
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_date DATE NOT NULL,
    bleeding_status VARCHAR(16) NOT NULL DEFAULT 'none',
    flow_level INTEGER NULL,
    cycle_day_index INTEGER NULL,
    phase VARCHAR(32) NOT NULL DEFAULT 'unknown',
    phase_probabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
    pmdd_symptom_index DOUBLE PRECISION NULL,
    top_symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, day_date)
);

CREATE TABLE IF NOT EXISTS menstrual_predictions (
    prediction_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_period_window_start DATE NULL,
    next_period_window_end DATE NULL,
    confidence_score INTEGER NOT NULL DEFAULT 0,
    why_this TEXT NOT NULL DEFAULT '',
    data_quality VARCHAR(16) NOT NULL DEFAULT 'insufficient',
    phase_policy VARCHAR(64) NOT NULL DEFAULT 'phase_only_no_fertility',
    fertility_window_visible BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_menstrual_predictions_user_generated
    ON menstrual_predictions(user_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS menstrual_export_jobs (
    job_id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    formats_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    csv_payload TEXT NULL,
    pdf_payload_b64 TEXT NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_menstrual_export_jobs_user_status
    ON menstrual_export_jobs(user_id, status);

CREATE TABLE IF NOT EXISTS menstrual_privacy_settings (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    on_device_only BOOLEAN NOT NULL DEFAULT FALSE,
    fertility_window_mode VARCHAR(16) NOT NULL DEFAULT 'hidden',
    app_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    app_lock_method VARCHAR(16) NULL,
    backup_mode VARCHAR(32) NOT NULL DEFAULT 'local_encrypted',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
