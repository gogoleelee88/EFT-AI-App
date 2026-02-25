from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from config.settings import get_settings
from backend.spec_loop.models import PushSubscription


class WebPushProvider:
    def __init__(self) -> None:
        self.settings = get_settings()

    def send(self, subscription: PushSubscription, payload: dict[str, Any]) -> tuple[bool, str | None, str | None]:
        public_key = (self.settings.WEBPUSH_VAPID_PUBLIC_KEY or "").strip()
        private_key = (self.settings.WEBPUSH_VAPID_PRIVATE_KEY or "").strip()
        subject = (self.settings.WEBPUSH_VAPID_CLAIMS_SUB or "").strip()

        if not public_key or not private_key or not subject:
            public_key = public_key or (os.getenv("WEBPUSH_VAPID_PUBLIC_KEY") or "").strip()
            private_key = private_key or (os.getenv("WEBPUSH_VAPID_PRIVATE_KEY") or "").strip()
            subject = subject or (os.getenv("WEBPUSH_VAPID_CLAIMS_SUB") or "").strip()

        if not public_key or not private_key or not subject:
            env_path = Path(__file__).resolve().parents[3] / ".env"
            if env_path.exists():
                load_dotenv(dotenv_path=env_path, override=False)
                public_key = public_key or (os.getenv("WEBPUSH_VAPID_PUBLIC_KEY") or "").strip()
                private_key = private_key or (os.getenv("WEBPUSH_VAPID_PRIVATE_KEY") or "").strip()
                subject = subject or (os.getenv("WEBPUSH_VAPID_CLAIMS_SUB") or "").strip()

        if not public_key or not private_key or not subject:
            return False, "WEBPUSH_CONFIG_MISSING", "Missing VAPID settings"

        if not subscription.endpoint or not subscription.p256dh or not subscription.auth:
            return False, "WEBPUSH_SUBSCRIPTION_INVALID", "Missing endpoint/keys"

        try:
            from pywebpush import WebPushException, webpush  # type: ignore
        except Exception as exc:
            return False, "WEBPUSH_LIBRARY_MISSING", str(exc)

        data = json.dumps(payload, ensure_ascii=False)
        try:
            response = webpush(
                subscription_info={
                    "endpoint": subscription.endpoint,
                    "keys": {
                        "p256dh": subscription.p256dh,
                        "auth": subscription.auth,
                    },
                },
                data=data,
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
            )
            status = getattr(response, "status_code", None)
            if status and int(status) >= 400:
                return False, f"WEBPUSH_{status}", f"status={status}"
            return True, None, None
        except WebPushException as exc:
            code = "WEBPUSH_ERROR"
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code:
                code = f"WEBPUSH_{status_code}"
            return False, code, str(exc)
        except Exception as exc:
            return False, "WEBPUSH_ERROR", str(exc)

