from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.models.context_rag import ContextChunk, ProfileCache


PROFILE_CACHE_TTL_HOURS = 24


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _tokenize(text: str) -> set[str]:
    # Keep tokenization conservative to avoid decoding issues.
    return {token.lower() for token in re.findall(r"[A-Za-z0-9\uac00-\ud7a3]{2,}", text or "")}


def _clip(text: str, n: int = 28) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    return clean[:n]


def _build_profile(chunks: list[ContextChunk]) -> tuple[dict[str, Any], list[str], float]:
    merged = " ".join((row.chunk_text or "") for row in chunks)
    tokens = _tokenize(merged)

    logical_markers = {
        "analysis",
        "reason",
        "evidence",
        "fact",
        "data",
        "logic",
    }
    emotional_markers = {
        "feel",
        "emotion",
        "relationship",
        "trust",
        "worry",
        "fear",
        "support",
    }
    fast_markers = {"urgent", "immediate", "right now", "asap", "important", "quick"}
    slow_markers = {"careful", "confirm", "double check", "slow", "deliberate", "long"}
    price_markers = {"price", "budget", "fee", "cost", "expense", "payment"}
    pushback_markers = {"pushback", "objection", "counter", "concern", "resistance"}

    logical_hits = len(tokens.intersection(logical_markers))
    emotional_hits = len(tokens.intersection(emotional_markers))
    fast_hits = len(tokens.intersection(fast_markers))
    slow_hits = len(tokens.intersection(slow_markers))
    price_hits = len(tokens.intersection(price_markers))
    pushback_hits = len(tokens.intersection(pushback_markers))

    if logical_hits >= emotional_hits + 2:
        decision_style = "logical"
    elif emotional_hits >= logical_hits + 2:
        decision_style = "emotional"
    else:
        decision_style = "mixed"

    tone_style = "formal_polite"
    if "short" in tokens or "direct" in tokens:
        tone_style = "short_direct"
    elif "warm" in tokens or "kind" in tokens:
        tone_style = "warm"

    approval_speed = 7 if fast_hits > slow_hits else 4 if slow_hits >= fast_hits + 1 else 5
    profile = {
        "decision_style": decision_style,
        "risk_aversion": min(10, 4 + pushback_hits),
        "approval_speed": max(0, min(10, approval_speed)),
        "price_sensitivity": min(10, 4 + price_hits),
        "pushback_intensity": min(10, 3 + pushback_hits),
        "common_objections": [
            "Need more price detail before commitment",
            "Concern about timeline and workload",
            "Need stronger proof before saying yes",
        ],
        "approval_triggers": [
            "Clear plan with concrete next steps",
            "Visible long-term benefit and trust signals",
            "Alignment with previous commitments",
        ],
        "tone_style": tone_style,
        "rejection_patterns": [
            "Price and budget comparison appears high",
            "Fear of side effects or inconvenience is unresolved",
            "Concern appears repeatedly without concrete fallback",
        ],
    }

    evidence: list[str] = []
    for row in chunks[:8]:
        piece = _clip(row.chunk_text or "")
        if not piece:
            continue
        if piece not in evidence:
            evidence.append(piece)
        if len(evidence) >= 3:
            break
    if not evidence:
        evidence = ["No stable evidence extracted; context will be rebuilt on the next request."]

    confidence = max(0.35, min(0.9, 0.35 + (len(chunks) / 40.0)))
    return profile, evidence, round(confidence, 2)


def get_or_build_profile_cache(
    db: Session,
    *,
    room_id: str,
    contact_id: str | None,
    ttl_hours: int = PROFILE_CACHE_TTL_HOURS,
) -> dict[str, Any] | None:
    if not contact_id:
        return None

    now = _utcnow()
    cache_key = f"contact:{contact_id}:v1"
    cached = db.query(ProfileCache).filter(ProfileCache.cache_key == cache_key).one_or_none()
    cached_expiry = _ensure_aware(cached.expires_at) if cached else None
    if cached and cached_expiry and cached_expiry > now:
        return {
            "profile": cached.profile_payload or {},
            "evidence": cached.evidence_payload or [],
            "confidence": float((cached.profile_payload or {}).get("confidence", 0.5)),
            "cache_hit": True,
        }

    rows = (
        db.query(ContextChunk)
        .filter(
            or_(
                ContextChunk.contact_id == contact_id,
                ContextChunk.room_id == room_id,
            )
        )
        .order_by(ContextChunk.created_at.desc())
        .limit(160)
        .all()
    )

    profile, evidence, confidence = _build_profile(rows)
    profile["confidence"] = confidence

    if cached is None:
        cached = ProfileCache(
            contact_id=contact_id,
            cache_key=cache_key,
            profile_payload=profile,
            evidence_payload=evidence,
            expires_at=now + timedelta(hours=ttl_hours),
        )
        db.add(cached)
    else:
        cached.profile_payload = profile
        cached.evidence_payload = evidence
        cached.expires_at = now + timedelta(hours=ttl_hours)
        db.add(cached)

    db.commit()
    db.refresh(cached)
    return {
        "profile": cached.profile_payload or {},
        "evidence": cached.evidence_payload or [],
        "confidence": confidence,
        "cache_hit": False,
    }
