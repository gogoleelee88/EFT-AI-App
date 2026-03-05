from __future__ import annotations

import json
from typing import Any, Callable, Optional
from uuid import uuid4

from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.spec_loop.models.idempotency_key import IdempotencyKey


def idem_get_or_set(
    *,
    db: Session,
    user_id: str,
    scope: str,
    key: Optional[str],
    compute: Callable[[], Any],
):
    """
    Minimal idempotency guard for write endpoints.
    - key missing: compute and return
    - key exists: return cached response
    - key new: compute, persist response, and return
    """
    if not key:
        return compute()

    row = (
        db.query(IdempotencyKey)
        .filter(
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.scope == scope,
            IdempotencyKey.key == key,
        )
        .first()
    )
    if row is not None:
        try:
            return json.loads(row.response_json)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Invalid idempotency cache",
            ) from exc

    result = compute()
    payload = json.dumps(
        jsonable_encoder(result),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    row = IdempotencyKey(
        id=uuid4().hex,
        user_id=user_id,
        scope=scope,
        key=key,
        response_json=payload,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        row2 = (
            db.query(IdempotencyKey)
            .filter(
                IdempotencyKey.user_id == user_id,
                IdempotencyKey.scope == scope,
                IdempotencyKey.key == key,
            )
            .first()
        )
        if row2 is not None:
            return json.loads(row2.response_json)
        raise

    return result

