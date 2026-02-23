from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, func

from backend.database import Base


class FocusBehaviorSession(Base):
    __tablename__ = "focus_behavior_sessions"

    focus_session_id = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    schedule_id = Column(String(128), nullable=True, index=True)
    mission_run_id = Column(String(64), nullable=True, index=True)
    schedule_type = Column(String(32), nullable=False, default="focus", index=True)
    expected_motion = Column(String(32), nullable=True, index=True)
    state = Column(String(16), nullable=False, default="tracking")
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    soft_nudge_done = Column(Boolean, nullable=False, default=False)
    soft_nudge_count = Column(Integer, nullable=False, default=0)
    next_allowed_nudge_at = Column(DateTime(timezone=True), nullable=True)
    movement_started_at = Column(DateTime(timezone=True), nullable=True)
    movement_last_seen_at = Column(DateTime(timezone=True), nullable=True)
    rest_started_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_focus_sessions_user_state", "user_id", "state"),
    )


