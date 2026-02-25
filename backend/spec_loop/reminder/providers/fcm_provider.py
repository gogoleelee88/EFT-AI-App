from __future__ import annotations

import base64
import json
import os
from typing import Any, Optional

from config.settings import get_settings
from backend.spec_loop.models import PushSubscription


class FCMProvider:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._app = None

    def _init_app(self):
        if self._app is not None:
            return self._app

        if not self.settings.ENABLE_FCM_PUSH:
            return None

        try:
            import firebase_admin  # type: ignore
            from firebase_admin import credentials  # type: ignore
        except Exception:
            return None

        if firebase_admin._apps:
            self._app = firebase_admin.get_app()
            return self._app

        cred_json = (self.settings.FIREBASE_CREDENTIALS_JSON or os.getenv("FIREBASE_CREDENTIALS_JSON") or "").strip()
        if not cred_json:
            return None

        decoded = cred_json
        try:
            decoded = base64.b64decode(cred_json).decode("utf-8")
        except Exception:
            pass

        try:
            info = json.loads(decoded)
            self._app = firebase_admin.initialize_app(credentials.Certificate(info))
            return self._app
        except Exception:
            return None

    def send(self, subscription: PushSubscription, payload: dict[str, Any]) -> tuple[bool, str | None, str | None]:
        token = (subscription.device_token or "").strip()
        if not token:
            return False, "FCM_TOKEN_MISSING", "device_token is empty"

        app = self._init_app()
        if app is None:
            return False, "FCM_NOT_CONFIGURED", "firebase admin is not configured"

        try:
            from firebase_admin import messaging  # type: ignore
        except Exception as exc:
            return False, "FCM_LIBRARY_MISSING", str(exc)

        data = {k: str(v) for k, v in payload.items()}
        title = payload.get("title")
        body = payload.get("body")

        message = messaging.Message(
            token=token,
            data=data,
            notification=messaging.Notification(
                title=str(title) if title is not None else None,
                body=str(body) if body is not None else None,
            ),
        )

        try:
            provider_message_id = messaging.send(message, app=app)
            return True, None, provider_message_id
        except Exception as exc:
            return False, "FCM_SEND_FAILED", str(exc)


