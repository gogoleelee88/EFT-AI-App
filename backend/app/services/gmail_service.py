from __future__ import annotations

import base64
import html
import json
import logging
import re
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from backend.spec_loop.google_calendar.models import GoogleToken


logger = logging.getLogger(__name__)


def _build_credentials(token_json: str) -> Credentials:
    return Credentials.from_authorized_user_info(json.loads(token_json))


def _log_and_refresh_credentials(creds: Credentials, *, user_id: str) -> None:
    logger.info(
        "gmail.debug.creds valid=%s expired=%s has_refresh=%s user_id=%s",
        getattr(creds, "valid", None),
        getattr(creds, "expired", None),
        bool(getattr(creds, "refresh_token", None)),
        user_id,
    )
    if getattr(creds, "expired", False) and getattr(creds, "refresh_token", None):
        try:
            creds.refresh(Request())
            logger.info("gmail.debug.creds refreshed user_id=%s", user_id)
        except Exception as exc:
            logger.warning("gmail.debug.creds refresh failed user_id=%s err=%s", user_id, exc)


def _header_map(payload_headers: list[dict[str, str]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in payload_headers:
        name = (item.get("name") or "").lower().strip()
        value = (item.get("value") or "").strip()
        if name:
            out[name] = value
    return out


def _decode_base64url(data: str | None) -> str:
    if not data:
        return ""
    try:
        padding = "=" * (-len(data) % 4)
        raw = base64.urlsafe_b64decode(f"{data}{padding}".encode("utf-8"))
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return ""


def _normalize_email_for_query(raw_email: str | None) -> str:
    normalized = (raw_email or "").strip().strip('"').lower()
    if not normalized:
        return ""
    if "<" in normalized and ">" in normalized:
        start = normalized.find("<")
        end = normalized.find(">", start + 1)
        if end > start:
            normalized = normalized[start + 1 : end].strip()
    return normalized


def _extract_emails(value: str | None) -> list[str]:
    text = (value or "").lower()
    if not text:
        return []
    return re.findall(r"[\w.+-]+@[\w.-]+\.[a-z0-9.-]+", text)


def _strip_html_text(value: str) -> str:
    if not value:
        return ""
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", value)
    text = re.sub(r"(?is)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)</p>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()


def _iter_message_parts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    stack = [payload]
    while stack:
        part = stack.pop()
        if not isinstance(part, dict):
            continue
        parts.append(part)
        children = part.get("parts") or []
        if isinstance(children, list):
            for child in children:
                if isinstance(child, dict):
                    stack.append(child)
    return parts


def _fetch_attachment_data(service: Any, *, message_id: str, attachment_id: str) -> str:
    try:
        attachment = (
            service.users()
            .messages()
            .attachments()
            .get(userId="me", messageId=message_id, id=attachment_id)
            .execute()
        )
    except Exception:
        return ""
    return _decode_base64url((attachment or {}).get("data"))


def _extract_bodies_from_payload(service: Any, *, message_id: str, payload: dict[str, Any]) -> tuple[str | None, str | None]:
    plain_chunks: list[str] = []
    html_chunks: list[str] = []
    seen_plain: set[str] = set()
    seen_html: set[str] = set()

    for part in _iter_message_parts(payload):
        mime = str(part.get("mimeType") or "").lower()
        body = part.get("body") or {}
        data = body.get("data")
        attachment_id = body.get("attachmentId")

        text = _decode_base64url(data)
        if not text and attachment_id and mime in {"text/plain", "text/html"}:
            text = _fetch_attachment_data(service, message_id=message_id, attachment_id=str(attachment_id))
        if not text:
            continue

        if mime == "text/plain":
            if text not in seen_plain:
                plain_chunks.append(text)
                seen_plain.add(text)
            continue
        if mime == "text/html":
            if text not in seen_html:
                html_chunks.append(text)
                seen_html.add(text)
            continue

        # Top-level non-multipart payloads may contain useful body text too.
        if mime.startswith("multipart/"):
            continue
        if text not in seen_plain:
            plain_chunks.append(text)
            seen_plain.add(text)

    body_html = "\n\n".join(html_chunks).strip() or None
    if plain_chunks:
        body_text = "\n\n".join(plain_chunks).strip() or None
    elif body_html:
        body_text = _strip_html_text(body_html) or None
    else:
        body_text = None
    return body_text, body_html


def get_gmail_threads_with_contact(
    db: Session,
    *,
    user_id: str,
    contact_email: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    contact_email = _normalize_email_for_query(contact_email)
    logger.info("gmail.debug.target_email normalized=%s user_id=%s", contact_email, user_id)
    if not contact_email:
        return []

    row = db.query(GoogleToken).filter(GoogleToken.user_id == user_id).one_or_none()
    if row is None:
        return []

    try:
        creds = _build_credentials(row.token_json)
    except Exception:
        return []
    _log_and_refresh_credentials(creds, user_id=user_id)
    try:
        service = build("gmail", "v1", credentials=creds)
    except Exception:
        return []

    try:
        profile = service.users().getProfile(userId="me").execute()
        token_email = (profile or {}).get("emailAddress")
        logger.info("gmail.debug.profile token_email=%s user_id=%s", token_email, user_id)
    except Exception as exc:
        logger.warning("gmail.debug.profile failed user_id=%s err=%s", user_id, exc)

    q = f'(from:"{contact_email}" OR to:"{contact_email}")'
    logger.info("gmail.debug.query q=%s user_id=%s", q, user_id)
    try:
        response = (
            service.users()
            .messages()
            .list(userId="me", q=q, maxResults=max(1, min(limit, 50)))
            .execute()
        )
    except Exception:
        return []

    messages = response.get("messages", []) or []
    logger.info("gmail.debug.list result_size=%s message_count=%s user_id=%s", response.get("resultSizeEstimate"), len(messages), user_id)
    out: list[dict[str, Any]] = []
    for item in messages:
        msg_id = item.get("id")
        if not msg_id:
            continue
        try:
            detail = (
                service.users()
                .messages()
                .get(userId="me", id=msg_id, format="metadata", metadataHeaders=["Subject", "From", "To", "Date"])
                .execute()
            )
        except Exception:
            continue

        payload = detail.get("payload", {}) or {}
        headers = _header_map(payload.get("headers", []) or [])
        out.append(
            {
                "id": detail.get("id"),
                "thread_id": detail.get("threadId"),
                "snippet": detail.get("snippet"),
                "subject": headers.get("subject"),
                "from": headers.get("from"),
                "to": headers.get("to"),
                "date": headers.get("date"),
            }
        )
    return out


def get_gmail_message_detail_for_contact(
    db: Session,
    *,
    user_id: str,
    contact_email: str,
    message_id: str,
) -> dict[str, Any] | None:
    contact_email = _normalize_email_for_query(contact_email)
    if not contact_email:
        return None

    row = db.query(GoogleToken).filter(GoogleToken.user_id == user_id).one_or_none()
    if row is None:
        return None

    try:
        creds = _build_credentials(row.token_json)
    except Exception:
        return None
    _log_and_refresh_credentials(creds, user_id=user_id)
    try:
        service = build("gmail", "v1", credentials=creds)
    except Exception:
        return None

    try:
        detail = (
            service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )
    except Exception:
        return None

    payload = detail.get("payload", {}) or {}
    headers = _header_map(payload.get("headers", []) or [])
    from_to = f"{headers.get('from') or ''} {headers.get('to') or ''}"
    email_tokens = {_normalize_email_for_query(item) for item in _extract_emails(from_to)}
    if contact_email not in email_tokens:
        return None

    body_text, body_html = _extract_bodies_from_payload(service, message_id=message_id, payload=payload)

    return {
        "id": detail.get("id"),
        "thread_id": detail.get("threadId"),
        "snippet": detail.get("snippet"),
        "subject": headers.get("subject"),
        "from": headers.get("from"),
        "to": headers.get("to"),
        "date": headers.get("date"),
        "body_text": body_text,
        "body_html": body_html,
    }

