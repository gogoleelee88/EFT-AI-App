-- Focus Session + interruption/re-entry/stuck prescription tables
-- Postgres-first DDL

CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_devices_user_id ON devices(user_id);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ NULL,
    task_title VARCHAR(255) NOT NULL,
    goal TEXT NOT NULL,
    timer_mode VARCHAR(16) NOT NULL,
    duration INTEGER NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'working',
    next_step TEXT NULL,
    sensors_enabled JSONB NULL,
    planned_break BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS session_states (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    state VARCHAR(32) NOT NULL,
    exit_score DOUBLE PRECISION NOT NULL,
    evidence JSONB NULL
);
CREATE INDEX IF NOT EXISTS ix_session_states_session_ts_desc ON session_states(session_id, ts DESC);

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    device_id VARCHAR(64) NULL REFERENCES devices(id) ON DELETE SET NULL,
    ts TIMESTAMPTZ NOT NULL,
    source VARCHAR(16) NOT NULL,
    type VARCHAR(32) NOT NULL,
    payload JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_events_session_ts_desc ON events(session_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS ix_events_device_id ON events(device_id);

CREATE TABLE IF NOT EXISTS interruptions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts_start TIMESTAMPTZ NOT NULL,
    ts_end TIMESTAMPTZ NULL,
    interruption_type VARCHAR(16) NOT NULL,
    detected BOOLEAN NOT NULL DEFAULT FALSE,
    user_labeled BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_interruptions_session_start_desc ON interruptions(session_id, ts_start DESC);

CREATE TABLE IF NOT EXISTS stuck_cases (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stuck_text TEXT NOT NULL,
    desired_output TEXT NOT NULL,
    constraints TEXT NULL,
    detected_category VARCHAR(64) NOT NULL,
    model_profile VARCHAR(32) NOT NULL,
    prompt_text TEXT NOT NULL,
    ai_result JSONB NULL,
    next_actions JSONB NULL
);
CREATE INDEX IF NOT EXISTS ix_stuck_cases_session_created_desc ON stuck_cases(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    idle_threshold_seconds INTEGER NOT NULL DEFAULT 180,
    camera_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    camera_weight DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    window_size_seconds INTEGER NOT NULL DEFAULT 600,
    notification_prefs JSONB NULL,
    data_retention_days INTEGER NOT NULL DEFAULT 60,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
