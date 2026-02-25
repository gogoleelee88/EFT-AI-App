from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from backend.database import Base


class UserLabel(Base):
    __tablename__ = "user_labels"

    label_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    question_id = Column(
        Integer,
        ForeignKey("clarification_questions.question_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    candidate_id = Column(
        Integer,
        ForeignKey("activity_candidates.candidate_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    timeline_segment_id = Column(
        Integer,
        ForeignKey("timeline_segments.segment_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_label = Column(String(32), nullable=False, index=True)
    corrected_from = Column(String(32), nullable=True)
    note = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)



