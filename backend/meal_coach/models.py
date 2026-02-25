from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)

from backend.database import Base


class TenantMembership(Base):
    __tablename__ = "tenant_memberships"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_tenant_memberships_tenant_user"),)

    membership_id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), nullable=False, default="Owner")  # Owner | Admin | Member
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MealLog(Base):
    __tablename__ = "meal_logs"

    meal_id = Column(String(36), primary_key=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_state = Column(String(16), nullable=False)  # FASTING | ATE
    meal_time = Column(DateTime(timezone=True), nullable=False, index=True)
    fasting_hours = Column(Float, nullable=True)
    source = Column(String(32), nullable=False, default="manual")
    track_selected = Column(String(8), nullable=True)  # A | B | AUTO
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MealPhoto(Base):
    __tablename__ = "meal_photos"

    photo_id = Column(String(36), primary_key=True)
    meal_id = Column(String(36), ForeignKey("meal_logs.meal_id", ondelete="CASCADE"), nullable=False, index=True)
    storage_uri = Column(Text, nullable=False)
    thumbnail_uri = Column(Text, nullable=True)
    embedding_ref = Column(Text, nullable=True)
    raw_store = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class NutritionEstimate(Base):
    __tablename__ = "nutrition_estimates"

    estimate_id = Column(String(36), primary_key=True)
    meal_id = Column(String(36), ForeignKey("meal_logs.meal_id", ondelete="CASCADE"), nullable=False, index=True)
    track = Column(String(8), nullable=False)  # A | B
    calories = Column(Integer, nullable=False)
    carbs_g = Column(Float, nullable=False)
    protein_g = Column(Float, nullable=False)
    fat_g = Column(Float, nullable=False)
    sodium_mg = Column(Float, nullable=False)
    labels = Column(JSON, nullable=True)
    confidence = Column(Float, nullable=False)
    uncertainty_reason = Column(JSON, nullable=True)
    source_refs = Column(JSON, nullable=True)
    engine_version = Column(String(64), nullable=False)
    model_version = Column(String(64), nullable=False)
    prompt_version = Column(String(64), nullable=False)
    dataset_version = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class PostMealCheck(Base):
    __tablename__ = "post_meal_checks"
    __table_args__ = (UniqueConstraint("meal_id", "slot", name="uq_post_meal_checks_meal_slot"),)

    check_id = Column(String(36), primary_key=True)
    meal_id = Column(String(36), ForeignKey("meal_logs.meal_id", ondelete="CASCADE"), nullable=False, index=True)
    slot = Column(String(8), nullable=False)  # T30 | T90
    sleepiness = Column(Integer, nullable=False)
    focus_drop = Column(Integer, nullable=False)
    sluggishness = Column(Integer, nullable=False)
    gi_discomfort = Column(Integer, nullable=True)
    headache = Column(Integer, nullable=True)
    caffeine_used = Column(Boolean, nullable=False, default=False)
    check_completion_time_ms = Column(Integer, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MealPostEffect(Base):
    __tablename__ = "meal_post_effects"

    effect_id = Column(String(36), primary_key=True)
    meal_id = Column(String(36), ForeignKey("meal_logs.meal_id", ondelete="CASCADE"), nullable=False, unique=True)
    dip_score = Column(Integer, nullable=False)
    dip_score_t30 = Column(Integer, nullable=True)
    dip_score_t90 = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=False)
    confidence_bucket = Column(String(16), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MealAdvice(Base):
    __tablename__ = "meal_advice"

    advice_id = Column(String(36), primary_key=True)
    meal_id = Column(String(36), ForeignKey("meal_logs.meal_id", ondelete="CASCADE"), nullable=False, index=True)
    dip_score = Column(Integer, nullable=False)
    decision_mode = Column(String(32), nullable=False)
    task_mode = Column(String(32), nullable=False)
    next_action = Column(JSON, nullable=False)
    why_tokens = Column(JSON, nullable=False)
    confidence = Column(Float, nullable=False)
    engine_version = Column(String(64), nullable=False)
    model_version = Column(String(64), nullable=False)
    prompt_version = Column(String(64), nullable=False)
    dataset_version = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class ConsentLog(Base):
    __tablename__ = "consent_logs"

    consent_id = Column(String(36), primary_key=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    consent_type = Column(String(64), nullable=False)
    version = Column(String(32), nullable=False)
    granted = Column(Boolean, nullable=False)
    metadata_json = Column(JSON, nullable=True)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    withdrawn_at = Column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    audit_id = Column(String(36), primary_key=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    actor_id = Column(String(36), nullable=False, index=True)
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(64), nullable=True)
    ip_hash = Column(String(64), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class DeviceToken(Base):
    __tablename__ = "device_tokens"
    __table_args__ = (UniqueConstraint("user_id", "push_token", name="uq_device_tokens_user_token"),)

    token_id = Column(String(36), primary_key=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(16), nullable=False)  # ios | android | web
    push_token = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class EventLog(Base):
    __tablename__ = "event_logs"

    event_id = Column(String(36), primary_key=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    user_pseudo_id = Column(String(64), nullable=False, index=True)
    meal_id = Column(String(36), nullable=True, index=True)
    event_name = Column(String(64), nullable=False, index=True)
    event_version = Column(String(16), nullable=False, default="v1")
    payload = Column(JSON, nullable=False)
    event_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("tenant_id", "method", "path", "idempotency_key", name="uq_idempotency_scope_key"),
    )

    idem_id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    method = Column(String(8), nullable=False)
    path = Column(String(255), nullable=False)
    idempotency_key = Column(String(128), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_body = Column(JSON, nullable=False)
    status_code = Column(Integer, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MealSchedulerJob(Base):
    __tablename__ = "meal_scheduler_jobs"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_meal_scheduler_jobs_dedupe_key"),)

    job_id = Column(String(36), primary_key=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_id = Column(String(36), ForeignKey("meal_logs.meal_id", ondelete="CASCADE"), nullable=False, index=True)
    job_type = Column(String(32), nullable=False)  # POST_CHECK_T30 | POST_CHECK_T90
    due_at = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="queued")  # queued | sent | failed | skipped
    attempts = Column(Integer, nullable=False, default=0)
    dedupe_key = Column(String(128), nullable=False)
    last_error = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)



