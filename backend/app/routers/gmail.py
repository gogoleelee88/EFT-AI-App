from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.app.models.chat import ChatMember, ChatRoom, Contact
from backend.app.services.auth_helpers import get_current_user
from backend.app.services.gmail_service import (
    get_gmail_message_detail_for_contact,
    get_gmail_threads_with_contact,
)
from backend.database import get_db
from backend.models.user import User


router = APIRouter(tags=["google-gmail"])
logger = logging.getLogger(__name__)


class GmailThreadItem(BaseModel):
    id: str | None = None
    thread_id: str | None = None
    snippet: str | None = None
    subject: str | None = None
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    date: str | None = None
    body_text: str | None = None
    body_html: str | None = None

    model_config = {"populate_by_name": True}


class GmailThreadsResponse(BaseModel):
    contact_id: str
    contact_email: str
    threads: list[GmailThreadItem]


class GmailSummaryResponse(BaseModel):
    contact_id: str
    contact_email: str
    summary: str
    recent_subjects: list[str]


class GmailMessageDetailResponse(BaseModel):
    contact_id: str
    contact_email: str
    message: GmailThreadItem


def _normalize_email(value: str | None) -> str:
    normalized = (value or "").strip().strip('"').lower()
    if not normalized:
        return ""
    if "<" in normalized and ">" in normalized:
        start = normalized.find("<")
        end = normalized.find(">", start + 1)
        if end > start:
            normalized = normalized[start + 1 : end].strip()
    return normalized


def _resolve_counterpart_email(
    db: Session,
    *,
    room_id: str,
    room_owner_id: str,
) -> str | None:
    counterpart_email_row = (
        db.query(User.email)
        .join(ChatMember, ChatMember.user_id == User.id)
        .filter(ChatMember.room_id == room_id, ChatMember.user_id != room_owner_id)
        .order_by(ChatMember.joined_at.asc())
        .scalar_one_or_none()
    )
    if not counterpart_email_row:
        return None
    return _normalize_email(str(counterpart_email_row)) or None


def _resolve_room_context_for_user(
    db: Session,
    *,
    contact_id: str,
    user_id: str,
) -> tuple[str, str, str, str]:
    room_and_owner = (
        db.query(ChatRoom.id, ChatRoom.owner_user_id, ChatRoom.contact_id)
        .join(ChatMember, ChatMember.room_id == ChatRoom.id)
        .filter(ChatRoom.contact_id == contact_id, ChatMember.user_id == user_id)
        .one_or_none()
    )
    if room_and_owner is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    room_id, room_owner_id, room_contact_id = room_and_owner

    resolved_contact_id = room_contact_id or ""
    if room_contact_id:
        contact = (
            db.query(Contact)
            .filter(Contact.id == room_contact_id, Contact.owner_user_id == room_owner_id)
            .one_or_none()
        )
        if contact is not None:
            normalized = _normalize_email(contact.email)
            if normalized:
                return room_contact_id, normalized, room_owner_id, room_id

    counterpart_email = _resolve_counterpart_email(db=db, room_id=room_id, room_owner_id=room_owner_id)
    if not counterpart_email:
        logger.warning(
            "gmail.contact-context.resolve.failed_no_counterpart path=contact-based contact_id=%s user_id=%s",
            contact_id,
            user_id,
        )
        raise HTTPException(status_code=404, detail="No counterpart email found for room")

    logger.debug(
        "gmail.contact-context.resolved path=contact-based contact_id=%s resolved_contact_id=%s room_owner_id=%s room_id=%s counterpart_email=%s",
        contact_id,
        resolved_contact_id,
        room_owner_id,
        room_id,
        counterpart_email,
    )
    return resolved_contact_id, counterpart_email, room_owner_id, room_id


def _resolve_room_context_for_user_by_room(
    db: Session,
    *,
    room_id: str,
    user_id: str,
) -> tuple[str, str, str, str]:
    room_and_owner = (
        db.query(ChatRoom.id, ChatRoom.owner_user_id, ChatRoom.contact_id)
        .join(ChatMember, ChatMember.room_id == ChatRoom.id)
        .filter(ChatRoom.id == room_id, ChatMember.user_id == user_id)
        .one_or_none()
    )
    if room_and_owner is None:
        logger.warning(
            "gmail.room-context.resolve.failed_no_room path=room-based room_id=%s user_id=%s",
            room_id,
            user_id,
        )
        raise HTTPException(status_code=404, detail="Room not found")
    _, room_owner_id, room_contact_id = room_and_owner

    resolved_contact_id = room_contact_id or ""
    if room_contact_id:
        contact = (
            db.query(Contact)
            .filter(Contact.id == room_contact_id, Contact.owner_user_id == room_owner_id)
            .one_or_none()
        )
        if contact is not None:
            normalized = _normalize_email(contact.email)
            if normalized:
                return room_contact_id, normalized, room_owner_id, room_id

    counterpart_email = _resolve_counterpart_email(db=db, room_id=room_id, room_owner_id=room_owner_id)
    if not counterpart_email:
        logger.warning(
            "gmail.room-context.resolve.failed_no_counterpart path=room-based room_id=%s user_id=%s",
            room_id,
            user_id,
        )
        raise HTTPException(status_code=404, detail="No counterpart email found for room")

    logger.debug(
        "gmail.room-context.resolved path=room-based room_id=%s resolved_contact_id=%s room_owner_id=%s counterpart_email=%s",
        room_id,
        resolved_contact_id,
        room_owner_id,
        counterpart_email,
    )
    return resolved_contact_id, counterpart_email, room_owner_id, room_id


def _load_threads_with_member_fallback(
    *,
    db: Session,
    room_owner_id: str,
    current_user_id: str,
    contact_email: str,
    limit: int,
) -> list[dict]:
    threads = get_gmail_threads_with_contact(
        db=db,
        user_id=room_owner_id,
        contact_email=contact_email,
        limit=limit,
    )
    if threads or room_owner_id == current_user_id:
        return threads
    return get_gmail_threads_with_contact(
        db=db,
        user_id=current_user_id,
        contact_email=contact_email,
        limit=limit,
    )


def _load_threads_with_dual_context(
    *,
    db: Session,
    contact_id: str,
    room_id: str,
    room_owner_id: str,
    current_user_id: str,
    contact_email: str,
    limit: int,
) -> tuple[str, list[dict]]:
    normalized = _normalize_email(contact_email)
    if not normalized:
        raise HTTPException(status_code=404, detail="No contact email found for room")

    threads = _load_threads_with_member_fallback(
        db=db,
        room_owner_id=room_owner_id,
        current_user_id=current_user_id,
        contact_email=normalized,
        limit=limit,
    )
    if threads:
        return normalized, threads

    fallback_email = _resolve_counterpart_email(db=db, room_id=room_id, room_owner_id=room_owner_id)
    if not fallback_email or fallback_email == normalized:
        return normalized, threads

    logger.warning(
        "gmail.threads.fallback_no_threads path=contact_context contact_id=%s room_id=%s user_id=%s base_email=%s fallback_email=%s",
        contact_id,
        room_id,
        current_user_id,
        normalized,
        fallback_email,
    )
    fallback_threads = _load_threads_with_member_fallback(
        db=db,
        room_owner_id=room_owner_id,
        current_user_id=current_user_id,
        contact_email=fallback_email,
        limit=limit,
    )
    if fallback_threads:
        return fallback_email, fallback_threads

    return normalized, threads


def _load_message_with_member_fallback(
    *,
    db: Session,
    room_owner_id: str,
    current_user_id: str,
    contact_email: str,
    message_id: str,
) -> dict | None:
    message = get_gmail_message_detail_for_contact(
        db=db,
        user_id=room_owner_id,
        contact_email=contact_email,
        message_id=message_id,
    )
    if message is not None or room_owner_id == current_user_id:
        return message
    return get_gmail_message_detail_for_contact(
        db=db,
        user_id=current_user_id,
        contact_email=contact_email,
        message_id=message_id,
    )


def _load_message_with_dual_context(
    *,
    db: Session,
    contact_id: str,
    room_id: str,
    room_owner_id: str,
    current_user_id: str,
    contact_email: str,
    message_id: str,
) -> tuple[str, dict | None]:
    normalized = _normalize_email(contact_email)
    if not normalized:
        raise HTTPException(status_code=404, detail="No contact email found for room")

    message = _load_message_with_member_fallback(
        db=db,
        room_owner_id=room_owner_id,
        current_user_id=current_user_id,
        contact_email=normalized,
        message_id=message_id,
    )
    if message is not None:
        return normalized, message

    fallback_email = _resolve_counterpart_email(db=db, room_id=room_id, room_owner_id=room_owner_id)
    if not fallback_email or fallback_email == normalized:
        return normalized, message

    logger.warning(
        "gmail.message-detail.fallback_no_match path=contact_context contact_id=%s room_id=%s user_id=%s base_email=%s fallback_email=%s message_id=%s",
        contact_id,
        room_id,
        current_user_id,
        normalized,
        fallback_email,
        message_id,
    )
    fallback_message = _load_message_with_member_fallback(
        db=db,
        room_owner_id=room_owner_id,
        current_user_id=current_user_id,
        contact_email=fallback_email,
        message_id=message_id,
    )
    if fallback_message is not None:
        return fallback_email, fallback_message
    return normalized, message


@router.get("/api/google/gmail/contacts/{contact_id}/threads", response_model=GmailThreadsResponse)
def get_gmail_threads(
    contact_id: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(
        "gmail.threads.request path=contact-based contact_id=%s user_id=%s",
        contact_id,
        current_user.id,
    )
    contact_id, contact_email, room_owner_id, room_id = _resolve_room_context_for_user(
        db=db,
        contact_id=contact_id,
        user_id=current_user.id,
    )
    logger.info("gmail.context.resolved path=contact-based contact_id=%s room_id=%s owner_id=%s contact_email=%s", contact_id, room_id, room_owner_id, contact_email)
    contact_email, threads = _load_threads_with_dual_context(
        db=db,
        contact_id=contact_id,
        room_id=room_id,
        room_owner_id=room_owner_id,
        current_user_id=current_user.id,
        contact_email=contact_email,
        limit=limit,
    )
    return GmailThreadsResponse(contact_id=contact_id, contact_email=contact_email, threads=threads)


@router.get("/api/google/gmail/rooms/{room_id}/threads", response_model=GmailThreadsResponse)
def get_gmail_threads_by_room(
    room_id: str,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(
        "gmail.threads.request path=room-based room_id=%s user_id=%s",
        room_id,
        current_user.id,
    )
    room_identifier = room_id
    contact_id, contact_email, room_owner_id, _ = _resolve_room_context_for_user_by_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )
    logger.info("gmail.context.resolved path=room-based room_id=%s contact_id=%s owner_id=%s contact_email=%s", room_id, contact_id, room_owner_id, contact_email)
    contact_email, threads = _load_threads_with_dual_context(
        db=db,
        contact_id=contact_id,
        room_id=room_identifier,
        room_owner_id=room_owner_id,
        current_user_id=current_user.id,
        contact_email=contact_email,
        limit=limit,
    )
    return GmailThreadsResponse(contact_id=contact_id, contact_email=contact_email, threads=threads)


@router.get("/api/google/gmail/contacts/{contact_id}/summary", response_model=GmailSummaryResponse)
def get_gmail_summary(
    contact_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(
        "gmail.summary.request path=contact-based contact_id=%s user_id=%s",
        contact_id,
        current_user.id,
    )
    contact_id, contact_email, room_owner_id, room_id = _resolve_room_context_for_user(
        db=db,
        contact_id=contact_id,
        user_id=current_user.id,
    )
    logger.info("gmail.context.resolved path=contact-based contact_id=%s room_id=%s owner_id=%s contact_email=%s", contact_id, room_id, room_owner_id, contact_email)
    contact_email, threads = _load_threads_with_dual_context(
        db=db,
        contact_id=contact_id,
        room_id=room_id,
        room_owner_id=room_owner_id,
        current_user_id=current_user.id,
        contact_email=contact_email,
        limit=limit,
    )
    subjects = [item.get("subject") for item in threads if item.get("subject")]
    snippets = [item.get("snippet") for item in threads[:3] if item.get("snippet")]
    if not threads:
        summary = "No Gmail thread found for this contact yet."
    else:
        summary = (
            f"Found {len(threads)} recent messages with {contact_email}. "
            f"Top subjects: {', '.join(subjects[:5]) if subjects else 'n/a'}. "
            f"Recent snippets: {' / '.join(snippets) if snippets else 'n/a'}."
        )
    return GmailSummaryResponse(
        contact_id=contact_id,
        contact_email=contact_email,
        summary=summary,
        recent_subjects=subjects[:10],
    )


@router.get("/api/google/gmail/rooms/{room_id}/summary", response_model=GmailSummaryResponse)
def get_gmail_summary_by_room(
    room_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(
        "gmail.summary.request path=room-based room_id=%s user_id=%s",
        room_id,
        current_user.id,
    )
    room_identifier = room_id
    contact_id, contact_email, room_owner_id, _ = _resolve_room_context_for_user_by_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )
    logger.info("gmail.context.resolved path=room-based room_id=%s contact_id=%s owner_id=%s contact_email=%s", room_id, contact_id, room_owner_id, contact_email)
    contact_email, threads = _load_threads_with_dual_context(
        db=db,
        contact_id=contact_id,
        room_id=room_identifier,
        room_owner_id=room_owner_id,
        current_user_id=current_user.id,
        contact_email=contact_email,
        limit=limit,
    )
    subjects = [item.get("subject") for item in threads if item.get("subject")]
    snippets = [item.get("snippet") for item in threads[:3] if item.get("snippet")]
    if not threads:
        summary = "No Gmail thread found for this contact yet."
    else:
        summary = (
            f"Found {len(threads)} recent messages with {contact_email}. "
            f"Top subjects: {', '.join(subjects[:5]) if subjects else 'n/a'}. "
            f"Recent snippets: {' / '.join(snippets) if snippets else 'n/a'}."
        )
    return GmailSummaryResponse(
        contact_id=contact_id,
        contact_email=contact_email,
        summary=summary,
        recent_subjects=subjects[:10],
    )


@router.get(
    "/api/google/gmail/contacts/{contact_id}/messages/{message_id}",
    response_model=GmailMessageDetailResponse,
)
def get_gmail_message_detail(
    contact_id: str,
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(
        "gmail.message-detail.request path=contact-based contact_id=%s message_id=%s user_id=%s",
        contact_id,
        message_id,
        current_user.id,
    )
    contact_id, contact_email, room_owner_id, room_id = _resolve_room_context_for_user(
        db=db,
        contact_id=contact_id,
        user_id=current_user.id,
    )
    contact_email, message = _load_message_with_dual_context(
        db=db,
        contact_id=contact_id,
        room_id=room_id,
        room_owner_id=room_owner_id,
        current_user_id=current_user.id,
        contact_email=contact_email,
        message_id=message_id,
    )
    if message is None:
        raise HTTPException(status_code=404, detail="Gmail message not found for contact")

    return GmailMessageDetailResponse(
        contact_id=contact_id,
        contact_email=contact_email,
        message=message,
    )


@router.get(
    "/api/google/gmail/rooms/{room_id}/messages/{message_id}",
    response_model=GmailMessageDetailResponse,
)
def get_gmail_message_detail_by_room(
    room_id: str,
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(
        "gmail.message-detail.request path=room-based room_id=%s message_id=%s user_id=%s",
        room_id,
        message_id,
        current_user.id,
    )
    room_identifier = room_id
    contact_id, contact_email, room_owner_id, _ = _resolve_room_context_for_user_by_room(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
    )
    contact_email, message = _load_message_with_dual_context(
        db=db,
        contact_id=contact_id,
        room_id=room_identifier,
        room_owner_id=room_owner_id,
        current_user_id=current_user.id,
        contact_email=contact_email,
        message_id=message_id,
    )
    if message is None:
        raise HTTPException(status_code=404, detail="Gmail message not found for contact")

    return GmailMessageDetailResponse(
        contact_id=contact_id,
        contact_email=contact_email,
        message=message,
    )


