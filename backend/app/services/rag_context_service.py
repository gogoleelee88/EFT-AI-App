from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.models.context_rag import ContextChunk
from config.settings import get_settings

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None


DEFAULT_TOP_K = 8
MAX_SUMMARY_INPUT = 8_000
MAX_SUMMARY_OUTPUT = 2_000


def _ensure_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _tokenize(text: str) -> set[str]:
    return {token.lower() for token in re.findall(r"[A-Za-z0-9ê°-??{2,}", text or "")}


def _heuristic_summary(text: str) -> str:
    if len(text) <= MAX_SUMMARY_OUTPUT:
        return text
    sentences = re.split(r"(?<=[.!??ï¼ï¼?)\s+", text)
    out: list[str] = []
    total = 0
    for sentence in sentences:
        clean = sentence.strip()
        if not clean:
            continue
        if total + len(clean) > MAX_SUMMARY_OUTPUT:
            break
        out.append(clean)
        total += len(clean)
        if len(out) >= 10:
            break
    if out:
        return " ".join(out)
    return text[:MAX_SUMMARY_OUTPUT]


def _llm_summary(text: str) -> str:
    settings = get_settings()
    api_key = (settings.OPENAI_API_KEY or "").strip()
    if not api_key or OpenAI is None:
        return ""
    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=(settings.OPENAI_MODEL or "gpt-5.2").strip(),
            temperature=0.1,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize retrieved communication context for reply coaching.\n"
                        "Return JSON only: {\"summary\":\"...\"}.\n"
                        "Keep concrete facts, objections, approval signals, and constraints."
                    ),
                },
                {"role": "user", "content": text[:MAX_SUMMARY_INPUT]},
            ],
            timeout=25,
        )
        content = (response.choices[0].message.content or "").strip()
        if not content:
            return ""
        import json

        parsed = json.loads(content)
        summary = str(parsed.get("summary") or "").strip()
        return summary[:MAX_SUMMARY_OUTPUT]
    except Exception:
        return ""


def retrieve_context_bundle(
    db: Session,
    *,
    room_id: str,
    contact_id: str | None,
    query_text: str,
    top_k: int = DEFAULT_TOP_K,
) -> dict[str, Any]:
    filters = [ContextChunk.room_id == room_id]
    if contact_id:
        filters.append(ContextChunk.contact_id == contact_id)
    q = db.query(ContextChunk).filter(or_(*filters))
    rows = q.order_by(ContextChunk.created_at.desc()).limit(350).all()
    if not rows:
        return {"items": [], "summary_text": "", "evidence_items": []}

    query_tokens = _tokenize(query_text)
    now = datetime.now(timezone.utc)

    scored: list[tuple[float, ContextChunk]] = []
    for row in rows:
        text = row.chunk_text or ""
        if not text:
            continue

        item_tokens = _tokenize(text)
        overlap = len(query_tokens.intersection(item_tokens)) if query_tokens else 0
        if query_tokens and overlap == 0:
            continue

        recency_bonus = 0.0
        created_at = _ensure_aware(row.created_at)
        if created_at:
            delta_hours = max(0.0, (now - created_at).total_seconds() / 3600.0)
            recency_bonus = max(0.0, 1.2 - min(delta_hours / 48.0, 1.2))

        source_bonus = {"chat": 0.8, "email": 0.7, "attachment": 0.6}.get((row.source or "").lower(), 0.3)
        score = overlap * 2.2 + recency_bonus + source_bonus
        scored.append((score, row))

    if not scored:
        scored = [(1.0, row) for row in rows[:top_k]]

    scored.sort(key=lambda item: item[0], reverse=True)
    selected = scored[: max(3, min(top_k, 12))]

    items: list[dict[str, Any]] = []
    evidence_items: list[str] = []
    merged_lines: list[str] = []
    seen_text = set()
    for score, row in selected:
        text = (row.chunk_text or "").strip()
        if not text:
            continue
        key = text[:160]
        if key in seen_text:
            continue
        seen_text.add(key)
        source = (row.source or "context").lower()
        snippet = text[:280]
        items.append(
            {
                "chunk_id": row.id,
                "source": source,
                "text": snippet,
                "score": round(score, 2),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )
        merged_lines.append(f"[{source}] {text}")
        if len(evidence_items) < 3:
            evidence_items.append(f"[{source}] {snippet[:90]}")

    merged = "\n".join(merged_lines).strip()
    if len(merged) > MAX_SUMMARY_OUTPUT:
        summary = _llm_summary(merged)
        if not summary:
            summary = _heuristic_summary(merged)
    else:
        summary = merged

    return {
        "items": items,
        "summary_text": summary,
        "evidence_items": evidence_items[:3],
    }

