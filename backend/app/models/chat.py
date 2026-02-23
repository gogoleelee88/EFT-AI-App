from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from backend.database import Base


class Contact(Base):
    __tablename__ = "contact"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "email", name="uq_contact_owner_email"),
        Index("ix_contact_owner", "owner_user_id"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    contact_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    alias = Column(String(128), nullable=True)
    email = Column(String(255), nullable=False)
    source = Column(String(32), nullable=False, default="manual")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ChatRoom(Base):
    __tablename__ = "chat_room"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=True)
    owner_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    contact_id = Column(String(36), ForeignKey("contact.id"), nullable=True, index=True)

    default_relationship = Column(String(32), nullable=False, default="peer")
    default_goal = Column(String(32), nullable=False, default="maintain")
    default_image_goal = Column(JSON, nullable=False, default=list)
    default_banned_tones = Column(JSON, nullable=False, default=list)
    default_send_policy = Column(String(32), nullable=False, default="prefer_calm")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ChatMember(Base):
    __tablename__ = "chat_member"
    __table_args__ = (
        UniqueConstraint("room_id", "user_id", name="uq_chat_member_room_user"),
        Index("ix_chat_member_room_user", "room_id", "user_id"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("chat_room.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    role = Column(String(16), nullable=False, default="member")  # owner | member
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_message"
    __table_args__ = (
        Index("ix_chat_message_room_created_at", "room_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("chat_room.id"), nullable=False, index=True)
    sender_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ChatAttachment(Base):
    __tablename__ = "chat_attachment"
    __table_args__ = (
        Index("ix_chat_attachment_room_created_at", "room_id", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("chat_room.id"), nullable=False, index=True)
    uploaded_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(120), nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    storage_path = Column(Text, nullable=False)
    extracted_text = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class InviteToken(Base):
    __tablename__ = "invite_token"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(String(36), ForeignKey("chat_room.id"), nullable=False, index=True)
    token = Column(String(128), nullable=False, unique=True, index=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


