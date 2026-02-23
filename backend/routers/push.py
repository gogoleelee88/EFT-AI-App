from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from config.settings import get_settings
from backend.database import get_db
from backend.spec_loop.reminder import repository
from utils.logger import get_logger

router = APIRouter(prefix="/api/push", tags=["push"])
logger = get_logger(__name__)

_PUSH_EVENT_COUNTS: dict[str, int] = {}


def _tick_metric(event_type: str) -> None:
    key = (event_type or "unknown").strip().lower() or "unknown"
    _PUSH_EVENT_COUNTS[key] = _PUSH_EVENT_COUNTS.get(key, 0) + 1


def _resolve_vapid_public_key() -> str:
    settings = get_settings()
    key = (settings.WEBPUSH_VAPID_PUBLIC_KEY or "").strip()
    if key:
        return key

    key = (os.getenv("WEBPUSH_VAPID_PUBLIC_KEY") or "").strip()
    if key:
        return key

    # Runtime fallback for long-lived dev servers that were started before .env update.
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
        key = (os.getenv("WEBPUSH_VAPID_PUBLIC_KEY") or "").strip()

    return key


@router.post("/subscribe")
async def subscribe_push(
    payload: dict[str, Any],
    request: Request,
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    endpoint = str(payload.get("endpoint") or "").strip()
    keys = payload.get("keys") if isinstance(payload.get("keys"), dict) else {}
    p256dh = str(keys.get("p256dh") or "").strip()
    auth = str(keys.get("auth") or "").strip()
    resolved_user_id = str(payload.get("user_id") or user_id or "").strip() or None

    if not endpoint or not p256dh or not auth:
        return {"ok": False, "error": "endpoint/keys are required"}

    row = repository.upsert_web_subscription(
        db,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_id=resolved_user_id,
        user_agent=request.headers.get("user-agent"),
    )
    _tick_metric("subscribe")
    return {"ok": True, "subscription_id": row.subscription_id}


@router.post("/unsubscribe")
async def unsubscribe_push(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):
    endpoint = str(payload.get("endpoint") or "").strip()
    if not endpoint:
        return {"ok": False, "error": "endpoint is required"}
    ok = repository.disable_web_subscription(db, endpoint=endpoint)
    _tick_metric("unsubscribe")
    return {"ok": ok}


@router.post("/register-device")
async def register_mobile_device(
    payload: dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
):
    token = str(payload.get("token") or payload.get("device_token") or "").strip()
    if not token:
        return {"ok": False, "error": "token is required"}

    platform = str(payload.get("platform") or "android").strip().lower()
    if platform not in {"android", "ios"}:
        platform = "android"

    row = repository.upsert_device_token(
        db,
        user_id=str(payload.get("user_id") or "").strip() or None,
        device_token=token,
        platform=platform,
        device_id=str(payload.get("device_id") or "").strip() or None,
        user_agent=request.headers.get("user-agent"),
    )
    _tick_metric("register_device")
    return {"ok": True, "subscription_id": row.subscription_id}


@router.post("/metrics")
async def push_metrics(
    payload: dict[str, Any],
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    event_type = str(payload.get("type") or "unknown")
    _tick_metric(event_type)
    counts = repository.metrics_counts(db, user_id=user_id)
    logger.info(
        "push.metrics type=%s payload=%s counts=%s",
        event_type,
        payload,
        counts,
    )
    return {
        "ok": True,
        "server_time": datetime.now(timezone.utc).isoformat(),
        "event_counts": _PUSH_EVENT_COUNTS,
        "subscription_counts": counts,
    }


@router.get("/metrics")
def get_push_metrics(
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return {
        "ok": True,
        "event_counts": _PUSH_EVENT_COUNTS,
        "subscription_counts": repository.metrics_counts(db, user_id=user_id),
    }


@router.get("/vapid-public-key")
def get_vapid_public_key():
    public_key = _resolve_vapid_public_key()
    if not public_key:
        return {
            "ok": False,
            "error": "WEBPUSH_VAPID_PUBLIC_KEY is not configured",
            "public_key": "",
        }
    return {
        "ok": True,
        "public_key": public_key,
    }

