from __future__ import annotations

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy import JSON

from backend.database import Base


class ReminderDelivery(Base):
    __tablename__ = "reminder_deliveries"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_reminder_delivery_dedupe"),
        Index("ix_reminder_deliveries_job_created", "job_id", "created_at"),
    )

    delivery_id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("reminder_jobs.job_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    channel = Column(String(24), nullable=False)  # webpush | fcm | apns | email | sms
    status = Column(String(24), nullable=False, default="sending")  # sending | sent | failed | suppressed
    dedupe_key = Column(String(255), nullable=False)
    attempts = Column(Integer, nullable=False, default=1)

    provider_message_id = Column(String(255), nullable=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(String(512), nullable=True)
    payload = Column(JSON, nullable=True)

    scheduled_fire_at_utc = Column(DateTime(timezone=True), nullable=True, index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



