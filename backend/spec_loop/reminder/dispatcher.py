from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.spec_loop.models import ReminderJob
from backend.spec_loop.reminder import repository
from backend.spec_loop.reminder.providers import FCMProvider, WebPushProvider


@dataclass
class DispatchResult:
    status: str  # sent | failed | suppressed
    sent_count: int = 0
    provider_message_id: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None


class ReminderDispatcher:
    def __init__(self) -> None:
        self.webpush_provider = WebPushProvider()
        self.fcm_provider = FCMProvider()

    def send(self, db: Session, job: ReminderJob, payload: dict[str, Any]) -> DispatchResult:
        channel = (job.channel or "").strip().lower()
        if channel not in {"webpush", "fcm"}:
            return DispatchResult(status="failed", error_code="CHANNEL_NOT_SUPPORTED")

        targets = repository.get_enabled_subscriptions(db, user_id=job.user_id, channel=channel)
        if not targets:
            return DispatchResult(
                status="suppressed",
                sent_count=0,
                error_code="NO_SUBSCRIPTIONS",
                error_message="No enabled subscription for channel",
            )

        sent_count = 0
        provider_message_id: Optional[str] = None
        last_error_code: Optional[str] = None
        last_error_message: Optional[str] = None

        for target in targets:
            if channel == "webpush":
                ok, code, message = self.webpush_provider.send(target, payload)
                provider_id = None
            else:
                ok, code, provider_id = self.fcm_provider.send(target, payload)
                message = None if ok else provider_id

            if ok:
                sent_count += 1
                if provider_id:
                    provider_message_id = provider_id
                continue

            last_error_code = code
            last_error_message = message
            if code in {"WEBPUSH_404", "WEBPUSH_410"} and target.endpoint:
                repository.disable_web_subscription(db, endpoint=target.endpoint)
            if code in {"FCM_TOKEN_INVALID", "FCM_REGISTRATION_TOKEN_NOT_REGISTERED"} and target.device_token:
                repository.disable_device_token(db, device_token=target.device_token)

        if sent_count > 0:
            return DispatchResult(status="sent", sent_count=sent_count, provider_message_id=provider_message_id)
        return DispatchResult(
            status="failed",
            sent_count=0,
            error_code=last_error_code or "SEND_FAILED",
            error_message=last_error_message,
        )


