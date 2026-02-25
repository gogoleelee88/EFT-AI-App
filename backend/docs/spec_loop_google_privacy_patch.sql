-- Google event mapping privacy metadata extension.
-- Run once on the target database.

ALTER TABLE google_event_mappings ADD COLUMN privacy_mode TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE google_event_mappings ADD COLUMN privacy_key TEXT NULL;
ALTER TABLE google_event_mappings ADD COLUMN display_title TEXT NULL;
ALTER TABLE google_event_mappings ADD COLUMN display_description TEXT NULL;

CREATE INDEX IF NOT EXISTS ix_google_event_mappings_user_event
  ON google_event_mappings(user_id, google_event_id);

