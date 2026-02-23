"""
?ì ?ë¡?ì¼ / ?¤ë???ì½ API (?µì°° ??ë³´???°ë)
- GET /api/profile/me: ?ì ?ë¡?ì¼ (ê°ìÂ·?ëÂ·?µê?Â·ê³ë?Â·ë°©í´?ì)
- GET /api/profile/me/daily: ?¼ë³ ?ì½ (?ì§ ì¿¼ë¦¬)
resume-os ?ë ???´ë²¤???ê¸°?????¤ì ?°ì´??ì±ì?. ?ì¬??ë¹?êµ¬ì¡° ë°í.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException

from config.settings import get_settings
from services.auth_service import AuthService

router = APIRouter(prefix="/api/profile", tags=["profile"])
auth_service = AuthService()


def _get_current_user_id(access_token: Optional[str] = Cookie(default=None, alias="access_token")) -> str:
    if not access_token:
        raise HTTPException(status_code=401, detail="ë¡ê·¸?¸ì´ ?ì?©ë??")
    try:
        payload = auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="?ëª»???í° ?í?ë??")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="?í°???¬ì©???ë³´ê° ?ìµ?ë¤.")
        return user_id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="?¸ì¦???¤í¨?ìµ?ë¤.")


@router.get("/me")
async def get_my_profile(user_id: str = Depends(_get_current_user_id)):
    """
    ?ì¬ ë¡ê·¸?¸í ?¬ì©?ì ?ì ?ë¡?ì¼.
    ì¶í user_profile ?ì´ë¸??ë Firebase ?°ë ???¤ì ?°ì´??ë°í.
    """
    return {
        "user_id": user_id,
        "dominant_moods": [],
        "preferred_tone": None,
        "top_concerns": [],
        "blockers": [],
        "updated_at": None,
    }


@router.get("/me/daily")
async def get_my_daily_profile(
    date_str: Optional[str] = None,
    user_id: str = Depends(_get_current_user_id),
):
    """
    ?ì¬ ë¡ê·¸?¸í ?¬ì©?ì ?¼ë³ ?ì½.
    date_str: YYYY-MM-DD (ë¯¸ì??????¤ë)
    """
    today = date.today().isoformat()
    target = date_str if date_str else today
    return {
        "date": target,
        "focus_minutes": None,
        "idle_minutes": None,
        "stuck_minutes": None,
        "mood_avg": None,
        "activities": [],
    }

