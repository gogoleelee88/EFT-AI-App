from __future__ import annotations

import uuid

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String
from sqlalchemy.sql import func

from backend.database import Base


class CoachSnapshot(Base):
    __tablename__ = "coach_snapshot"
    __table_args__ = (
        Index("ix_coach_snapshot_room_created_at", "room_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("chat_room.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    message_id = Column(String(36), ForeignKey("chat_message.id"), nullable=True, index=True)
    request_payload = Column(JSON, nullable=False)
    result_payload = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)



