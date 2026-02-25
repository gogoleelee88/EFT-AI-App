"""
Firebase ID Token -> Backend verify -> JWT(httpOnly cookies) ë°ê¸
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response

logger = logging.getLogger(__name__)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.database import get_db
from services.auth_service import AuthService


router = APIRouter(prefix="/api/auth", tags=["auth"])
_auth_service: Optional[AuthService] = None


def _get_auth_service() -> AuthService:
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service


class LoginRequest(BaseModel):
  id_token: str = Field(..., description="Firebase ID Token")


class UserResponse(BaseModel):
  id: str
  email: str
  name: Optional[str] = None
  photo_url: Optional[str] = None


class LoginResponse(BaseModel):
  success: bool
  user: UserResponse


def _set_cookie(resp: Response, name: str, value: str, max_age: int) -> None:
    s = get_settings()
    # localhost?ì??domain ?ëµ (ë¸ë¼?°ì? ?¸í??
    domain = s.COOKIE_DOMAIN if s.COOKIE_DOMAIN and s.COOKIE_DOMAIN not in ("localhost", "") else None
    resp.set_cookie(
        key=name,
        value=value,
        max_age=max_age,
        httponly=True,
        secure=s.COOKIE_SECURE,
        samesite=s.COOKIE_SAMESITE,
        domain=domain,
        path="/",
    )


def _clear_cookie(resp: Response, name: str) -> None:
    s = get_settings()
    domain = s.COOKIE_DOMAIN if s.COOKIE_DOMAIN and s.COOKIE_DOMAIN not in ("localhost", "") else None
    resp.delete_cookie(key=name, domain=domain, path="/")


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, resp: Response, db: Session = Depends(get_db)):
    """
    ?ë¡?¸ì??Firebase signInWithPopup -> getIdToken() ë°ì? ??
    ê·?ID Token??ë³´ë´ë©?ë°±ì?ê? ê²ì¦íê³??ë¹??JWT ì¿í¤ë¥??¸í?©ë??
    """
    try:
        svc = _get_auth_service()
        decoded = svc.verify_firebase_id_token(req.id_token)
        user = svc.upsert_user_from_firebase(db, decoded)
        pair = svc.mint_token_pair(user.id)
        svc.persist_refresh_token(db, user.id, pair.refresh_token, pair.refresh_expires_at)

        access_max_age = int((pair.access_expires_at - datetime.now(timezone.utc)).total_seconds())
        refresh_max_age = int((pair.refresh_expires_at - datetime.now(timezone.utc)).total_seconds())

        s = get_settings()
        _set_cookie(resp, s.COOKIE_NAME_ACCESS, pair.access_token, max_age=access_max_age)
        _set_cookie(resp, s.COOKIE_NAME_REFRESH, pair.refresh_token, max_age=refresh_max_age)

        return LoginResponse(
            success=True,
            user=UserResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                photo_url=user.photo_url,
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("auth/login error: %s", e, exc_info=True)
        raise HTTPException(status_code=401, detail=str(e))


class MeResponse(BaseModel):
  authenticated: bool
  user: Optional[UserResponse] = None


@router.get("/ping")
async def auth_ping():
    """ì§ë¨?? DB/Firebase ?ì´ 200 ë°í."""
    return {"ok": True, "service": "auth"}


@router.get("/me", response_model=MeResponse)
async def me(request: Request):
    """
    (?ë¡?¸ì©) ?ì¬ ì¿í¤ ê¸°ë° ?¸ì ?ì¸.
    ì¿í¤ ?ì¼ë©?DB ?ê·¼ ?ì´ ì¦ì ë°í.
    """
    token = request.cookies.get("access_token")
    if not token:
        return MeResponse(authenticated=False, user=None)
    try:
        from backend.database import get_db
        payload = _get_auth_service().decode_jwt(token)
        if payload.get("type") != "access":
            return MeResponse(authenticated=False, user=None)
        user_id = payload.get("sub")
        if not user_id:
            return MeResponse(authenticated=False, user=None)
        from backend.models.user import User
        db_gen = get_db()
        db = next(db_gen)
        try:
            user = db.query(User).filter(User.id == user_id).one_or_none()
            if user is None:
                return MeResponse(authenticated=False, user=None)
            return MeResponse(
                authenticated=True,
                user=UserResponse(id=user.id, email=user.email, name=user.name, photo_url=user.photo_url),
            )
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass
    except Exception as e:
        logger.warning("auth/me decode or DB error: %s", e, exc_info=True)
        return MeResponse(authenticated=False, user=None)


class RefreshResponse(BaseModel):
  success: bool


class UpdateProfileRequest(BaseModel):
  name: str = Field(..., min_length=1, max_length=100, description="?ì ?´ë¦")


@router.post("/profile", response_model=UserResponse)
async def update_profile(
    req: UpdateProfileRequest,
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None, alias="access_token")
):
    """
    ?ì¬ ë¡ê·¸?¸í ?¬ì©?ì ?ì ?´ë¦(name)???ë°?´í¸.
    """
    if not access_token:
        raise HTTPException(status_code=401, detail="ë¡ê·¸?¸ì´ ?ì?©ë??")
    try:
        payload = _get_auth_service().decode_jwt(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="?ëª»???í° ?í?ë??")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="?í°???¬ì©???ë³´ê° ?ìµ?ë¤.")

        from backend.models.user import User
        user = db.query(User).filter(User.id == user_id).one_or_none()
        if user is None:
            raise HTTPException(status_code=404, detail="?¬ì©?ë? ì°¾ì ???ìµ?ë¤.")

        user.name = req.name
        db.add(user)
        db.commit()
        db.refresh(user)

        return UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            photo_url=user.photo_url,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    resp: Response,
    db: Session = Depends(get_db),
    refresh_token: Optional[str] = Cookie(default=None, alias="refresh_token")
):
    """
    refresh ì¿í¤ë¡?access ?í° ?¬ë°ê¸?
    (?ì¬??ì¿í¤ ?ì± ?ìë¡??ì¥ ?ì)
    """
    if not refresh_token:
        return RefreshResponse(success=False)
    try:
        svc = _get_auth_service()
        user_id = svc.validate_refresh_token(db, refresh_token)
        pair = svc.mint_token_pair(user_id)
        svc.persist_refresh_token(db, user_id, pair.refresh_token, pair.refresh_expires_at)
        # ê¸°ì¡´ refresh ?í°? ?ê¸°(?ì)
        svc.revoke_refresh_token(db, refresh_token)

        s = get_settings()
        access_max_age = int((pair.access_expires_at - datetime.now(timezone.utc)).total_seconds())
        refresh_max_age = int((pair.refresh_expires_at - datetime.now(timezone.utc)).total_seconds())

        _set_cookie(resp, s.COOKIE_NAME_ACCESS, pair.access_token, max_age=access_max_age)
        _set_cookie(resp, s.COOKIE_NAME_REFRESH, pair.refresh_token, max_age=refresh_max_age)
        return RefreshResponse(success=True)
    except Exception:
        return RefreshResponse(success=False)


@router.post("/logout")
async def logout(resp: Response, db: Session = Depends(get_db), refresh_token: Optional[str] = Cookie(default=None, alias="refresh_token")):
    s = get_settings()
    if refresh_token:
        try:
            _get_auth_service().revoke_refresh_token(db, refresh_token)
        except Exception:
            pass
    _clear_cookie(resp, s.COOKIE_NAME_ACCESS)
    _clear_cookie(resp, s.COOKIE_NAME_REFRESH)
    return {"success": True}




