from __future__ import annotations

from uuid import uuid4

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, func

from backend.database import Base


class MenstrualEvent(Base):
    __tablename__ = "menstrual_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_date = Column(Date, nullable=True, index=True)
    event_ts = Column(DateTime(timezone=True), nullable=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    value_json = Column(JSON, nullable=False, default=dict)
    is_sensitive = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MenstrualDaySummary(Base):
    __tablename__ = "menstrual_day_summaries"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    day_date = Column(Date, primary_key=True)
    bleeding_status = Column(String(16), nullable=False, default="none")
    flow_level = Column(Integer, nullable=True)
    cycle_day_index = Column(Integer, nullable=True)
    phase = Column(String(32), nullable=False, default="unknown")
    phase_probabilities = Column(JSON, nullable=False, default=dict)
    pmdd_symptom_index = Column(Float, nullable=True)
    top_symptoms = Column(JSON, nullable=False, default=list)
    computed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MenstrualPrediction(Base):
    __tablename__ = "menstrual_predictions"

    prediction_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    next_period_window_start = Column(Date, nullable=True)
    next_period_window_end = Column(Date, nullable=True)
    confidence_score = Column(Integer, nullable=False, default=0)
    why_this = Column(Text, nullable=False, default="")
    data_quality = Column(String(16), nullable=False, default="insufficient")
    phase_policy = Column(String(64), nullable=False, default="phase_only_no_fertility")
    fertility_window_visible = Column(Boolean, nullable=False, default=False)


class MenstrualExportJob(Base):
    __tablename__ = "menstrual_export_jobs"

    job_id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="pending", index=True)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    formats_json = Column(JSON, nullable=False, default=list)
    csv_payload = Column(Text, nullable=True)
    pdf_payload_b64 = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class MenstrualPrivacySettings(Base):
    __tablename__ = "menstrual_privacy_settings"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    on_device_only = Column(Boolean, nullable=False, default=False)
    fertility_window_mode = Column(String(16), nullable=False, default="hidden")
    app_lock_enabled = Column(Boolean, nullable=False, default=False)
    app_lock_method = Column(String(16), nullable=True)
    backup_mode = Column(String(32), nullable=False, default="local_encrypted")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


