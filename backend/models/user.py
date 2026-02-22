from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)  # UUID string
    firebase_uid = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    photo_url = Column(Text, nullable=True)

    level = Column(Integer, default=1)
    xp = Column(Integer, default=0)
    gems = Column(Integer, default=50)

    # Notion linkage data (tokens are expected to be encrypted at service layer)
    notion_access_token = Column(Text, nullable=True)
    notion_refresh_token = Column(Text, nullable=True)
    notion_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    notion_workspace_id = Column(String(255), nullable=True)
    notion_database_id = Column(String(255), nullable=True)
    notion_connected_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

