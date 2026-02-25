from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func

from backend.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (
        UniqueConstraint("endpoint", name="uq_push_subscription_endpoint"),
        UniqueConstraint("device_token", name="uq_push_subscription_device_token"),
        Index("ix_push_subscriptions_user_enabled", "user_id", "enabled"),
    )

    subscription_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # webpush | fcm | apns
    channel = Column(String(16), nullable=False, default="webpush", index=True)
    # web | android | ios
    platform = Column(String(16), nullable=False, default="web")

    endpoint = Column(String(1024), nullable=True)
    p256dh = Column(String(512), nullable=True)
    auth = Column(String(512), nullable=True)

    device_token = Column(String(512), nullable=True)
    device_id = Column(String(128), nullable=True, index=True)
    user_agent = Column(String(512), nullable=True)

    enabled = Column(Boolean, nullable=False, default=True, index=True)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)



