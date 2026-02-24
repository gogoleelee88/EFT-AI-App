-- Contacts + room contact binding for chat/gmail/copilot

CREATE TABLE IF NOT EXISTS contact (
  id VARCHAR(36) PRIMARY KEY,
  owner_user_id VARCHAR(36) NOT NULL REFERENCES users(id),
  contact_user_id VARCHAR(36) NULL REFERENCES users(id),
  alias VARCHAR(128) NULL,
  email VARCHAR(255) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_contact_owner_email UNIQUE (owner_user_id, email)
);

CREATE INDEX IF NOT EXISTS ix_contact_owner ON contact(owner_user_id);
CREATE INDEX IF NOT EXISTS ix_contact_contact_user_id ON contact(contact_user_id);

ALTER TABLE chat_room
  ADD COLUMN IF NOT EXISTS contact_id VARCHAR(36) NULL REFERENCES contact(id);

CREATE INDEX IF NOT EXISTS ix_chat_room_contact_id ON chat_room(contact_id);
