from __future__ import annotations

import secrets
import time
from datetime import datetime, timezone
from typing import Dict, TypedDict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.services.auth_helpers import get_current_user_id
from backend.database import get_db
from services.auth_service import AuthService
from sqlalchemy.orm import Session


router = APIRouter(tags=["pairing"], prefix="/api/pairing")

PAIRING_TTL_SECONDS = 300  # 5 minutes


class _PairingItem(TypedDict):
    user_id: str
    exp: int


# Minimal in-memory store.
# Codes disappear on process restart and are not shared across instances.
_STORE: Dict[str, _PairingItem] = {}


def _now_ts() -> int:
    return int(time.time())


def _cleanup_expired() -> None:
    now = _now_ts()
    expired = [k for k, v in _STORE.items() if v["exp"] <= now]
    for k in expired:
        _STORE.pop(k, None)


def _new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


class CreateCodeResponse(BaseModel):
    code: str
    expires_at: str
    qr_payload: str


@router.post("/code", response_model=CreateCodeResponse)
def create_pairing_code(current_user_id: str = Depends(get_current_user_id)) -> CreateCodeResponse:
    _cleanup_expired()

    for _ in range(20):
        code = _new_code()
        if code not in _STORE:
            break
    else:
        raise HTTPException(status_code=503, detail="Could not allocate pairing code")

    exp = _now_ts() + PAIRING_TTL_SECONDS
    _STORE[code] = {"user_id": current_user_id, "exp": exp}

    expires_at = datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
    qr_payload = f"EFTAI_PAIR:{code}"
    return CreateCodeResponse(code=code, expires_at=expires_at, qr_payload=qr_payload)


class ClaimRequest(BaseModel):
    code: str


class ClaimResponse(BaseModel):
    user_id: str
    access_token: str
    refresh_token: str
    access_expires_at: str
    refresh_expires_at: str


@router.post("/claim", response_model=ClaimResponse)
def claim_pairing(req: ClaimRequest, db: Session = Depends(get_db)) -> ClaimResponse:
    _cleanup_expired()
    code = (req.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    item = _STORE.get(code)
    if not item:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    _STORE.pop(code, None)  # one-time use
    auth_service = AuthService()
    pair = auth_service.mint_token_pair(item["user_id"])
    auth_service.persist_refresh_token(
        db=db,
        user_id=item["user_id"],
        refresh_jwt=pair.refresh_token,
        refresh_expires_at=pair.refresh_expires_at,
    )
    return ClaimResponse(
        user_id=item["user_id"],
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        access_expires_at=pair.access_expires_at.isoformat(),
        refresh_expires_at=pair.refresh_expires_at.isoformat(),
    )
