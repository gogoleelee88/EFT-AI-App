from __future__ import annotations

import uuid

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.sql import func

from backend.database import Base


class ContextChunk(Base):
    __tablename__ = "context_chunk"
    __table_args__ = (
        Index("ix_context_chunk_contact_source_created_at", "contact_id", "source", "created_at"),
        Index("ix_context_chunk_room_created_at", "room_id", "created_at"),
        Index("ix_context_chunk_hash", "chunk_hash"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("chat_room.id"), nullable=True, index=True)
    contact_id = Column(String(36), ForeignKey("contact.id"), nullable=True, index=True)
    source = Column(String(24), nullable=False)  # email | chat | attachment
    chunk_hash = Column(String(64), nullable=False)
    chunk_text = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProfileCache(Base):
    __tablename__ = "profile_cache"
    __table_args__ = (
        Index("ix_profile_cache_contact", "contact_id"),
        Index("ix_profile_cache_cache_key", "cache_key", unique=True),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    contact_id = Column(String(36), ForeignKey("contact.id"), nullable=False)
    cache_key = Column(String(120), nullable=False)
    profile_payload = Column(JSON, nullable=False, default=dict)
    evidence_payload = Column(JSON, nullable=False, default=list)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MirrorSession(Base):
    __tablename__ = "mirror_session"
    __table_args__ = (
        Index("ix_mirror_session_room_created_at", "room_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("chat_room.id"), nullable=False)
    contact_id = Column(String(36), ForeignKey("contact.id"), nullable=True, index=True)
    owner_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    difficulty = Column(String(16), nullable=False, default="normal")
    call_goal = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MirrorTurn(Base):
    __tablename__ = "mirror_turn"
    __table_args__ = (
        Index("ix_mirror_turn_session_created_at", "session_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("mirror_session.id"), nullable=False, index=True)
    speaker = Column(String(12), nullable=False)  # me | them
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MirrorReport(Base):
    __tablename__ = "mirror_report"
    __table_args__ = (
        Index("ix_mirror_report_session_created_at", "session_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey("mirror_session.id"), nullable=False, index=True)
    report_payload = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


