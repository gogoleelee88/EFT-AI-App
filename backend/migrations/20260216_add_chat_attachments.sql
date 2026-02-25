-- Chat attachment context for copilot
-- Applied date: 2026-02-16

CREATE TABLE IF NOT EXISTS chat_attachment (
  id VARCHAR(36) PRIMARY KEY,
  room_id VARCHAR(36) NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  uploaded_by_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  extracted_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_chat_attachment_room_created_at ON chat_attachment(room_id, created_at);
