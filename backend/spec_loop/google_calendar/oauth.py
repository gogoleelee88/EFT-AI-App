from __future__ import annotations

import os
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


