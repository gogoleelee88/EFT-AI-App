from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, func

from backend.database import Base


class TimelineSegment(Base):
    __tablename__ = "timeline_segments"
    __table_args__ = (
        Index("ix_timeline_segments_user_time", "user_id", "ts_start"),
        Index("ix_timeline_segments_user_label", "user_id", "final_label"),
    )

    segment_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="SET NULL"), nullable=True, index=True)
    candidate_id = Column(
        Integer,
        ForeignKey("activity_candidates.candidate_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    ts_start = Column(DateTime(timezone=True), nullable=False, index=True)
    ts_end = Column(DateTime(timezone=True), nullable=False, index=True)
    inferred_label = Column(String(32), nullable=True)
    final_label = Column(String(32), nullable=True)
    label_source = Column(String(32), nullable=False, default="inferred")
    mismatch_score_avg = Column(Float, nullable=True)
    resume_hint_emitted = Column(Boolean, nullable=False, default=False)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



