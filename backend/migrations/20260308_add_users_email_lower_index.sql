-- Add functional index for case-insensitive email lookups in auth upsert flow.
CREATE INDEX IF NOT EXISTS idx_users_email_lower
ON users ((lower(email)));
