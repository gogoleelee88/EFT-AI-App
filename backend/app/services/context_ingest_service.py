from __future__ import annotations

import hashlib
import re
from typing import Any

from sqlalchemy.orm import Session

from backend.app.models.context_rag import ContextChunk


MAX_CHUNK_CHARS = 720


def _normalize_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    return cleaned


def _split_chunks(text: str, *, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    normalized = _normalize_text(text)
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    chunks: list[str] = []
    cursor = 0
    while cursor < len(normalized):
        window = normalized[cursor : cursor + max_chars]
        if len(window) == max_chars:
            split_at = window.rfind(". ")
            if split_at < int(max_chars * 0.4):
                split_at = window.rfind(" ")
            if split_at > 0:
                window = window[: split_at + 1]
        chunks.append(window.strip())
        cursor += max(1, len(window))
    return [item for item in chunks if item]


def _chunk_hash(*, room_id: str, contact_id: str | None, source: str, text: str) -> str:
    key = f"{room_id}|{contact_id or ''}|{source}|{text}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def ingest_room_context_chunks(
    db: Session,
    *,
    room_id: str,
    contact_id: str | None,
    chat_texts: list[str] | None = None,
    email_texts: list[str] | None = None,
    attachment_texts: list[str] | None = None,
) -> dict[str, int]:
    payloads: list[tuple[str, str, dict[str, Any]]] = []
    for idx, text in enumerate(chat_texts or []):
        payloads.append(("chat", text, {"index": idx}))
    for idx, text in enumerate(email_texts or []):
        payloads.append(("email", text, {"index": idx}))
    for idx, text in enumerate(attachment_texts or []):
        payloads.append(("attachment", text, {"index": idx}))

    candidates: list[tuple[str, str, dict[str, Any], str]] = []
    for source, raw_text, metadata in payloads:
        for chunk_idx, chunk in enumerate(_split_chunks(raw_text)):
            digest = _chunk_hash(room_id=room_id, contact_id=contact_id, source=source, text=chunk)
            merged_meta = dict(metadata)
            merged_meta["chunk_index"] = chunk_idx
            candidates.append((source, chunk, merged_meta, digest))

    if not candidates:
        return {"inserted": 0, "scanned": 0}

    hashes = [item[3] for item in candidates]
    existing_hashes = {
        row[0]
        for row in (
            db.query(ContextChunk.chunk_hash)
            .filter(ContextChunk.chunk_hash.in_(hashes))
            .all()
        )
    }

    inserted = 0
    for source, chunk, metadata, digest in candidates:
        if digest in existing_hashes:
            continue
        row = ContextChunk(
            room_id=room_id,
            contact_id=contact_id,
            source=source,
            chunk_hash=digest,
            chunk_text=chunk,
            metadata_json=metadata,
        )
        db.add(row)
        inserted += 1

    if inserted:
        db.commit()

    return {"inserted": inserted, "scanned": len(candidates)}

