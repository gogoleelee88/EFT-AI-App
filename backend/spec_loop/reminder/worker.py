from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.spec_loop.models import ReminderJob
from backend.spec_loop.reminder.dispatcher import ReminderDispatcher
from backend.spec_loop.reminder import repository
from utils.logger import get_logger

logger = get_logger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> str:
    if dt is None:
        return "none"
    return dt.astimezone(timezone.utc).isoformat()


def _build_notification_payload(job: ReminderJob) -> dict[str, Any]:
    title = "誘몄뀡 ?뚮┝"
    task_title = (job.metadata_json or {}).get("task_title")
    if task_title:
        body = f"{task_title} 誘몄뀡???쒖옉?섏꽭??"
    else:
        body = "?ㅼ젙??誘몄뀡 ?쒓컙???섏뿀?듬땲??"

    return {
        "title": title,
        "body": body,
        "tag": f"mission-{job.day_id}-{job.task_uid}",
        "url": "/",
        "day_id": str(job.day_id),
        "task_uid": job.task_uid,
        "job_id": str(job.job_id),
        "channel": job.channel,
    }


def process_due_reminders(
    db: Session,
    *,
    worker_id: Optional[str] = None,
    now_utc: Optional[datetime] = None,
    limit: Optional[int] = None,
) -> dict[str, int]:
    settings = get_settings()
    now = now_utc or _utcnow()
    worker = worker_id or f"reminder-worker-{uuid4().hex[:8]}"
    claim_limit = int(limit or settings.REMINDER_CLAIM_LIMIT)
    lock_seconds = int(settings.REMINDER_LOCK_SECONDS)

    claimed = repository.claim_due_jobs(
        db,
        worker_id=worker,
        now_utc=now,
        limit=claim_limit,
        lock_seconds=lock_seconds,
    )
    dispatcher = ReminderDispatcher()

    metrics = {
        "claimed": len(claimed),
        "sent": 0,
        "failed": 0,
        "suppressed": 0,
        "resolved": 0,
    }

    for job in claimed:
        scheduled_fire = job.next_fire_at_utc
        dedupe_key = f"{job.job_id}:{job.channel}:{_iso(scheduled_fire)}"
        payload = _build_notification_payload(job)

        delivery, should_send = repository.begin_delivery(
            db,
            job=job,
            dedupe_key=dedupe_key,
            payload=payload,
            scheduled_fire_at_utc=scheduled_fire,
        )
        if not should_send:
            job.lock_owner = None
            job.lock_until = None
            db.commit()
            continue

        # Mission-success turn-off: if any mission is passed, stop further reminders.
        if repository.resolve_jobs_if_mission_success(db, job.day_id):
            repository.finish_delivery(
                delivery,
                status="suppressed",
                error_code="MISSION_ALREADY_RESOLVED",
                error_message="mission already passed for day",
            )
            job.state = "resolved"
            job.next_fire_at_utc = None
            job.lock_owner = None
            job.lock_until = None
            db.commit()
            metrics["suppressed"] += 1
            metrics["resolved"] += 1
            logger.info(
                "reminder.suppressed job_id=%s dedupe_key=%s reason=mission_resolved",
                job.job_id,
                dedupe_key,
            )
            continue

        result = dispatcher.send(db, job, payload)
        if result.status == "sent":
            repository.finish_delivery(
                delivery,
                status="sent",
                provider_message_id=result.provider_message_id,
            )
            repository.advance_next_schedule(job, now_utc=now)
            db.commit()
            metrics["sent"] += 1
            logger.info(
                "reminder.sent job_id=%s dedupe_key=%s sent_count=%s",
                job.job_id,
                dedupe_key,
                result.sent_count,
            )
            continue

        if result.status == "suppressed":
            repository.finish_delivery(
                delivery,
                status="suppressed",
                error_code=result.error_code,
                error_message=result.error_message,
            )
            repository.advance_next_schedule(job, now_utc=now)
            db.commit()
            metrics["suppressed"] += 1
            logger.info(
                "reminder.suppressed job_id=%s dedupe_key=%s code=%s",
                job.job_id,
                dedupe_key,
                result.error_code,
            )
            continue

        job.attempts += 1
        repository.finish_delivery(
            delivery,
            status="failed",
            error_code=result.error_code,
            error_message=result.error_message,
        )
        job.last_error = result.error_message or result.error_code

        if job.attempts < int(settings.REMINDER_MAX_ATTEMPTS):
            repository.schedule_backoff(
                job,
                now_utc=now,
                base_seconds=int(settings.REMINDER_BACKOFF_BASE_SECONDS),
            )
        else:
            repository.advance_next_schedule(job, now_utc=now)
        db.commit()
        metrics["failed"] += 1
        logger.info(
            "reminder.failed job_id=%s dedupe_key=%s attempts=%s code=%s",
            job.job_id,
            dedupe_key,
            job.attempts,
            result.error_code,
        )

    return metrics


