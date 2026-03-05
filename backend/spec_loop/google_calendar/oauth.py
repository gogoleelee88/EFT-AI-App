from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from google_auth_oauthlib.flow import Flow

from backend.database import SessionLocal
from config.settings import get_settings
from backend.spec_loop.google_calendar.models import GoogleToken

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
]


GOOGLE_CALLBACK_PATH = "/api/spec/google/callback"


def _resolve_redirect_uris(override_redirect_uri: Optional[str] = None) -> list[str]:
    settings = get_settings()
    configured = list(settings.GOOGLE_REDIRECT_URIS or [])

    if settings.GOOGLE_REDIRECT_URI:
        configured.append(settings.GOOGLE_REDIRECT_URI)
    if override_redirect_uri:
        configured.append(override_redirect_uri)

    backend_base = (settings.BACKEND_BASE_URL or "").strip().rstrip("/")
    if backend_base:
        configured.append(f"{backend_base}{GOOGLE_CALLBACK_PATH}")

    deduped: list[str] = []
    for value in configured:
        normalized = (value or "").strip().rstrip("/")
        if normalized and normalized not in deduped:
            deduped.append(normalized)

    return deduped


def _normalize_redirect_uri(redirect_uri: Optional[str]) -> Optional[str]:
    if not redirect_uri:
        return None
    resolved = redirect_uri.strip()
    if not resolved:
        return None
    return resolved.rstrip("/")


def _pick_redirect_uri(override_redirect_uri: Optional[str] = None) -> str:
    candidates = _resolve_redirect_uris(override_redirect_uri=override_redirect_uri)
    normalized_override = _normalize_redirect_uri(override_redirect_uri)
    if normalized_override:
        if normalized_override in candidates:
            return normalized_override
    if candidates:
        return candidates[0]

    raise RuntimeError(
        "Google OAuth redirect URI missing. Set GOOGLE_REDIRECT_URI, "
        "GOOGLE_REDIRECT_URIS, or BACKEND_BASE_URL in env."
    )


def _build_client_config(redirect_uri: str) -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not (client_id and client_secret):
        raise RuntimeError("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI are required")

    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": [redirect_uri],
            "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }


def get_auth_url(state: Optional[str] = None, redirect_uri: Optional[str] = None) -> str:
    redirect = _pick_redirect_uri(override_redirect_uri=redirect_uri)
    client_config = _build_client_config(redirect)
    flow = Flow.from_client_config(client_config, scopes=GOOGLE_SCOPES)
    flow.redirect_uri = redirect
    auth_url, _ = flow.authorization_url(
        prompt="consent",
        access_type="offline",
        include_granted_scopes="true",
        state=state,
    )
    return auth_url


def build_auth_url(
    *,
    user_id: str,
    next_path: str,
    redirect_uri_override: Optional[str] = None,
) -> str:
    safe_next = (next_path or "").strip()
    if safe_next and not safe_next.startswith("/"):
        safe_next = ""
    state = user_id if not safe_next else f"{user_id}|{safe_next}"
    return get_auth_url(state=state, redirect_uri=redirect_uri_override)


def handle_callback(code: str, user_id: str, redirect_uri: Optional[str] = None) -> None:
    redirect = _pick_redirect_uri(override_redirect_uri=redirect_uri)
    client_config = _build_client_config(redirect)
    flow = Flow.from_client_config(client_config, scopes=GOOGLE_SCOPES)
    flow.redirect_uri = redirect

    try:
        flow.fetch_token(code=code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Google OAuth failed: {exc}") from exc

    token_json = flow.credentials.to_json()

    db = SessionLocal()
    try:
        row = db.query(GoogleToken).filter(GoogleToken.user_id == user_id).first()
        if row:
            row.token_json = token_json
        else:
            row = GoogleToken(user_id=user_id, token_json=token_json)
            db.add(row)
        db.commit()
    finally:
        db.close()


def get_connection_state(db, user_id: str) -> dict[str, object]:
    row = db.query(GoogleToken).filter(GoogleToken.user_id == user_id).first()
    if row is None or not row.token_json:
        return {"connected": False, "status": "missing"}

    try:
        token = json.loads(row.token_json)
    except Exception:
        return {"connected": False, "status": "reconnect_required"}

    expires_at = token.get("expires_at")
    expiry = token.get("expiry")
    if isinstance(expires_at, (int, float)):
        if float(expires_at) <= datetime.now(timezone.utc).timestamp():
            return {"connected": False, "status": "expired"}
    elif isinstance(expiry, str):
        try:
            parsed = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            if parsed.astimezone(timezone.utc) <= datetime.now(timezone.utc):
                return {"connected": False, "status": "expired"}
        except Exception:
            pass

    revoked = token.get("revoked")
    if isinstance(revoked, bool) and revoked:
        return {"connected": False, "status": "revoked"}

    return {"connected": True, "status": "connected"}

