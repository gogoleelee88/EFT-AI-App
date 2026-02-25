# Daily condition summary with top drivers used by UI banners and patch suggestion.
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy import JSON

from backend.database import Base


class DailyConditionSummary(Base):
    __tablename__ = "daily_condition_summaries"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_daily_condition_summaries_user_date"),)

    summary_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="SET NULL"), nullable=True, index=True)
    condition_id = Column(Integer, ForeignKey("conditions.condition_id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False, index=True)
    drivers = Column(JSON, nullable=True)
    confidence = Column(String(16), nullable=True)
    evidence_snapshot = Column(JSON, nullable=True)
    menstrual_score = Column(Integer, nullable=True)
    data_quality = Column(String(16), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


