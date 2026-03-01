from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, JSON, String, func

from backend.database import Base


class RecoveryEvent(Base):
    __tablename__ = "recovery_events"
    __table_args__ = (
        Index("ix_recovery_events_user_created", "user_id", "created_at"),
        Index(
            "ix_recovery_events_user_entry_schedule",
            "user_id",
            "entry_point",
            "schedule_id",
            "created_at",
        ),
    )

    event_id = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    focus_session_id = Column(String(64), nullable=True, index=True)
    schedule_id = Column(String(128), nullable=True, index=True)
    schedule_name = Column(String(120), nullable=True)
    session_state = Column(String(24), nullable=False, index=True)
    entry_point = Column(String(32), nullable=False, index=True)
    blocked_min = Column(Integer, nullable=True)
    distraction_type = Column(String(32), nullable=True)
    confidence = Column(Float, nullable=True)
    source = Column(String(32), nullable=True)
    entry_sentence = Column(String(255), nullable=False)
    action = Column(String(16), nullable=False, default="ignore")
    suppressed_reason = Column(String(64), nullable=True)
    recovery_url = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    distraction_app_category = Column(String(32), nullable=True)
    mismatch_score = Column(Float, nullable=True)
    observed_apps = Column(JSON, nullable=True)
    context_version = Column(String(16), nullable=True)
    source_detail = Column(String(32), nullable=True)
    summary_reason = Column(String(32), nullable=True)
    unknown_ratio = Column(Float, nullable=True)
    system_ratio = Column(Float, nullable=True)
    top_categories = Column(JSON, nullable=True)
    switch_count = Column(Integer, nullable=True)
    duration_ratio = Column(Float, nullable=True)
