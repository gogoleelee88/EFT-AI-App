-- Chat + Social Copilot schema (PostgreSQL)
-- Applied date: 2026-02-13

CREATE TABLE IF NOT EXISTS chat_room (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NULL,
  owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  default_relationship VARCHAR(32) NOT NULL DEFAULT 'peer',
  default_goal VARCHAR(32) NOT NULL DEFAULT 'maintain',
  default_image_goal JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_banned_tones JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_send_policy VARCHAR(32) NOT NULL DEFAULT 'prefer_calm',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_member (
  id VARCHAR(36) PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chat_member_room_user UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_chat_member_room_user ON chat_member(room_id, user_id);

CREATE TABLE IF NOT EXISTS invite_token (
  id VARCHAR(36) PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  token VARCHAR(128) NOT NULL UNIQUE,
  created_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_invite_token_token ON invite_token(token);

CREATE TABLE IF NOT EXISTS chat_message (
  id VARCHAR(36) PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  sender_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_chat_message_room_created_at ON chat_message(room_id, created_at);

CREATE TABLE IF NOT EXISTS coach_snapshot (
  id VARCHAR(36) PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  message_id VARCHAR(36) NULL REFERENCES chat_message(id) ON DELETE SET NULL,
  request_payload JSONB NOT NULL,
  result_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_coach_snapshot_room_created_at ON coach_snapshot(room_id, created_at);

