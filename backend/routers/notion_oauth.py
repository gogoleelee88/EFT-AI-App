from __future__ import annotations

from typing import Optional
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.database import get_db
from backend.models.user import User
from services.auth_service import AuthService
from services.user_notion_service import get_user_notion_service
from utils.logger import get_logger


router = APIRouter(prefix="/api/notion/oauth", tags=["notion-oauth"])
logger = get_logger(__name__)
auth_service = AuthService()


def get_current_user(
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> User:
    if not access_token:
        raise HTTPException(status_code=401, detail="로그인 세션이 유효하지 않습니다.")
    try:
        payload = auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="토큰 타입이 access 토큰이 아닙니다.")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="사용자 ID를 확인할 수 없습니다.")
        user = db.query(User).filter(User.id == user_id).one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="사용자를 찾을 수 없습니다.")
        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="토큰 인증에 실패했습니다.")


def _safe_next_path(value: Optional[str], *, default: str = "/dashboard") -> str:
    safe = (value or "").strip()
    if not safe.startswith("/") or safe.startswith("//"):
        return default
    return safe


@router.get("/authorize")
async def notion_authorize(next: Optional[str] = "/dashboard", user: User = Depends(get_current_user)):
    s = get_settings()
    if not (s.NOTION_CLIENT_ID and s.NOTION_REDIRECT_URI):
        raise HTTPException(
            status_code=500,
            detail="Notion OAuth 설정이 불완전합니다. NOTION_CLIENT_ID/NOTION_REDIRECT_URI가 필요합니다.",
        )

    safe_next = _safe_next_path(next, default="/dashboard")
    redirect_uri = (s.NOTION_REDIRECT_URI or "").strip()
    if not redirect_uri:
        raise HTTPException(status_code=500, detail="Notion OAuth redirect URI가 설정되지 않았습니다.")

    state = uuid4().hex
    authorize_url = (
        "https://api.notion.com/v1/oauth/authorize"
        f"?client_id={s.NOTION_CLIENT_ID}"
        "&response_type=code"
        "&owner=user"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&state={state}"
    )

    resp = RedirectResponse(url=authorize_url, status_code=302)
    resp.set_cookie(
        "notion_oauth_state",
        state,
        max_age=600,
        httponly=True,
        secure=s.COOKIE_SECURE,
        samesite=s.COOKIE_SAMESITE,
        domain=s.COOKIE_DOMAIN,
        path="/",
    )
    resp.set_cookie(
        "notion_oauth_next",
        safe_next,
        max_age=600,
        httponly=False,
        secure=s.COOKIE_SECURE,
        samesite=s.COOKIE_SAMESITE,
        domain=s.COOKIE_DOMAIN,
        path="/",
    )
    return resp


@router.get("/callback")
async def notion_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    stored_state: Optional[str] = Cookie(default=None, alias="notion_oauth_state"),
    next_path: Optional[str] = Cookie(default=None, alias="notion_oauth_next"),
):
    s = get_settings()
    if not code or not state:
        raise HTTPException(status_code=400, detail="code/state가 없습니다.")
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="state가 유효하지 않습니다.")

    try:
        notion_service = get_user_notion_service()
        token_payload = await notion_service.exchange_code_for_tokens(code)
        notion_service.store_tokens_for_user(db, user, token_payload)

        try:
            await notion_service.ensure_user_database(db, user)
        except Exception as db_err:
            logger.exception(f"[Notion OAuth] DB 생성 실패: {user.email} - {db_err}")
            raise HTTPException(
                status_code=500,
                detail="DB 생성 과정에서 오류가 발생했습니다.",
            )

        logger.info(f"[Notion OAuth] 사용자({user.email}) 인증 성공")
    except Exception as e:
        logger.exception(f"[Notion OAuth] 토큰 교환 실패: {e}")
        raise HTTPException(status_code=500, detail="Notion 토큰 교환 중 오류가 발생했습니다.")

    target = s.FRONTEND_DASHBOARD_URL or (s.FRONTEND_URL or "http://localhost:3000").rstrip("/") + "/dashboard"
    safe_next = _safe_next_path(next_path, default="/dashboard")
    if next_path and next_path != "/dashboard":
        if safe_next.startswith("/dashboard"):
            target = (s.FRONTEND_DASHBOARD_URL or s.FRONTEND_URL or "http://localhost:3000").rstrip("/") + safe_next
        else:
            target = (s.FRONTEND_DASHBOARD_URL or s.FRONTEND_URL or "http://localhost:3000").rstrip("/") + safe_next

    resp = RedirectResponse(url=target, status_code=302)
    resp.delete_cookie("notion_oauth_state", domain=s.COOKIE_DOMAIN, path="/")
    resp.delete_cookie("notion_oauth_next", domain=s.COOKIE_DOMAIN, path="/")
    return resp
