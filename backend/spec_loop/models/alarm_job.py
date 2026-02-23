from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from backend.database import Base


class AlarmJob(Base):
    __tablename__ = "alarm_jobs"

    alarm_job_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(String(64), nullable=True, index=True)
    channel = Column(String(24), nullable=False, default="push")
    send_at = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="pending", index=True)
    dedupe_key = Column(String(128), nullable=False, unique=True)
    attempts = Column(Integer, nullable=False, default=0)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


