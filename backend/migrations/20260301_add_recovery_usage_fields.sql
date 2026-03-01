-- Add optional enrichment fields for recovery_events
ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS distraction_app_category VARCHAR(32);

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS mismatch_score DOUBLE PRECISION;

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS observed_apps JSON;

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS context_version VARCHAR(16);

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS source_detail VARCHAR(32);

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS summary_reason VARCHAR(32);

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS unknown_ratio DOUBLE PRECISION;

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS system_ratio DOUBLE PRECISION;

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS top_categories JSON;

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS switch_count INTEGER;

ALTER TABLE recovery_events
    ADD COLUMN IF NOT EXISTS duration_ratio DOUBLE PRECISION;
