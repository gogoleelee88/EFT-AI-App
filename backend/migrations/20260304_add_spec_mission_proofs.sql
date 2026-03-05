-- SPEC mission proof storage (time_check/photo)
CREATE TABLE IF NOT EXISTS mission_proofs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    plan_date DATE NOT NULL,
    task_uid VARCHAR(128) NOT NULL,
    mission_type VARCHAR(32) NOT NULL,
    min_seconds INTEGER NOT NULL DEFAULT 10,
    scheduled_fire_at_utc TIMESTAMPTZ NULL,
    verified_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_json JSONB NULL,
    photo_path VARCHAR(512) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mission_proof_user_day_task_type UNIQUE (user_id, plan_date, task_uid, mission_type)
);

CREATE INDEX IF NOT EXISTS ix_mission_proofs_user_id ON mission_proofs(user_id);
CREATE INDEX IF NOT EXISTS ix_mission_proofs_plan_date ON mission_proofs(plan_date);
CREATE INDEX IF NOT EXISTS ix_mission_proofs_task_uid ON mission_proofs(task_uid);
CREATE INDEX IF NOT EXISTS ix_mission_proofs_mission_type ON mission_proofs(mission_type);
