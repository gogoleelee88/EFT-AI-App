from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


Relationship = Literal["boss", "peer", "client", "friend", "family", "stranger", "romance_interest"]
Goal = Literal["request", "refuse", "negotiate", "maintain", "deescalate"]
ImageGoal = Literal["professional", "kind", "firm_polite", "leaderlike", "humble", "relaxed"]
BannedTone = Literal["blame", "over_apology", "excuses", "emotional_outburst"]
SendPolicy = Literal["prefer_fast", "prefer_calm", "prefer_boundary"]
MemberRole = Literal["owner", "member"]


class RoomDefaults(BaseModel):
    relationship: Relationship = "peer"
    goal: Goal = "maintain"
    image_goal: list[ImageGoal] = Field(default_factory=lambda: ["professional", "kind"])
    banned_tones: list[BannedTone] = Field(default_factory=lambda: ["blame", "emotional_outburst"])
    default_send_policy: SendPolicy = "prefer_calm"
    language: str = "ko"


class ChatRoomCreateRequest(BaseModel):
    name: Optional[str] = None
    contact_id: Optional[str] = None
    defaults: Optional[RoomDefaults] = None


class ChatRoomContactRequest(BaseModel):
    contact_id: Optional[str] = None
    target_user: Optional[str] = Field(default=None, min_length=3, max_length=255)
    source: str = Field(default="auto_openchat", max_length=32)


class ChatRoomJoinRequest(BaseModel):
    invite_token: str = Field(..., min_length=1)


class ChatRoomSettingsUpdateRequest(BaseModel):
    relationship: Optional[Relationship] = None
    goal: Optional[Goal] = None
    image_goal: Optional[list[ImageGoal]] = None
    banned_tones: Optional[list[BannedTone]] = None
    default_send_policy: Optional[SendPolicy] = None


class ChatSender(BaseModel):
    user_id: str
    name: Optional[str] = None


class ChatMessageOut(BaseModel):
    id: str
    room_id: str
    sender: ChatSender
    text: str
    created_at: datetime


class ChatAttachmentOut(BaseModel):
    id: str
    room_id: str
    uploaded_by_user_id: str
    filename: str
    mime_type: str
    size_bytes: int
    extracted_preview: Optional[str] = None
    extracted_text: Optional[str] = None
    created_at: datetime


class ChatMemberOut(BaseModel):
    user_id: str
    role: MemberRole
    name: Optional[str] = None
    email: Optional[str] = None
    joined_at: datetime


class ChatRoomOut(BaseModel):
    id: str
    name: Optional[str] = None
    owner_user_id: str
    contact_id: Optional[str] = None
    contact_alias: Optional[str] = None
    contact_email: Optional[str] = None
    default_relationship: Relationship
    default_goal: Goal
    default_image_goal: list[ImageGoal]
    default_banned_tones: list[BannedTone]
    default_send_policy: SendPolicy
    created_at: datetime
    updated_at: datetime


class ChatRoomCreateResponse(BaseModel):
    room: ChatRoomOut
    invite_token: str
    invite_link: str


class ChatRoomJoinResponse(BaseModel):
    room_id: str
    joined: bool


class ChatRoomDetailResponse(BaseModel):
    room: ChatRoomOut
    members: list[ChatMemberOut]
    recent_messages: list[ChatMessageOut]


class ChatRoomListItem(BaseModel):
    room: ChatRoomOut
    role: MemberRole
    member_count: int


class ChatRoomListResponse(BaseModel):
    rooms: list[ChatRoomListItem]


class InviteReissueResponse(BaseModel):
    room_id: str
    invite_token: str
    invite_link: str


class ContactCreateRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    alias: Optional[str] = Field(default=None, max_length=128)
    source: str = Field(default="manual", max_length=32)


class ContactOut(BaseModel):
    id: str
    owner_user_id: str
    contact_user_id: Optional[str] = None
    alias: Optional[str] = None
    email: str
    source: str
    created_at: datetime
    updated_at: datetime


class ContactListResponse(BaseModel):
    contacts: list[ContactOut]


class ChatAttachmentListResponse(BaseModel):
    attachments: list[ChatAttachmentOut]
