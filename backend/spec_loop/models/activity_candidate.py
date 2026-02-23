from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy import JSON
from sqlalchemy import ForeignKey, Index

from backend.database import Base


class ActivityCandidate(Base):
    __tablename__ = "activity_candidates"
    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_activity_candidates_user_dedupe"),
        Index("ix_activity_candidates_user_ts", "user_id", "ts_start"),
    )

    candidate_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="SET NULL"), nullable=True, index=True)
    focus_session_id = Column(String(64), ForeignKey("focus_behavior_sessions.focus_session_id", ondelete="SET NULL"), nullable=True, index=True)
    schedule_id = Column(String(128), nullable=True, index=True)
    schedule_type = Column(String(32), nullable=True)
    ts_start = Column(DateTime(timezone=True), nullable=False, index=True)
    ts_end = Column(DateTime(timezone=True), nullable=False, index=True)
    top1 = Column(String(64), nullable=False)
    activity_topk = Column(JSON, nullable=True)
    confidence = Column(Float, nullable=True)
    margin_top1_top2 = Column(Float, nullable=True)
    screen_state = Column(String(32), nullable=True)
    orientation = Column(String(32), nullable=True)
    pickup_flag = Column(Boolean, nullable=True)
    mismatch_score = Column(Float, nullable=True)
    trigger_reasons = Column(JSON, nullable=True)
    dedupe_key = Column(String(128), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


