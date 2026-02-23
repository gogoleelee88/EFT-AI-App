from sqlalchemy import Column, DateTime, String
from sqlalchemy.sql import func

from backend.database import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String(64), primary_key=True)  # token_id (uuid4 hex)
    user_id = Column(String(36), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False)  # sha256 hex
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)



