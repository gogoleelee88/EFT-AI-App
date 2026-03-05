-- SPEC write idempotency cache table
CREATE TABLE IF NOT EXISTS spec_idempotency_keys (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    scope VARCHAR(64) NOT NULL,
    key VARCHAR(128) NOT NULL,
    response_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_spec_idem_user_scope_key UNIQUE (user_id, scope, key)
);

CREATE INDEX IF NOT EXISTS ix_spec_idempotency_keys_user_id ON spec_idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS ix_spec_idempotency_keys_scope ON spec_idempotency_keys(scope);

