-- Behavior clarification/timeline tables (P0).
-- Raw sensor stream storage is intentionally excluded.

CREATE TABLE IF NOT EXISTS activity_candidates (
    candidate_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    day_id INTEGER NULL REFERENCES day_plans(day_id) ON DELETE SET NULL,
    ts_start TIMESTAMPTZ NOT NULL,
    ts_end TIMESTAMPTZ NOT NULL,
    top1 VARCHAR(64) NOT NULL,
    activity_topk JSONB NULL,
    confidence DOUBLE PRECISION NULL,
    margin_top1_top2 DOUBLE PRECISION NULL,
    screen_state VARCHAR(32) NULL,
    orientation VARCHAR(32) NULL,
    pickup_flag BOOLEAN NULL,
    mismatch_score DOUBLE PRECISION NULL,
    trigger_reasons JSONB NULL,
    dedupe_key VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_activity_candidates_user_dedupe UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS ix_activity_candidates_user_ts ON activity_candidates(user_id, ts_start);
CREATE INDEX IF NOT EXISTS ix_activity_candidates_user_id ON activity_candidates(user_id);
CREATE INDEX IF NOT EXISTS ix_activity_candidates_day_id ON activity_candidates(day_id);
CREATE INDEX IF NOT EXISTS ix_activity_candidates_ts_start ON activity_candidates(ts_start);
CREATE INDEX IF NOT EXISTS ix_activity_candidates_ts_end ON activity_candidates(ts_end);

CREATE TABLE IF NOT EXISTS clarification_questions (
    question_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    candidate_id BIGINT NOT NULL REFERENCES activity_candidates(candidate_id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'asked',
    question_text VARCHAR(255) NOT NULL,
    trigger_reasons JSONB NULL,
    cooldown_key VARCHAR(128) NOT NULL,
    asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ NULL,
    dismissed_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_clarification_questions_user_status ON clarification_questions(user_id, status);
CREATE INDEX IF NOT EXISTS ix_clarification_questions_cooldown ON clarification_questions(user_id, cooldown_key, asked_at);
CREATE INDEX IF NOT EXISTS ix_clarification_questions_candidate_id ON clarification_questions(candidate_id);
CREATE INDEX IF NOT EXISTS ix_clarification_questions_status ON clarification_questions(status);

CREATE TABLE IF NOT EXISTS timeline_segments (
    segment_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    day_id INTEGER NULL REFERENCES day_plans(day_id) ON DELETE SET NULL,
    candidate_id BIGINT NULL REFERENCES activity_candidates(candidate_id) ON DELETE SET NULL,
    ts_start TIMESTAMPTZ NOT NULL,
    ts_end TIMESTAMPTZ NOT NULL,
    inferred_label VARCHAR(32) NULL,
    final_label VARCHAR(32) NULL,
    label_source VARCHAR(32) NOT NULL DEFAULT 'inferred',
    mismatch_score_avg DOUBLE PRECISION NULL,
    resume_hint_emitted BOOLEAN NOT NULL DEFAULT FALSE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_timeline_segments_user_time ON timeline_segments(user_id, ts_start);
CREATE INDEX IF NOT EXISTS ix_timeline_segments_user_label ON timeline_segments(user_id, final_label);
CREATE INDEX IF NOT EXISTS ix_timeline_segments_day_id ON timeline_segments(day_id);
CREATE INDEX IF NOT EXISTS ix_timeline_segments_candidate_id ON timeline_segments(candidate_id);

CREATE TABLE IF NOT EXISTS user_labels (
    label_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    question_id BIGINT NULL REFERENCES clarification_questions(question_id) ON DELETE SET NULL,
    candidate_id BIGINT NULL REFERENCES activity_candidates(candidate_id) ON DELETE SET NULL,
    timeline_segment_id BIGINT NULL REFERENCES timeline_segments(segment_id) ON DELETE SET NULL,
    user_label VARCHAR(32) NOT NULL,
    corrected_from VARCHAR(32) NULL,
    note VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_user_labels_user_id ON user_labels(user_id);
CREATE INDEX IF NOT EXISTS ix_user_labels_question_id ON user_labels(question_id);
CREATE INDEX IF NOT EXISTS ix_user_labels_candidate_id ON user_labels(candidate_id);
CREATE INDEX IF NOT EXISTS ix_user_labels_timeline_segment_id ON user_labels(timeline_segment_id);
CREATE INDEX IF NOT EXISTS ix_user_labels_user_label ON user_labels(user_label);

