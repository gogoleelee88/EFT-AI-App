from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from config.settings import get_settings


@dataclass
class PushResult:
    ok: bool
    provider: str
    message_id: str | None = None
    error: str | None = None


def send_push_notification(
    *,
    channel: str,
    platform: str,
    push_token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> PushResult:
    """
    Production adapter:
    - push/webpush/apns channels are dispatched through Firebase Admin when available.
    - email channel is currently unsupported in this module.
    """
    if channel == "email":
        return PushResult(ok=False, provider="none", error="EMAIL_CHANNEL_NOT_SUPPORTED")

    try:
        import firebase_admin
        from firebase_admin import messaging
    except Exception:
        return PushResult(ok=False, provider="firebase", error="FIREBASE_ADMIN_IMPORT_FAILED")

    if not firebase_admin._apps:
        return PushResult(ok=False, provider="firebase", error="FIREBASE_ADMIN_NOT_INITIALIZED")

    settings = get_settings()
    dry_run = str(getattr(settings, "DEBUG", False)).lower() == "true"

    try:
        message = messaging.Message(
            token=push_token,
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
        )
        message_id = messaging.send(message, dry_run=dry_run)
        return PushResult(ok=True, provider="firebase", message_id=message_id)
    except Exception as exc:
        return PushResult(ok=False, provider="firebase", error=str(exc))


