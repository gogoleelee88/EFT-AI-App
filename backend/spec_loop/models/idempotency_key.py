from __future__ import annotations

from sqlalchemy import Column, DateTime, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from backend.database import Base


class IdempotencyKey(Base):
    __tablename__ = "spec_idempotency_keys"
    __table_args__ = (UniqueConstraint("user_id", "scope", "key", name="uq_spec_idem_user_scope_key"),)

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    scope = Column(String(64), nullable=False, index=True)
    key = Column(String(128), nullable=False)
    response_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

