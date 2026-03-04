from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha1
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.reminder import repository
from backend.spec_loop.reminder.schedule import next_fire_at_utc

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _fire_sort_key(dt: Optional[datetime]) -> datetime:
    if dt is not None:
        return dt
    return datetime.max.replace(tzinfo=timezone.utc)


def _effective_next_fire(job, *, now_utc: datetime) -> Optional[datetime]:
    """Return a future next_fire_at_utc even when stored value is stale/past."""
    if job.next_fire_at_utc is not None and job.next_fire_at_utc > now_utc:
        return job.next_fire_at_utc
    return next_fire_at_utc(
        alarm_time_local=job.alarm_time_local,
        repeat_rule=job.repeat_rule,
        custom_days=job.custom_days or [],
        timezone_name=job.timezone,
        now_utc=now_utc,
        anchor_date=job.plan_date,
    )


def _normalize_mission_type(value: Optional[str]) -> str:
    raw = (value or "").strip().lower()
    if raw == "location_arrival":
        return "location_arrival"
    return "manual_dismiss"


def _normalize_source_type(value: Optional[str]) -> str:
    raw = (value or "").strip().lower()
    if raw == "google":
        return "google"
    return "service"


def _optional_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed:  # NaN check
        return None
    return parsed


def _looks_like_email(value: str) -> bool:
    text = value.strip()
    return "@" in text and "." in text.split("@")[-1]


def _normalize_email_for_local_user(identifier: str) -> str:
    lowered = identifier.strip().lower()
    if _looks_like_email(lowered):
        return lowered
    digest = sha1(lowered.encode("utf-8")).hexdigest()[:20]
    return f"mobile-{digest}@mobile.local"


def _normalize_name_for_local_user(identifier: str) -> str:
    text = identifier.strip()
    if _looks_like_email(text):
        return text.split("@", 1)[0][:80]
    return text[:80] or "mobile-user"


@router.get("/next")
def get_next_reminder(
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    job = repository.get_next_job(db, user_id=user_id)
    if not job:
        return {"next": None}
    return {
        "next": {
            "job_id": job.job_id,
            "day_id": job.day_id,
            "task_uid": job.task_uid,
            "alarm_time_local": job.alarm_time_local,
            "channel": job.channel,
            "state": job.state,
            "next_fire_at_utc": job.next_fire_at_utc,
            "metadata": job.metadata_json or {},
        }
    }


@router.get("/jobs")
def list_reminder_jobs(
    user_id: Optional[str] = Query(None),
    day_id: Optional[int] = Query(None),
    state: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    jobs = repository.list_jobs(db, user_id=user_id, day_id=day_id, state=state, limit=limit)
    return {
        "count": len(jobs),
        "jobs": [
            {
                "job_id": j.job_id,
                "day_id": j.day_id,
                "task_uid": j.task_uid,
                "alarm_time_local": j.alarm_time_local,
                "repeat_rule": j.repeat_rule,
                "channel": j.channel,
                "timezone": j.timezone,
                "state": j.state,
                "next_fire_at_utc": j.next_fire_at_utc,
                "attempts": j.attempts,
                "last_error": j.last_error,
                "metadata": j.metadata_json or {},
            }
            for j in jobs
        ],
    }


@router.get("/mobile-sync")
def mobile_sync_reminders(
    user_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    jobs = repository.list_jobs(db, user_id=user_id, state="active", limit=max(limit * 5, limit))
    now = datetime.now(timezone.utc)

    deduped: dict[str, tuple[Any, datetime]] = {}
    for job in jobs:
        effective_fire = _effective_next_fire(job, now_utc=now)
        if effective_fire is None:
            continue
        sync_key = f"{job.day_id}:{job.task_uid}:{job.alarm_time_local}:{job.repeat_rule}"
        existing = deduped.get(sync_key)
        if existing is None:
            deduped[sync_key] = (job, effective_fire)
            continue
        if _fire_sort_key(effective_fire) < _fire_sort_key(existing[1]):
            deduped[sync_key] = (job, effective_fire)

    merged = sorted(
        deduped.items(),
        key=lambda pair: (_fire_sort_key(pair[1][1]), pair[1][0].job_id),
    )[:limit]

    alarms = []
    for sync_key, (job, effective_fire) in merged:
        metadata = job.metadata_json or {}
        mission_type = _normalize_mission_type(metadata.get("mission_type"))
        source_type = _normalize_source_type(metadata.get("source_type"))
        if source_type == "google":
            mission_type = "manual_dismiss"
        target_lat = _optional_float(metadata.get("target_lat"))
        target_lng = _optional_float(metadata.get("target_lng"))
        radius_meters = _optional_float(metadata.get("radius_meters"))
        if radius_meters is not None and radius_meters <= 0:
            radius_meters = None

        alarms.append(
            {
                "sync_key": sync_key,
                "job_id": job.job_id,
                "day_id": job.day_id,
                "task_uid": job.task_uid,
                "alarm_time_local": job.alarm_time_local,
                "repeat_rule": job.repeat_rule,
                "custom_days": job.custom_days or [],
                "timezone": job.timezone,
                "next_fire_at_utc": effective_fire,
                "title": metadata.get("task_title") or "誘몄뀡 ?뚮엺",
                "mission_type": mission_type,
                "source_type": source_type,
                "target_lat": target_lat,
                "target_lng": target_lng,
                "radius_meters": radius_meters,
            }
        )

    return {
        "count": len(alarms),
        "alarms": alarms,
    }


@router.post("/mobile-login")
def mobile_login(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
):
    identifier = str(payload.get("identifier") or "").strip()
    if not identifier:
        return {"ok": False, "error": "identifier is required"}

    from backend.models.user import User

    lowered = identifier.lower()
    user = (
        db.query(User)
        .filter(
            or_(
                User.id == identifier,
                func.lower(User.email) == lowered,
            )
        )
        .order_by(User.created_at.desc())
        .first()
    )
    created = False
    if user is None:
        email = _normalize_email_for_local_user(identifier)
        firebase_uid = f"mobile:{sha1(lowered.encode('utf-8')).hexdigest()}"
        user = User(
            id=str(uuid4()),
            firebase_uid=firebase_uid,
            email=email,
            name=_normalize_name_for_local_user(identifier),
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
            created = True
        except IntegrityError:
            db.rollback()
            user = (
                db.query(User)
                .filter(
                    or_(
                        User.id == identifier,
                        func.lower(User.email) == lowered,
                        func.lower(User.email) == email.lower(),
                        User.firebase_uid == firebase_uid,
                    )
                )
                .order_by(User.created_at.desc())
                .first()
            )
            if user is None:
                return {"ok": False, "error": "login_create_failed"}

    return {
        "ok": True,
        "created": created,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
        },
    }
