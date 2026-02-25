from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class ClarificationQuestion(Base):
    __tablename__ = "clarification_questions"
    __table_args__ = (
        Index("ix_clarification_questions_user_status", "user_id", "status"),
        Index("ix_clarification_questions_cooldown", "user_id", "cooldown_key", "asked_at"),
        Index("ix_clarification_questions_focus_session_id", "focus_session_id"),
        Index("ix_clarification_questions_schedule_id", "schedule_id"),
    )

    question_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    candidate_id = Column(
        Integer,
        ForeignKey("activity_candidates.candidate_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    focus_session_id = Column(String(64), nullable=True, index=True)
    schedule_id = Column(String(128), nullable=True, index=True)
    schedule_type = Column(String(32), nullable=True, index=True)
    status = Column(String(16), nullable=False, default="asked", index=True)
    question_text = Column(String(255), nullable=False)
    trigger_reasons = Column(JSON, nullable=True)
    cooldown_key = Column(String(128), nullable=False, index=True)
    asked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    answered_at = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)


