from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.models.user import User
from services.encryption_service import get_encryption_service
from utils.logger import get_logger


logger = get_logger(__name__)


class UserNotionService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.enc = get_encryption_service()

    async def exchange_code_for_tokens(self, code: str) -> Dict[str, Any]:
        """Exchange Notion authorization code for access/refresh tokens."""
        if not (
            self.settings.NOTION_CLIENT_ID
            and self.settings.NOTION_CLIENT_SECRET
            and self.settings.NOTION_REDIRECT_URI
        ):
            raise RuntimeError("Notion OAuth envs are not configured (NOTION_CLIENT_ID/SECRET/REDIRECT_URI)")

        token_url = f"{self.settings.NOTION_OAUTH_BASE_URL}/token"
        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.settings.NOTION_REDIRECT_URI,
        }
        auth = (self.settings.NOTION_CLIENT_ID, self.settings.NOTION_CLIENT_SECRET)

        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(token_url, auth=auth, json=payload)

        if r.status_code != 200:
            try:
                body = r.json()
            except Exception:
                body = {"raw": r.text}

            logger.error(
                "[Notion OAuth] Token exchange failed: HTTP %s - %s",
                r.status_code,
                body,
            )
            raise RuntimeError(f"Notion token error (HTTP {r.status_code}): {body}")

        return r.json()

    def store_tokens_for_user(self, db: Session, user: User, token_payload: Dict[str, Any]) -> None:
        """Store OAuth tokens and metadata on User."""
        access_token = token_payload.get("access_token")
        refresh_token = token_payload.get("refresh_token")
        workspace_id = token_payload.get("workspace_id")
        expires_in = token_payload.get("expires_in") or 3600

        if not access_token:
            raise ValueError("Notion access_token is required.")

        enc_access = self.enc.encrypt_to_base64(access_token)
        enc_refresh = self.enc.encrypt_to_base64(refresh_token) if refresh_token else None

        user.notion_access_token = enc_access
        user.notion_refresh_token = enc_refresh
        user.notion_workspace_id = workspace_id or user.notion_workspace_id
        user.notion_connected_at = datetime.now(timezone.utc)
        user.notion_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

        db.add(user)
        db.commit()
        db.refresh(user)

    def get_decrypted_access_token(self, user: User) -> str:
        if not user.notion_access_token:
            raise RuntimeError("Notion access_token not found for this user.")
        return self.enc.decrypt_from_base64(user.notion_access_token)

    async def ensure_user_database(self, db: Session, user: User) -> str:
        """
        Ensure user-specific Notion DB exists and return its id.
        If already created, reuse existing DB ID stored on user.
        """
        if user.notion_database_id:
            return user.notion_database_id

        access_token = self.get_decrypted_access_token(user)

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Notion-Version": self.settings.NOTION_API_VERSION,
        }

        db_title = self.settings.NOTION_USER_DB_NAME or "MoodTalk Notion Database"

        payload: Dict[str, Any] = {
            "parent": {"type": "workspace", "workspace": True},
            "title": [
                {
                    "type": "text",
                    "text": {"content": db_title},
                }
            ],
            "properties": {
                "Name": {"title": {}},
                "Created": {"date": {}},
                "Core Emotion": {"rich_text": {}},
                "Situation Context": {"rich_text": {}},
                "Automatic Thought": {"rich_text": {}},
                "Physical Sensation": {"rich_text": {}},
                "Behavioral Reaction": {"rich_text": {}},
                "Available Time": {"number": {}},
                "Immediate Goal": {"rich_text": {}},
                "Intensity Before": {"number": {}},
                "Intensity After": {"number": {}},
                "Intensity Delta": {"number": {}},
                "AI Solution": {"rich_text": {}},
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.settings.NOTION_API_BASE_URL}/databases",
                    json=payload,
                    headers=headers,
                )

            if resp.status_code != 200:
                logger.error(
                    "[Notion OAuth] Notion DB create failed: %s - %s",
                    resp.status_code,
                    resp.text[:500],
                )
                raise RuntimeError(f"Notion DB create failed (HTTP {resp.status_code})")

            data = resp.json()
            db_id = data.get("id")
            if not db_id:
                raise RuntimeError("Notion DB response missing id.")

            user.notion_database_id = db_id
            db.add(user)
            db.commit()
            db.refresh(user)

            logger.info("[Notion OAuth] notion database created for %s: %s", user.email, db_id)
            return db_id

        except Exception as e:
            logger.exception("[Notion OAuth] Error while creating notion database: %s", e)
            raise


_svc: Optional[UserNotionService] = None


def get_user_notion_service() -> UserNotionService:
    global _svc
    if _svc is None:
        _svc = UserNotionService()
    return _svc
