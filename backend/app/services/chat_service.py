from __future__ import annotations

import json
import io
import os
import re
import secrets
import zipfile
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.models.chat import ChatAttachment, ChatMember, ChatMessage, ChatRoom, Contact, InviteToken
from backend.app.schemas.chat import ContactCreateRequest, RoomDefaults
from backend.models.user import User


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_string_list(value: object, fallback: list[str]) -> list[str]:
    if isinstance(value, list):
        cleaned = [str(item) for item in value if isinstance(item, str) and item.strip()]
        if cleaned:
            return cleaned
    return list(fallback)


MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
MAX_EXTRACTED_TEXT_CHARS = 24_000
UPLOAD_ROOT = Path(os.getenv("CHAT_ATTACHMENT_DIR") or "backend/storage/chat_attachments")


def _safe_filename(name: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9._-]+", "_", (name or "upload").strip())
    return clean[:120] or "upload"


def _decode_text_bytes(payload: bytes) -> str:
    for encoding in ("utf-8", "utf-8-sig", "cp949", "euc-kr", "latin-1"):
        try:
            return payload.decode(encoding)
        except Exception:
            continue
    return payload.decode("utf-8", errors="ignore")


def _extract_text_from_docx(payload: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            xml_payload = zf.read("word/document.xml")
    except Exception:
        return ""

    try:
        root = ElementTree.fromstring(xml_payload)
    except Exception:
        return ""

    texts: list[str] = []
    for node in root.iter():
        if node.tag.endswith("}t") and node.text:
            texts.append(node.text)
    return "\n".join(texts).strip()


def _extract_text_from_pdf(payload: bytes) -> str:
    try:
        from pypdf import PdfReader  # type: ignore[import-not-found]
    except Exception:
        return ""

    try:
        reader = PdfReader(io.BytesIO(payload))
        chunks = []
        for page in reader.pages[:30]:
            text = (page.extract_text() or "").strip()
            if text:
                chunks.append(text)
        return "\n\n".join(chunks).strip()
    except Exception:
        return ""


def _extract_attachment_text(*, filename: str, mime_type: str, payload: bytes) -> str:
    lower_name = filename.lower()
    lower_mime = (mime_type or "").lower()

    if lower_name.endswith(".docx") or "wordprocessingml.document" in lower_mime:
        return _extract_text_from_docx(payload)

    if lower_name.endswith(".pdf") or lower_mime == "application/pdf":
        return _extract_text_from_pdf(payload)

    if lower_name.endswith(".eml") or lower_mime == "message/rfc822":
        try:
            msg = BytesParser(policy=policy.default).parsebytes(payload)
            part_texts: list[str] = []
            if msg.is_multipart():
                for part in msg.walk():
                    content_type = (part.get_content_type() or "").lower()
                    if content_type.startswith("text/"):
                        try:
                            part_texts.append(part.get_content().strip())
                        except Exception:
                            continue
            else:
                try:
                    part_texts.append(str(msg.get_content()).strip())
                except Exception:
                    pass
            return "\n\n".join([t for t in part_texts if t]).strip()
        except Exception:
            return ""

    if lower_name.endswith(".json") or lower_mime == "application/json":
        try:
            obj = json.loads(_decode_text_bytes(payload))
            return json.dumps(obj, ensure_ascii=False, indent=2)
        except Exception:
            return _decode_text_bytes(payload)

    text_like_ext = (
        ".txt",
        ".md",
        ".csv",
        ".tsv",
        ".log",
        ".yaml",
        ".yml",
        ".xml",
        ".html",
        ".htm",
    )
    if (
        lower_mime.startswith("text/")
        or lower_name.endswith(text_like_ext)
        or lower_mime in {"application/xml", "application/x-yaml"}
    ):
        return _decode_text_bytes(payload)

    return ""


def generate_invite_token() -> str:
    return secrets.token_urlsafe(24)


def build_invite_link(base_url: str, token: str) -> str:
    return f"{base_url.rstrip('/')}/chat/invite/{token}"


def contact_to_dict(contact: Contact) -> dict:
    return {
        "id": contact.id,
        "owner_user_id": contact.owner_user_id,
        "contact_user_id": contact.contact_user_id,
        "alias": contact.alias,
        "email": contact.email,
        "source": contact.source,
        "created_at": contact.created_at,
        "updated_at": contact.updated_at,
    }


def room_to_dict(room: ChatRoom, contact: Optional[Contact] = None) -> dict:
    return {
        "id": room.id,
        "name": room.name,
        "owner_user_id": room.owner_user_id,
        "contact_id": room.contact_id,
        "contact_alias": contact.alias if contact else None,
        "contact_email": contact.email if contact else None,
        "default_relationship": room.default_relationship,
        "default_goal": room.default_goal,
        "default_image_goal": _safe_string_list(room.default_image_goal, ["professional", "kind"]),
        "default_banned_tones": _safe_string_list(room.default_banned_tones, ["blame", "emotional_outburst"]),
        "default_send_policy": room.default_send_policy,
        "created_at": room.created_at,
        "updated_at": room.updated_at,
    }


def member_to_dict(member: ChatMember, user: Optional[User]) -> dict:
    return {
        "user_id": member.user_id,
        "role": member.role,
        "name": user.name if user else None,
        "email": user.email if user else None,
        "joined_at": member.joined_at,
    }


def message_to_dict(message: ChatMessage, user: Optional[User]) -> dict:
    return {
        "id": message.id,
        "room_id": message.room_id,
        "sender": {
            "user_id": message.sender_user_id,
            "name": user.name if user else None,
        },
        "text": message.text,
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


def attachment_to_dict(attachment: ChatAttachment, *, include_text: bool = False) -> dict:
    preview = (attachment.extracted_text or "")[:600] or None
    return {
        "id": attachment.id,
        "room_id": attachment.room_id,
        "uploaded_by_user_id": attachment.uploaded_by_user_id,
        "filename": attachment.filename,
        "mime_type": attachment.mime_type,
        "size_bytes": int(attachment.size_bytes or 0),
        "extracted_preview": preview,
        "extracted_text": attachment.extracted_text if include_text else None,
        "created_at": attachment.created_at,
    }


def get_member(db: Session, room_id: str, user_id: str) -> Optional[ChatMember]:
    return (
        db.query(ChatMember)
        .filter(ChatMember.room_id == room_id, ChatMember.user_id == user_id)
        .one_or_none()
    )


def require_room_member(db: Session, room_id: str, user_id: str) -> ChatMember:
    member = get_member(db=db, room_id=room_id, user_id=user_id)
    if member is None:
        raise HTTPException(status_code=403, detail="Room membership required")
    return member


def create_room(
    db: Session,
    owner_user_id: str,
    name: Optional[str] = None,
    contact_id: Optional[str] = None,
    defaults: Optional[RoomDefaults] = None,
) -> tuple[ChatRoom, InviteToken]:
    room_defaults = defaults or RoomDefaults()
    contact: Optional[Contact] = None
    if contact_id:
        contact = (
            db.query(Contact)
            .filter(Contact.id == contact_id, Contact.owner_user_id == owner_user_id)
            .one_or_none()
        )
        if contact is None:
            raise HTTPException(status_code=404, detail="Contact not found")

        # Reuse existing direct room for this contact to keep 1:1 room stable.
        existing_room = (
            db.query(ChatRoom)
            .filter(ChatRoom.owner_user_id == owner_user_id, ChatRoom.contact_id == contact_id)
            .one_or_none()
        )
        if existing_room:
            existing_invite = (
                db.query(InviteToken)
                .filter(InviteToken.room_id == existing_room.id, InviteToken.is_active.is_(True))
                .order_by(InviteToken.created_at.desc())
                .first()
            )
            if existing_invite is None:
                existing_invite = InviteToken(
                    room_id=existing_room.id,
                    token=generate_invite_token(),
                    created_by_user_id=owner_user_id,
                    is_active=True,
                )
                db.add(existing_invite)
                db.commit()
                db.refresh(existing_invite)
            return existing_room, existing_invite

    room = ChatRoom(
        name=name,
        owner_user_id=owner_user_id,
        contact_id=contact_id,
        default_relationship=room_defaults.relationship,
        default_goal=room_defaults.goal,
        default_image_goal=list(room_defaults.image_goal),
        default_banned_tones=list(room_defaults.banned_tones),
        default_send_policy=room_defaults.default_send_policy,
    )
    db.add(room)
    db.flush()

    owner_member = ChatMember(room_id=room.id, user_id=owner_user_id, role="owner")
    db.add(owner_member)
    if contact and contact.contact_user_id and contact.contact_user_id != owner_user_id:
        existing_contact_member = get_member(db=db, room_id=room.id, user_id=contact.contact_user_id)
        if existing_contact_member is None:
            db.add(ChatMember(room_id=room.id, user_id=contact.contact_user_id, role="member"))

    invite = InviteToken(
        room_id=room.id,
        token=generate_invite_token(),
        created_by_user_id=owner_user_id,
        is_active=True,
    )
    db.add(invite)

    db.commit()
    db.refresh(room)
    db.refresh(invite)
    return room, invite


def list_rooms_for_user(db: Session, user_id: str) -> list[dict]:
    rows = (
        db.query(ChatMember, ChatRoom)
        .join(ChatRoom, ChatRoom.id == ChatMember.room_id)
        .filter(ChatMember.user_id == user_id)
        .order_by(ChatRoom.updated_at.desc())
        .all()
    )

    results: list[dict] = []
    contact_ids = [room.contact_id for _, room in rows if room.contact_id]
    contacts_by_id: dict[str, Contact] = {}
    if contact_ids:
        contact_rows = db.query(Contact).filter(Contact.id.in_(contact_ids)).all()
        contacts_by_id = {contact.id: contact for contact in contact_rows}

    for member, room in rows:
        member_count = (
            db.query(func.count(ChatMember.id))
            .filter(ChatMember.room_id == room.id)
            .scalar()
            or 0
        )
        results.append(
            {
                "room": room_to_dict(room),
                "role": member.role,
                "member_count": int(member_count),
            }
        )
        if room.contact_id:
            results[-1]["room"] = room_to_dict(room, contacts_by_id.get(room.contact_id))
    return results


def get_room_for_user(db: Session, room_id: str, user_id: str) -> tuple[ChatRoom, ChatMember]:
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    member = require_room_member(db=db, room_id=room_id, user_id=user_id)
    return room, member


def get_contact_for_owner(db: Session, owner_user_id: str, contact_id: str) -> Contact:
    contact = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.owner_user_id == owner_user_id)
        .one_or_none()
    )
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


def map_room_contact(
    db: Session,
    room_id: str,
    owner_user_id: str,
    *,
    contact_id: Optional[str] = None,
    target_user: Optional[str] = None,
    source: str = "auto_openchat",
) -> tuple[ChatRoom, Contact]:
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if room.owner_user_id != owner_user_id:
        raise HTTPException(status_code=403, detail="Only room owner can map contact")

    target_email = (target_user or "").strip().lower()
    if not contact_id and not target_email:
        raise HTTPException(status_code=400, detail="Either contact_id or target_user is required")

    resolved_contact: Contact | None = None
    if contact_id:
        resolved_contact = get_contact_for_owner(
            db=db,
            owner_user_id=owner_user_id,
            contact_id=contact_id,
        )
    else:
        normalized_source = (source or "auto_openchat").strip()[:32] or "auto_openchat"
        resolved_contact = create_contact_for_owner(
            db=db,
            owner_user_id=owner_user_id,
            body=ContactCreateRequest(email=target_email, source=normalized_source),
        )

    if resolved_contact is None:
        raise HTTPException(status_code=404, detail="Failed to resolve contact")

    if room.contact_id != resolved_contact.id:
        room.contact_id = resolved_contact.id
        room.updated_at = _utcnow()
        db.add(room)

    if resolved_contact.contact_user_id and resolved_contact.contact_user_id != owner_user_id:
        existing_member = get_member(db=db, room_id=room.id, user_id=resolved_contact.contact_user_id)
        if existing_member is None:
            db.add(ChatMember(room_id=room.id, user_id=resolved_contact.contact_user_id, role="member"))

    db.commit()
    db.refresh(room)
    return room, resolved_contact


def list_contacts_for_owner(db: Session, owner_user_id: str) -> list[dict]:
    rows = (
        db.query(Contact)
        .filter(Contact.owner_user_id == owner_user_id)
        .order_by(Contact.updated_at.desc())
        .all()
    )
    return [contact_to_dict(row) for row in rows]


def create_contact_for_owner(db: Session, owner_user_id: str, body: ContactCreateRequest) -> Contact:
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    existing = (
        db.query(Contact)
        .filter(Contact.owner_user_id == owner_user_id, Contact.email == email)
        .one_or_none()
    )
    if existing:
        if body.alias is not None:
            existing.alias = body.alias.strip() or None
        if body.source:
            existing.source = body.source
        existing.updated_at = _utcnow()
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    linked_user = db.query(User).filter(func.lower(User.email) == email).one_or_none()
    contact = Contact(
        owner_user_id=owner_user_id,
        contact_user_id=linked_user.id if linked_user else None,
        alias=(body.alias.strip() if body.alias else None),
        email=email,
        source=body.source or "manual",
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


def list_room_members(db: Session, room_id: str) -> list[dict]:
    rows = (
        db.query(ChatMember, User)
        .join(User, User.id == ChatMember.user_id)
        .filter(ChatMember.room_id == room_id)
        .order_by(ChatMember.joined_at.asc())
        .all()
    )
    return [member_to_dict(member=member, user=user) for member, user in rows]


def list_recent_messages(db: Session, room_id: str, limit: int = 80) -> list[dict]:
    rows = (
        db.query(ChatMessage, User)
        .join(User, User.id == ChatMessage.sender_user_id)
        .filter(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()
    return [message_to_dict(message=message, user=user) for message, user in rows]


def list_room_attachments(db: Session, room_id: str, user_id: str, limit: int = 30) -> list[dict]:
    _ = require_room_member(db=db, room_id=room_id, user_id=user_id)
    rows = (
        db.query(ChatAttachment)
        .filter(ChatAttachment.room_id == room_id)
        .order_by(ChatAttachment.created_at.desc())
        .limit(limit)
        .all()
    )
    return [attachment_to_dict(item, include_text=False) for item in rows]


def get_room_attachment(db: Session, room_id: str, user_id: str, attachment_id: str) -> dict:
    _ = require_room_member(db=db, room_id=room_id, user_id=user_id)
    row = (
        db.query(ChatAttachment)
        .filter(ChatAttachment.id == attachment_id, ChatAttachment.room_id == room_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return attachment_to_dict(row, include_text=True)


def create_room_attachment(
    db: Session,
    *,
    room_id: str,
    uploaded_by_user_id: str,
    filename: str,
    mime_type: str,
    payload: bytes,
) -> dict:
    _ = require_room_member(db=db, room_id=room_id, user_id=uploaded_by_user_id)

    size = len(payload)
    if size == 0:
        raise HTTPException(status_code=400, detail="Attachment is empty")
    if size > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=400, detail=f"Attachment is too large (max {MAX_ATTACHMENT_BYTES} bytes)")

    safe_name = _safe_filename(filename)
    mime = (mime_type or "application/octet-stream").strip() or "application/octet-stream"

    attachment = ChatAttachment(
        room_id=room_id,
        uploaded_by_user_id=uploaded_by_user_id,
        filename=safe_name,
        mime_type=mime,
        size_bytes=size,
        storage_path="",
        extracted_text=None,
    )
    db.add(attachment)
    db.flush()

    room_dir = UPLOAD_ROOT / room_id
    room_dir.mkdir(parents=True, exist_ok=True)
    storage_name = f"{attachment.id}_{safe_name}"
    storage_path = room_dir / storage_name
    with storage_path.open("wb") as fp:
        fp.write(payload)

    extracted = _extract_attachment_text(filename=safe_name, mime_type=mime, payload=payload)
    extracted = extracted.strip()[:MAX_EXTRACTED_TEXT_CHARS] if extracted else None

    attachment.storage_path = str(storage_path)
    attachment.extracted_text = extracted

    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).one_or_none()
    if room:
        room.updated_at = _utcnow()
        db.add(room)

    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment_to_dict(attachment, include_text=True)


def build_attachment_context(
    db: Session,
    *,
    room_id: str,
    user_id: str,
    attachment_ids: Optional[list[str]] = None,
    limit: int = 5,
) -> list[dict]:
    _ = require_room_member(db=db, room_id=room_id, user_id=user_id)
    if not attachment_ids:
        return []

    query = (
        db.query(ChatAttachment)
        .filter(ChatAttachment.room_id == room_id)
        .filter(ChatAttachment.id.in_(attachment_ids))
    )

    rows = query.order_by(ChatAttachment.created_at.desc()).limit(limit).all()
    out: list[dict] = []
    for row in rows:
        if not row.extracted_text:
            continue
        out.append(
            {
                "id": row.id,
                "filename": row.filename,
                "mime_type": row.mime_type,
                "excerpt": row.extracted_text[:2000],
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )
    return out


def create_invite_token(db: Session, room_id: str, requested_by_user_id: str) -> InviteToken:
    member = require_room_member(db=db, room_id=room_id, user_id=requested_by_user_id)
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only room owner can issue invite tokens")

    invite = InviteToken(
        room_id=room_id,
        token=generate_invite_token(),
        created_by_user_id=requested_by_user_id,
        is_active=True,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


def join_room_by_invite_token(db: Session, user_id: str, invite_token_value: str) -> tuple[ChatRoom, bool]:
    invite = (
        db.query(InviteToken)
        .filter(InviteToken.token == invite_token_value, InviteToken.is_active.is_(True))
        .one_or_none()
    )
    if invite is None:
        raise HTTPException(status_code=404, detail="Invalid invite token")
    if invite.expires_at and invite.expires_at < _utcnow():
        raise HTTPException(status_code=410, detail="Invite token expired")

    room = db.query(ChatRoom).filter(ChatRoom.id == invite.room_id).one_or_none()
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")

    existing = get_member(db=db, room_id=room.id, user_id=user_id)
    if existing:
        return room, False

    member = ChatMember(room_id=room.id, user_id=user_id, role="member")
    db.add(member)
    room.updated_at = _utcnow()
    db.add(room)
    db.commit()
    db.refresh(room)
    return room, True


def update_room_defaults(
    db: Session,
    room_id: str,
    requested_by_user_id: str,
    *,
    relationship: Optional[str] = None,
    goal: Optional[str] = None,
    image_goal: Optional[list[str]] = None,
    banned_tones: Optional[list[str]] = None,
    default_send_policy: Optional[str] = None,
) -> ChatRoom:
    room, member = get_room_for_user(db=db, room_id=room_id, user_id=requested_by_user_id)
    if member.role != "owner":
        raise HTTPException(status_code=403, detail="Only room owner can update room settings")

    if relationship is not None:
        room.default_relationship = relationship
    if goal is not None:
        room.default_goal = goal
    if image_goal is not None:
        room.default_image_goal = list(image_goal)
    if banned_tones is not None:
        room.default_banned_tones = list(banned_tones)
    if default_send_policy is not None:
        room.default_send_policy = default_send_policy

    room.updated_at = _utcnow()
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


def save_room_message(db: Session, room_id: str, sender_user_id: str, text: str) -> tuple[ChatMessage, Optional[User]]:
    clean = (text or "").strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Message text is required")
    if len(clean) > 4000:
        raise HTTPException(status_code=400, detail="Message text is too long")

    _ = require_room_member(db=db, room_id=room_id, user_id=sender_user_id)
    message = ChatMessage(room_id=room_id, sender_user_id=sender_user_id, text=clean)
    db.add(message)

    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).one_or_none()
    if room:
        room.updated_at = _utcnow()
        db.add(room)

    db.commit()
    db.refresh(message)

    sender = db.query(User).filter(User.id == sender_user_id).one_or_none()
    return message, sender


