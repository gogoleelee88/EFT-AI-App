from __future__ import annotations

from sqlalchemy import (
    JSON,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)

from backend.database import Base


class ReminderJob(Base):
    __tablename__ = "reminder_jobs"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "plan_date",
            "task_uid",
            "alarm_time_local",
            "repeat_rule",
            "channel",
            name="uq_reminder_job_stable",
        ),
        Index("ix_reminder_jobs_due_active", "state", "next_fire_at_utc"),
        Index("ix_reminder_jobs_day_state", "day_id", "state"),
    )

    job_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.task_id", ondelete="SET NULL"), nullable=True, index=True)
    task_uid = Column(String(128), nullable=False, index=True)

    plan_date = Column(Date, nullable=False, index=True)
    alarm_time_local = Column(String(5), nullable=False)  # HH:mm
    repeat_rule = Column(String(32), nullable=False)  # once|daily|weekdays|weekends|custom|custom_days
    custom_days = Column(JSON, nullable=True)  # [0..6], 0=Sun
    channel = Column(String(24), nullable=False, default="webpush", index=True)
    timezone = Column(String(64), nullable=False, default="Asia/Seoul")

    next_fire_at_utc = Column(DateTime(timezone=True), nullable=True, index=True)
    state = Column(String(16), nullable=False, default="active")  # active|resolved|canceled|paused

    attempts = Column(Integer, nullable=False, default=0)
    lock_owner = Column(String(64), nullable=True, index=True)
    lock_until = Column(DateTime(timezone=True), nullable=True, index=True)
    last_error = Column(String(512), nullable=True)

    metadata_json = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



