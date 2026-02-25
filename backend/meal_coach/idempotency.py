from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.meal_coach.models import IdempotencyKey


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def request_hash(payload: Any) -> str:
    normalized = json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def get_cached_response(
    db: Session,
    *,
    tenant_id: str,
    method: str,
    path: str,
    idem_key: str,
    req_hash: str,
) -> tuple[int, dict[str, Any]] | None:
    row = (
        db.query(IdempotencyKey)
        .filter(
            IdempotencyKey.tenant_id == tenant_id,
            IdempotencyKey.method == method,
            IdempotencyKey.path == path,
            IdempotencyKey.idempotency_key == idem_key,
        )
        .one_or_none()
    )
    if row is None:
        return None
    expires_at = _to_aware_utc(row.expires_at)
    if expires_at < _utcnow():
        return None
    if row.request_hash != req_hash:
        raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
    return int(row.status_code), dict(row.response_body)


def save_response(
    db: Session,
    *,
    tenant_id: str,
    method: str,
    path: str,
    idem_key: str,
    req_hash: str,
    status_code: int,
    response_body: dict[str, Any],
) -> None:
    expires_at = _utcnow() + timedelta(hours=48)
    row = IdempotencyKey(
        tenant_id=tenant_id,
        method=method.upper(),
        path=path,
        idempotency_key=idem_key,
        request_hash=req_hash,
        status_code=status_code,
        response_body=response_body,
        expires_at=expires_at,
    )
    db.add(row)
    db.commit()

