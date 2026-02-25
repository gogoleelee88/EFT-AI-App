from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from backend.app.schemas.chat import (
    ChatRoomCreateRequest,
    ChatRoomCreateResponse,
    ChatRoomDetailResponse,
    ChatRoomJoinRequest,
    ChatRoomJoinResponse,
    ChatRoomListResponse,
    ChatRoomOut,
    ChatAttachmentListResponse,
    ChatAttachmentOut,
    ContactCreateRequest,
    ContactListResponse,
    ContactOut,
    ChatRoomContactRequest,
    ChatRoomSettingsUpdateRequest,
    InviteReissueResponse,
)
from backend.app.services.auth_helpers import get_current_user
from backend.app.services.chat_service import (
    build_invite_link,
    create_contact_for_owner,
    create_invite_token,
    create_room,
    create_room_attachment,
    get_contact_for_owner,
    get_room_attachment,
    get_room_for_user,
    join_room_by_invite_token,
    list_contacts_for_owner,
    list_room_attachments,
    list_recent_messages,
    list_room_members,
    list_rooms_for_user,
    require_room_member,
    room_to_dict,
    map_room_contact,
    update_room_defaults,
)
from backend.database import get_db
from backend.models.user import User


router = APIRouter(tags=["chat-rooms"])


@router.get("/api/chat/rooms", response_model=ChatRoomListResponse)
def get_chat_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ChatRoomListResponse(rooms=list_rooms_for_user(db=db, user_id=current_user.id))


@router.post("/api/chat/rooms", response_model=ChatRoomCreateResponse)
def post_chat_room(
    body: ChatRoomCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room, invite = create_room(
        db=db,
        owner_user_id=current_user.id,
        name=body.name,
        contact_id=body.contact_id,
        defaults=body.defaults,
    )
    contact = get_contact_for_owner(db=db, owner_user_id=current_user.id, contact_id=room.contact_id) if room.contact_id else None
    base_url = str(request.base_url).rstrip("/")
    return ChatRoomCreateResponse(
        room=ChatRoomOut.model_validate(room_to_dict(room, contact)),
        invite_token=invite.token,
        invite_link=build_invite_link(base_url=base_url, token=invite.token),
    )


@router.post("/api/chat/rooms/join", response_model=ChatRoomJoinResponse)
def post_join_chat_room(
    body: ChatRoomJoinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room, joined = join_room_by_invite_token(
        db=db,
        user_id=current_user.id,
        invite_token_value=body.invite_token,
    )
    return ChatRoomJoinResponse(room_id=room.id, joined=joined)


@router.get("/api/chat/rooms/{room_id}", response_model=ChatRoomDetailResponse)
def get_chat_room_detail(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room, _ = get_room_for_user(db=db, room_id=room_id, user_id=current_user.id)
    contact = None
    if room.contact_id:
        try:
            contact = get_contact_for_owner(db=db, owner_user_id=room.owner_user_id, contact_id=room.contact_id)
        except HTTPException:
            contact = None
    return ChatRoomDetailResponse(
        room=ChatRoomOut.model_validate(room_to_dict(room, contact)),
        members=list_room_members(db=db, room_id=room_id),
        recent_messages=list_recent_messages(db=db, room_id=room_id),
    )


@router.get("/api/chat/rooms/{room_id}/attachments", response_model=ChatAttachmentListResponse)
def get_chat_room_attachments(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return ChatAttachmentListResponse(
        attachments=[
            ChatAttachmentOut.model_validate(item)
            for item in list_room_attachments(db=db, room_id=room_id, user_id=current_user.id)
        ]
    )


@router.post("/api/chat/rooms/{room_id}/attachments", response_model=ChatAttachmentOut)
async def post_chat_room_attachment(
    room_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = await file.read()
    attachment = create_room_attachment(
        db=db,
        room_id=room_id,
        uploaded_by_user_id=current_user.id,
        filename=file.filename or "upload",
        mime_type=file.content_type or "application/octet-stream",
        payload=payload,
    )
    return ChatAttachmentOut.model_validate(attachment)


@router.get("/api/chat/rooms/{room_id}/attachments/{attachment_id}", response_model=ChatAttachmentOut)
def get_chat_room_attachment_detail(
    room_id: str,
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachment = get_room_attachment(db=db, room_id=room_id, user_id=current_user.id, attachment_id=attachment_id)
    return ChatAttachmentOut.model_validate(attachment)


@router.post("/api/chat/rooms/{room_id}/invite", response_model=InviteReissueResponse)
def post_chat_room_invite(
    room_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    invite = create_invite_token(db=db, room_id=room_id, requested_by_user_id=current_user.id)
    base_url = str(request.base_url).rstrip("/")
    return InviteReissueResponse(
        room_id=room_id,
        invite_token=invite.token,
        invite_link=build_invite_link(base_url=base_url, token=invite.token),
    )


@router.patch("/api/chat/rooms/{room_id}/settings", response_model=ChatRoomOut)
def patch_chat_room_settings(
    room_id: str,
    body: ChatRoomSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ = require_room_member(db=db, room_id=room_id, user_id=current_user.id)
    room = update_room_defaults(
        db=db,
        room_id=room_id,
        requested_by_user_id=current_user.id,
        relationship=body.relationship,
        goal=body.goal,
        image_goal=body.image_goal,
        banned_tones=body.banned_tones,
        default_send_policy=body.default_send_policy,
    )
    contact = None
    if room.contact_id:
        try:
            contact = get_contact_for_owner(db=db, owner_user_id=room.owner_user_id, contact_id=room.contact_id)
        except HTTPException:
            contact = None
    return ChatRoomOut.model_validate(room_to_dict(room, contact))


@router.patch("/api/chat/rooms/{room_id}/contact", response_model=ChatRoomOut)
def patch_chat_room_contact(
    room_id: str,
    body: ChatRoomContactRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room, contact = map_room_contact(
        db=db,
        room_id=room_id,
        owner_user_id=current_user.id,
        contact_id=body.contact_id,
        target_user=body.target_user,
        source=body.source,
    )
    return ChatRoomOut.model_validate(room_to_dict(room, contact))


@router.get("/api/contacts", response_model=ContactListResponse)
def get_contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contacts = list_contacts_for_owner(db=db, owner_user_id=current_user.id)
    return ContactListResponse(contacts=[ContactOut.model_validate(item) for item in contacts])


@router.post("/api/contacts", response_model=ContactOut)
def post_contact(
    body: ContactCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    contact = create_contact_for_owner(db=db, owner_user_id=current_user.id, body=body)
    return ContactOut.model_validate(
        {
            "id": contact.id,
            "owner_user_id": contact.owner_user_id,
            "contact_user_id": contact.contact_user_id,
            "alias": contact.alias,
            "email": contact.email,
            "source": contact.source,
            "created_at": contact.created_at,
            "updated_at": contact.updated_at,
        }
    )


