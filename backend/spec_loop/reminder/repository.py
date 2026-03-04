from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import math
from typing import Any, Iterable, Optional

from sqlalchemy import inspect, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.spec_loop.models import (
    DayPlan,
    MissionResult,
    Place,
    PushSubscription,
    ReminderDelivery,
    ReminderJob,
    Task,
)
from backend.spec_loop.reminder.schedule import (
    DEFAULT_TZ,
    next_fire_at_utc,
    normalize_custom_days,
    normalize_repeat_rule,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _short_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:20]


def build_task_uid(
    *,
    user_id: Optional[str],
    plan_date: date,
    task_title: Optional[str],
    task_id: Optional[int],
    index: int,
) -> str:
    stable = "|".join(
        [
            user_id or "anonymous",
            plan_date.isoformat(),
            (task_title or "").strip().lower(),
            str(task_id or ""),
            str(index),
        ]
    )
    return _short_hash(stable)


def normalize_channels(channels: Optional[Iterable[str]]) -> list[str]:
    if not channels:
        return ["webpush", "fcm"]
    out: list[str] = []
    for raw in channels:
        v = (raw or "").strip().lower()
        if v in {"webpush", "fcm"} and v not in out:
            out.append(v)
    return out or ["webpush", "fcm"]


def _infer_mission_type(item: dict[str, Any]) -> str:
    DEFAULT_MISSION_TYPE = "location_arrival"

    missions = item.get("missions")
    if not isinstance(missions, list):
        return DEFAULT_MISSION_TYPE
    for mission in missions:
        if not isinstance(mission, dict):
            continue
        if mission.get("enabled") is False:
            continue
        mission_type = str(mission.get("type") or "").strip().lower()
        if mission_type == "location":
            return "location_arrival"
    return DEFAULT_MISSION_TYPE


def _infer_source_type(item: dict[str, Any]) -> str:
    raw = (
        str(
            item.get("source_type")
            or item.get("source")
            or item.get("calendar_source")
            or ""
        )
        .strip()
        .lower()
    )
    if "google" in raw:
        return "google"
    return "service"


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed):
        return None
    return parsed


def _as_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_location_target(
    db: Session,
    *,
    item: dict[str, Any],
    user_id: Optional[str],
) -> dict[str, Any]:
    missions = item.get("missions")
    if not isinstance(missions, list):
        return {}

    for mission in missions:
        if not isinstance(mission, dict):
            continue
        if mission.get("enabled") is False:
            continue
        mission_type = str(mission.get("type") or "").strip().lower()
        if mission_type != "location":
            continue

        config = mission.get("config")
        if not isinstance(config, dict):
            return {}

        place_id = _as_int(config.get("place_id"))
        place_name = str(config.get("place_name") or "").strip() or None

        gps = config.get("gps")
        target_lat: Optional[float] = None
        target_lng: Optional[float] = None
        radius_meters: Optional[float] = None
        if isinstance(gps, dict):
            target_lat = _as_float(gps.get("lat"))
            target_lng = _as_float(gps.get("lng"))
            radius_meters = _as_float(gps.get("radius"))

        if target_lat is None:
            target_lat = _as_float(config.get("gps_lat"))
        if target_lng is None:
            target_lng = _as_float(config.get("gps_lng"))
        if radius_meters is None:
            radius_meters = _as_float(config.get("gps_radius"))

        place = None
        if place_id is not None and (target_lat is None or target_lng is None or place_name is None):
            place = db.query(Place).filter(Place.place_id == place_id).first()
            if place is not None and user_id and place.user_id and place.user_id != user_id:
                place = None

        if place is not None:
            if place_name is None:
                place_name = str(place.name or "").strip() or None
            if target_lat is None:
                target_lat = _as_float(place.gps_lat)
            if target_lng is None:
                target_lng = _as_float(place.gps_lng)
            if radius_meters is None:
                radius_meters = _as_float(place.gps_radius)

        if radius_meters is None or radius_meters <= 0:
            radius_meters = 80.0

        payload: dict[str, Any] = {}
        if place_id is not None:
            payload["target_place_id"] = place_id
        if place_name:
            payload["target_place_name"] = place_name
        if target_lat is not None and target_lng is not None:
            payload["target_lat"] = target_lat
            payload["target_lng"] = target_lng
            payload["radius_meters"] = radius_meters
        return payload

    return {}


def _supports_channel_in_stable_unique(db: Session) -> bool:
    """Return False for legacy schemas where uq_reminder_job_stable omits channel."""
    bind = db.get_bind()
    if bind is None:
        return True
    try:
        constraints = inspect(bind).get_unique_constraints("reminder_jobs")
    except Exception:
        return True
    for constraint in constraints:
        if constraint.get("name") != "uq_reminder_job_stable":
            continue
        columns = [str(col).lower() for col in (constraint.get("column_names") or [])]
        return "channel" in columns
    return True


def _pick_legacy_channel(db: Session, *, user_id: Optional[str], channel_list: list[str]) -> str:
    if not channel_list:
        return "webpush"
    for channel in channel_list:
        if get_enabled_subscriptions(db, user_id=user_id, channel=channel):
            return channel
    return channel_list[0]


def _is_legacy_stable_unique_violation(exc: IntegrityError) -> bool:
    msg = str(getattr(exc, "orig", exc)).lower()
    if "uq_reminder_job_stable" not in msg:
        return False
    if "key (user_id, plan_date, task_uid, alarm_time_local, repeat_rule, channel)=" in msg:
        return False
    if "key (user_id, plan_date, task_uid, alarm_time_local, repeat_rule)=" in msg:
        return True
    return "duplicate key value violates unique constraint" in msg


def upsert_jobs_for_day_plan(
    db: Session,
    day_plan: DayPlan,
    *,
    timezone_name: Optional[str] = None,
    channels: Optional[Iterable[str]] = None,
    now_utc: Optional[datetime] = None,
    _force_legacy_unique: bool = False,
) -> list[ReminderJob]:
    now = now_utc or _utcnow()
    tz_name = (timezone_name or DEFAULT_TZ).strip() or DEFAULT_TZ
    channel_list = normalize_channels(channels)
    legacy_unique_without_channel = _force_legacy_unique or (not _supports_channel_in_stable_unique(db))
    if legacy_unique_without_channel and len(channel_list) > 1:
        channel_list = [_pick_legacy_channel(db, user_id=day_plan.user_id, channel_list=channel_list)]
    items = list(day_plan.items or [])

    task_ids = {int(item["task_id"]) for item in items if isinstance(item, dict) and item.get("task_id")}
    task_map = {}
    if task_ids:
        task_rows = db.query(Task.task_id, Task.title).filter(Task.task_id.in_(task_ids)).all()
        task_map = {row[0]: row[1] for row in task_rows}

    active_keys: set[tuple[Optional[str], date, str, str, str, str]] = set()
    touched: list[ReminderJob] = []

    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            continue
        alarm = item.get("alarm")
        if not isinstance(alarm, dict):
            continue

        alarm_time = str(alarm.get("time") or "").strip()
        if not alarm_time:
            continue

        repeat_rule = normalize_repeat_rule(str(alarm.get("repeat") or "daily"))
        custom_days = normalize_custom_days(alarm.get("custom_days"))
        task_id = item.get("task_id")
        task_title = (item.get("task_title") or task_map.get(task_id) or "").strip() or None
        task_uid = (item.get("task_uid") or "").strip()
        if not task_uid:
            task_uid = build_task_uid(
                user_id=day_plan.user_id,
                plan_date=day_plan.date,
                task_title=task_title,
                task_id=task_id if isinstance(task_id, int) else None,
                index=idx,
            )
            item["task_uid"] = task_uid

        if task_title:
            item["task_title"] = task_title

        fire_at = next_fire_at_utc(
            alarm_time_local=alarm_time,
            repeat_rule=repeat_rule,
            custom_days=custom_days,
            timezone_name=tz_name,
            now_utc=now,
            anchor_date=day_plan.date,
        )

        for channel in channel_list:
            stable_key = (
                day_plan.user_id,
                day_plan.date,
                task_uid,
                alarm_time,
                repeat_rule,
                channel,
            )
            active_keys.add(stable_key)
            query = (
                db.query(ReminderJob)
                .filter(
                    ReminderJob.user_id == day_plan.user_id,
                    ReminderJob.plan_date == day_plan.date,
                    ReminderJob.task_uid == task_uid,
                    ReminderJob.alarm_time_local == alarm_time,
                    ReminderJob.repeat_rule == repeat_rule,
                )
            )
            if not legacy_unique_without_channel:
                query = query.filter(ReminderJob.channel == channel)
            job = query.order_by(ReminderJob.job_id.asc()).first()
            source_type = _infer_source_type(item)
            mission_type = _infer_mission_type(item)
            if source_type == "google":
                mission_type = "manual_dismiss"
            location_target = _extract_location_target(
                db,
                item=item,
                user_id=day_plan.user_id,
            )

            metadata = {
                "task_title": task_title,
                "item_id": item.get("item_id"),
                "task_uid": task_uid,
                "mission_type": mission_type,
                "source_type": source_type,
                "expected_motion": item.get("expected_motion"),
            }
            metadata.update(location_target)
            if job is None:
                job = ReminderJob(
                    user_id=day_plan.user_id,
                    day_id=day_plan.day_id,
                    task_id=task_id if isinstance(task_id, int) else None,
                    task_uid=task_uid,
                    plan_date=day_plan.date,
                    alarm_time_local=alarm_time,
                    repeat_rule=repeat_rule,
                    custom_days=custom_days or None,
                    channel=channel,
                    timezone=tz_name,
                    next_fire_at_utc=fire_at,
                    state="active",
                    metadata_json=metadata,
                )
                db.add(job)
            else:
                job.day_id = day_plan.day_id
                job.task_id = task_id if isinstance(task_id, int) else None
                job.custom_days = custom_days or None
                job.channel = channel
                job.timezone = tz_name
                job.next_fire_at_utc = fire_at
                job.state = "active"
                job.metadata_json = metadata
                job.last_error = None
            touched.append(job)

    existing = db.query(ReminderJob).filter(ReminderJob.day_id == day_plan.day_id).all()
    for job in existing:
        key = (
            job.user_id,
            job.plan_date,
            job.task_uid,
            job.alarm_time_local,
            job.repeat_rule,
            job.channel,
        )
        if key in active_keys:
            continue
        if job.state in {"resolved", "canceled"}:
            continue
        job.state = "canceled"
        job.next_fire_at_utc = None
        job.lock_owner = None
        job.lock_until = None

    day_plan.items = items
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if (
            not legacy_unique_without_channel
            and len(channel_list) > 1
            and _is_legacy_stable_unique_violation(exc)
        ):
            fallback_channel = _pick_legacy_channel(
                db,
                user_id=day_plan.user_id,
                channel_list=channel_list,
            )
            refreshed = db.query(DayPlan).filter(DayPlan.day_id == day_plan.day_id).one_or_none() or day_plan
            return upsert_jobs_for_day_plan(
                db,
                refreshed,
                timezone_name=tz_name,
                channels=[fallback_channel],
                now_utc=now,
                _force_legacy_unique=True,
            )
        raise
    return touched


def cancel_jobs_for_day_id(db: Session, day_id: int) -> int:
    jobs = db.query(ReminderJob).filter(ReminderJob.day_id == day_id, ReminderJob.state != "canceled").all()
    for job in jobs:
        job.state = "canceled"
        job.next_fire_at_utc = None
        job.lock_owner = None
        job.lock_until = None
    db.commit()
    return len(jobs)


def resolve_jobs_for_day_id(db: Session, day_id: int) -> int:
    jobs = db.query(ReminderJob).filter(ReminderJob.day_id == day_id, ReminderJob.state == "active").all()
    for job in jobs:
        job.state = "resolved"
        job.next_fire_at_utc = None
        job.lock_owner = None
        job.lock_until = None
    db.commit()
    return len(jobs)


def has_successful_mission(db: Session, day_id: int) -> bool:
    row = (
        db.query(MissionResult.result_id)
        .filter(MissionResult.day_id == day_id, MissionResult.passed.is_(True))
        .limit(1)
        .first()
    )
    return row is not None


def resolve_jobs_if_mission_success(db: Session, day_id: int) -> bool:
    if not has_successful_mission(db, day_id):
        return False
    resolve_jobs_for_day_id(db, day_id)
    return True


def claim_due_jobs(
    db: Session,
    *,
    worker_id: str,
    now_utc: Optional[datetime] = None,
    limit: int = 100,
    lock_seconds: int = 55,
) -> list[ReminderJob]:
    now = now_utc or _utcnow()
    unlocked = or_(ReminderJob.lock_until.is_(None), ReminderJob.lock_until < now)
    candidate_ids = [
        row[0]
        for row in (
            db.query(ReminderJob.job_id)
            .filter(
                ReminderJob.state == "active",
                ReminderJob.next_fire_at_utc.is_not(None),
                ReminderJob.next_fire_at_utc <= now,
                unlocked,
            )
            .order_by(ReminderJob.next_fire_at_utc.asc(), ReminderJob.job_id.asc())
            .limit(max(limit * 3, limit))
            .all()
        )
    ]

    claimed_ids: list[int] = []
    lock_until = now + timedelta(seconds=max(5, lock_seconds))
    for job_id in candidate_ids:
        updated = (
            db.query(ReminderJob)
            .filter(
                ReminderJob.job_id == job_id,
                ReminderJob.state == "active",
                ReminderJob.next_fire_at_utc.is_not(None),
                ReminderJob.next_fire_at_utc <= now,
                unlocked,
            )
            .update(
                {"lock_owner": worker_id, "lock_until": lock_until},
                synchronize_session=False,
            )
        )
        if updated:
            claimed_ids.append(job_id)
        if len(claimed_ids) >= limit:
            break
    db.commit()

    if not claimed_ids:
        return []
    return (
        db.query(ReminderJob)
        .filter(ReminderJob.job_id.in_(claimed_ids))
        .order_by(ReminderJob.next_fire_at_utc.asc(), ReminderJob.job_id.asc())
        .all()
    )


def advance_next_schedule(job: ReminderJob, *, now_utc: Optional[datetime] = None) -> None:
    now = now_utc or _utcnow()
    next_fire = next_fire_at_utc(
        alarm_time_local=job.alarm_time_local,
        repeat_rule=job.repeat_rule,
        custom_days=job.custom_days or [],
        timezone_name=job.timezone,
        now_utc=now,
        anchor_date=job.plan_date,
    )
    # Product rule: reminder keeps ringing until mission success.
    # If rule=once has no future slot, continue as daily fallback.
    if next_fire is None and job.repeat_rule == "once":
        next_fire = next_fire_at_utc(
            alarm_time_local=job.alarm_time_local,
            repeat_rule="daily",
            custom_days=job.custom_days or [],
            timezone_name=job.timezone,
            now_utc=now,
            anchor_date=job.plan_date,
        )
    job.next_fire_at_utc = next_fire
    job.state = "active" if next_fire is not None else "paused"
    job.lock_owner = None
    job.lock_until = None
    job.attempts = 0
    job.last_error = None


def schedule_backoff(job: ReminderJob, *, now_utc: Optional[datetime], base_seconds: int) -> None:
    now = now_utc or _utcnow()
    next_delay = max(15, base_seconds) * (2 ** max(0, job.attempts - 1))
    capped = min(next_delay, 30 * 60)
    job.next_fire_at_utc = now + timedelta(seconds=capped)
    job.lock_owner = None
    job.lock_until = None


def begin_delivery(
    db: Session,
    *,
    job: ReminderJob,
    dedupe_key: str,
    payload: Optional[dict[str, Any]],
    scheduled_fire_at_utc: Optional[datetime],
) -> tuple[ReminderDelivery, bool]:
    existing = db.query(ReminderDelivery).filter(ReminderDelivery.dedupe_key == dedupe_key).one_or_none()
    if existing is not None:
        if existing.status == "sent":
            return existing, False
        existing.status = "sending"
        existing.attempts += 1
        existing.payload = payload
        existing.scheduled_fire_at_utc = scheduled_fire_at_utc
        db.flush()
        return existing, True

    created = ReminderDelivery(
        job_id=job.job_id,
        user_id=job.user_id,
        channel=job.channel,
        status="sending",
        dedupe_key=dedupe_key,
        payload=payload,
        scheduled_fire_at_utc=scheduled_fire_at_utc,
        attempts=1,
    )
    db.add(created)
    try:
        db.flush()
        return created, True
    except IntegrityError:
        db.rollback()
        existing = db.query(ReminderDelivery).filter(ReminderDelivery.dedupe_key == dedupe_key).one()
        return existing, existing.status != "sent"


def finish_delivery(
    delivery: ReminderDelivery,
    *,
    status: str,
    provider_message_id: Optional[str] = None,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    delivery.status = status
    delivery.provider_message_id = provider_message_id
    delivery.error_code = error_code
    delivery.error_message = error_message
    if status == "sent":
        delivery.sent_at = _utcnow()


def list_jobs(
    db: Session,
    *,
    user_id: Optional[str] = None,
    day_id: Optional[int] = None,
    state: Optional[str] = None,
    limit: int = 100,
) -> list[ReminderJob]:
    q = db.query(ReminderJob)
    if user_id:
        q = q.filter(ReminderJob.user_id == user_id)
    if day_id is not None:
        q = q.filter(ReminderJob.day_id == day_id)
    if state:
        q = q.filter(ReminderJob.state == state)
    return q.order_by(ReminderJob.next_fire_at_utc.asc(), ReminderJob.job_id.asc()).limit(limit).all()


def get_next_job(db: Session, *, user_id: Optional[str] = None) -> Optional[ReminderJob]:
    q = db.query(ReminderJob).filter(ReminderJob.state == "active", ReminderJob.next_fire_at_utc.is_not(None))
    if user_id:
        q = q.filter(ReminderJob.user_id == user_id)
    return q.order_by(ReminderJob.next_fire_at_utc.asc(), ReminderJob.job_id.asc()).first()


def upsert_web_subscription(
    db: Session,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_id: Optional[str],
    user_agent: Optional[str],
) -> PushSubscription:
    row = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).one_or_none()
    if row is None:
        row = PushSubscription(
            user_id=user_id,
            channel="webpush",
            platform="web",
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
            enabled=True,
        )
        db.add(row)
    else:
        row.user_id = user_id or row.user_id
        row.p256dh = p256dh
        row.auth = auth
        row.user_agent = user_agent
        row.enabled = True
        row.last_seen_at = _utcnow()
    db.commit()
    db.refresh(row)
    return row


def disable_web_subscription(db: Session, *, endpoint: str) -> bool:
    row = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).one_or_none()
    if row is None:
        return False
    row.enabled = False
    row.last_seen_at = _utcnow()
    db.commit()
    return True


def upsert_device_token(
    db: Session,
    *,
    user_id: Optional[str],
    device_token: str,
    platform: str,
    device_id: Optional[str],
    user_agent: Optional[str],
) -> PushSubscription:
    row = db.query(PushSubscription).filter(PushSubscription.device_token == device_token).one_or_none()
    if row is None:
        row = PushSubscription(
            user_id=user_id,
            channel="fcm",
            platform=platform,
            device_token=device_token,
            device_id=device_id,
            user_agent=user_agent,
            enabled=True,
        )
        db.add(row)
    else:
        row.user_id = user_id or row.user_id
        row.platform = platform
        row.device_id = device_id
        row.user_agent = user_agent
        row.enabled = True
        row.last_seen_at = _utcnow()
    db.commit()
    db.refresh(row)
    return row


def disable_device_token(db: Session, *, device_token: str) -> bool:
    row = db.query(PushSubscription).filter(PushSubscription.device_token == device_token).one_or_none()
    if row is None:
        return False
    row.enabled = False
    row.last_seen_at = _utcnow()
    db.commit()
    return True


def get_enabled_subscriptions(db: Session, *, user_id: Optional[str], channel: str) -> list[PushSubscription]:
    if not user_id:
        return []
    q = db.query(PushSubscription).filter(
        PushSubscription.user_id == user_id,
        PushSubscription.channel == channel,
        PushSubscription.enabled.is_(True),
    )
    if channel == "webpush":
        q = q.filter(PushSubscription.endpoint.is_not(None))
    if channel == "fcm":
        q = q.filter(PushSubscription.device_token.is_not(None))
    return q.all()


def metrics_counts(db: Session, *, user_id: Optional[str] = None) -> dict[str, int]:
    q = db.query(PushSubscription)
    if user_id:
        q = q.filter(PushSubscription.user_id == user_id)
    total = q.count()
    enabled = q.filter(PushSubscription.enabled.is_(True)).count()
    webpush = q.filter(PushSubscription.channel == "webpush", PushSubscription.enabled.is_(True)).count()
    fcm = q.filter(PushSubscription.channel == "fcm", PushSubscription.enabled.is_(True)).count()
    return {
        "subscriptions_total": total,
        "subscriptions_enabled": enabled,
        "webpush_enabled": webpush,
        "fcm_enabled": fcm,
    }
