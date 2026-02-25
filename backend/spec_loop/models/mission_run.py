from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from backend.database import Base


class MissionRun(Base):
    __tablename__ = "mission_runs"

    mission_run_id = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(String(64), nullable=True, index=True)
    state = Column(String(16), nullable=False, default="started", index=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


