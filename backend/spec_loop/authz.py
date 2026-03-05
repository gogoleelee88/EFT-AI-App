from __future__ import annotations

from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.services.auth_helpers import get_current_user
from backend.database import get_db


def _extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, token = parts[0].strip(), parts[1].strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def get_current_user_spec(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
):
    """
    SPEC auth for both clients:
    - Web: access_token cookie
    - Mobile: Authorization: Bearer <token>
    """
    bearer = _extract_bearer_token(authorization)
    token = bearer or access_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return get_current_user(db=db, access_token=token)


def get_current_user_id_spec(
    user=Depends(get_current_user_spec),
) -> str:
    user_id = getattr(user, "id", None) or getattr(user, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")
    return str(user_id)

