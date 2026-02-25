from __future__ import annotations

from http.cookies import SimpleCookie
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, WebSocket
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.user import User
from services.auth_service import AuthService


_auth_service = AuthService()


def _decode_access_token(access_token: str) -> str:
    try:
        payload = _auth_service.decode_jwt(access_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid access token") from exc

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user_id = payload.get("sub")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return user_id


def get_current_user(
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> User:
    if not access_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    user_id = _decode_access_token(access_token)
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_user_id(
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> str:
    _ = db  # keeps dependency signature consistent for routers
    if not access_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    return _decode_access_token(access_token)


def get_current_user_from_websocket(websocket: WebSocket, db: Session) -> User:
    token = websocket.query_params.get("auth")
    if not token:
        raw_cookie = websocket.headers.get("cookie") or ""
        cookie = SimpleCookie()
        cookie.load(raw_cookie)
        morsel = cookie.get("access_token")
        token = morsel.value if morsel else None

    if not token:
        raise HTTPException(status_code=403, detail="Authentication required")

    user_id = _decode_access_token(token)
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if user is None:
        raise HTTPException(status_code=403, detail="User not found")
    return user



