-- Context RAG + profile cache + mirror transcript storage
-- Applied date: 2026-02-16

CREATE TABLE IF NOT EXISTS context_chunk (
  id VARCHAR(36) PRIMARY KEY,
  room_id VARCHAR(36) NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  contact_id VARCHAR(36) NULL REFERENCES contact(id) ON DELETE CASCADE,
  source VARCHAR(24) NOT NULL,
  chunk_hash VARCHAR(64) NOT NULL,
  chunk_text TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_context_chunk_contact_source_created_at
  ON context_chunk(contact_id, source, created_at);
CREATE INDEX IF NOT EXISTS ix_context_chunk_room_created_at
  ON context_chunk(room_id, created_at);
CREATE INDEX IF NOT EXISTS ix_context_chunk_hash
  ON context_chunk(chunk_hash);

CREATE TABLE IF NOT EXISTS profile_cache (
  id VARCHAR(36) PRIMARY KEY,
  contact_id VARCHAR(36) NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  cache_key VARCHAR(120) NOT NULL UNIQUE,
  profile_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_profile_cache_contact ON profile_cache(contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_profile_cache_cache_key ON profile_cache(cache_key);

CREATE TABLE IF NOT EXISTS mirror_session (
  id VARCHAR(36) PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  contact_id VARCHAR(36) NULL REFERENCES contact(id) ON DELETE SET NULL,
  owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  difficulty VARCHAR(16) NOT NULL DEFAULT 'normal',
  call_goal TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mirror_session_room_created_at
  ON mirror_session(room_id, created_at);

CREATE TABLE IF NOT EXISTS mirror_turn (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES mirror_session(id) ON DELETE CASCADE,
  speaker VARCHAR(12) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mirror_turn_session_created_at
  ON mirror_turn(session_id, created_at);

CREATE TABLE IF NOT EXISTS mirror_report (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES mirror_session(id) ON DELETE CASCADE,
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_mirror_report_session_created_at
  ON mirror_report(session_id, created_at);
