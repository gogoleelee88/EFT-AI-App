from __future__ import annotations

import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional, Tuple
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.spec_loop.models.mission_proof import MissionProof
from backend.spec_loop.models.reminder_job import ReminderJob

DEFAULT_MIN_SECONDS = 10
ALLOWED_PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _find_latest_job(
    db: Session,
    *,
    user_id: str,
    plan_date: date,
    task_uid: str,
) -> Optional[ReminderJob]:
    return (
        db.query(ReminderJob)
        .filter(
            ReminderJob.user_id == user_id,
            ReminderJob.plan_date == plan_date,
            ReminderJob.task_uid == task_uid,
        )
        .order_by(ReminderJob.job_id.desc())
        .first()
    )


def verify_time_check(
    db: Session,
    *,
    user_id: str,
    plan_date: date,
    task_uid: str,
    min_seconds: int = DEFAULT_MIN_SECONDS,
) -> Tuple[datetime, datetime]:
    job = _find_latest_job(db, user_id=user_id, plan_date=plan_date, task_uid=task_uid)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="reminder_job_not_found")

    scheduled = job.next_fire_at_utc
    if scheduled is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="job_missing_next_fire")

    scheduled_utc = _as_utc(scheduled)
    now_utc = datetime.now(timezone.utc)
    delta = (now_utc - scheduled_utc).total_seconds()
    if delta < float(min_seconds):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "too_early",
                "min_seconds": int(min_seconds),
                "seconds_since_fire": int(delta),
            },
        )
    return scheduled_utc, now_utc


def save_photo_file(file: UploadFile) -> str:
    base_dir = Path(os.environ.get("MISSION_PHOTO_DIR", "uploads/mission_photos"))
    base_dir.mkdir(parents=True, exist_ok=True)

    incoming_ext = Path(file.filename or "").suffix.lower()
    ext = incoming_ext if incoming_ext in ALLOWED_PHOTO_EXTENSIONS else ".jpg"
    filename = f"{uuid4().hex}{ext}"
    path = base_dir / filename

    payload = file.file.read()
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_image")

    with path.open("wb") as fp:
        fp.write(payload)
    return str(path)


def upsert_proof(
    db: Session,
    *,
    user_id: str,
    plan_date: date,
    task_uid: str,
    mission_type: str,
    min_seconds: int,
    scheduled_fire_at_utc: Optional[datetime],
    data_json: Optional[dict],
    photo_path: Optional[str],
) -> MissionProof:
    row = (
        db.query(MissionProof)
        .filter(
            MissionProof.user_id == user_id,
            MissionProof.plan_date == plan_date,
            MissionProof.task_uid == task_uid,
            MissionProof.mission_type == mission_type,
        )
        .first()
    )
    if row is None:
        row = MissionProof(
            id=uuid4().hex,
            user_id=user_id,
            plan_date=plan_date,
            task_uid=task_uid,
            mission_type=mission_type,
        )
        db.add(row)

    row.min_seconds = int(min_seconds)
    row.scheduled_fire_at_utc = scheduled_fire_at_utc
    row.data_json = data_json
    row.photo_path = photo_path
    row.verified_at_utc = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row
