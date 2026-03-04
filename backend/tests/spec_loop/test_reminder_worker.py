from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from backend.models.user import User
from backend.spec_loop.models import DayPlan, MissionResult, Place, ReminderDelivery, ReminderJob
from backend.spec_loop.reminder import repository
from backend.spec_loop.reminder.providers.webpush_provider import WebPushProvider
from backend.spec_loop.reminder.worker import process_due_reminders


def _seed_user(db_session, user_id: str = "test-user") -> str:
    exists = db_session.query(User).filter(User.id == user_id).one_or_none()
    if exists:
        return user_id
    user = User(
        id=user_id,
        firebase_uid=f"firebase-{user_id}",
        email=f"{user_id}@example.com",
        name="tester",
    )
    db_session.add(user)
    db_session.commit()
    return user_id


def _create_alarm_plan(db_session, *, user_id: str, repeat: str = "daily") -> tuple[DayPlan, ReminderJob]:
    now_local = datetime.now(timezone.utc).astimezone(ZoneInfo("Asia/Seoul"))
    alarm_time = (now_local + timedelta(minutes=2)).strftime("%H:%M")
    plan = DayPlan(
        user_id=user_id,
        date=now_local.date(),
        mode=100,
        version=1,
        items=[
            {
                "item_id": "it-1",
                "task_title": "alarm test task",
                "planned_block_minutes": 25,
                "micro_steps": ["start"],
                "alarm": {
                    "time": alarm_time,
                    "repeat": repeat,
                    "custom_days": None,
                },
            }
        ],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    repository.upsert_jobs_for_day_plan(
        db_session,
        plan,
        timezone_name="Asia/Seoul",
        channels=["webpush"],
        now_utc=datetime.now(timezone.utc),
    )
    job = db_session.query(ReminderJob).filter(ReminderJob.day_id == plan.day_id).one()
    job.next_fire_at_utc = datetime.now(timezone.utc) - timedelta(seconds=2)
    db_session.commit()
    db_session.refresh(job)
    return plan, job


def test_worker_sends_when_mission_not_passed(db_session, monkeypatch):
    user_id = _seed_user(db_session, "send-user")
    plan, job = _create_alarm_plan(db_session, user_id=user_id)
    repository.upsert_web_subscription(
        db_session,
        endpoint="https://example.com/push/sub-1",
        p256dh="p256dh-key",
        auth="auth-key",
        user_id=user_id,
        user_agent="pytest",
    )

    monkeypatch.setattr(WebPushProvider, "send", lambda self, subscription, payload: (True, None, None))
    metrics = process_due_reminders(db_session, worker_id="test-worker", now_utc=datetime.now(timezone.utc))

    assert metrics["sent"] == 1
    delivery = db_session.query(ReminderDelivery).filter(ReminderDelivery.job_id == job.job_id).one()
    assert delivery.status == "sent"
    db_session.refresh(job)
    assert job.state == "active"
    assert job.next_fire_at_utc is not None
    next_fire = job.next_fire_at_utc
    if next_fire.tzinfo is None:
        next_fire = next_fire.replace(tzinfo=timezone.utc)
    assert next_fire > datetime.now(timezone.utc) - timedelta(minutes=1)
    assert plan.day_id == job.day_id


def test_worker_stops_when_mission_passed(db_session, monkeypatch):
    user_id = _seed_user(db_session, "resolved-user")
    plan, job = _create_alarm_plan(db_session, user_id=user_id)
    repository.upsert_web_subscription(
        db_session,
        endpoint="https://example.com/push/sub-2",
        p256dh="p256dh-key",
        auth="auth-key",
        user_id=user_id,
        user_agent="pytest",
    )

    call_count = {"n": 0}

    def _send(self, subscription, payload):
        call_count["n"] += 1
        return True, None, None

    monkeypatch.setattr(WebPushProvider, "send", _send)

    passed = MissionResult(
        user_id=user_id,
        day_id=plan.day_id,
        mission_template_id=None,
        mission_type="photo",
        passed=True,
        score=1.0,
        evidence={"source": "pytest"},
        verified_at=datetime.now(timezone.utc),
    )
    db_session.add(passed)
    db_session.commit()

    metrics = process_due_reminders(db_session, worker_id="test-worker", now_utc=datetime.now(timezone.utc))
    assert metrics["suppressed"] == 1
    assert call_count["n"] == 0

    db_session.refresh(job)
    assert job.state == "resolved"
    assert job.next_fire_at_utc is None
    delivery = db_session.query(ReminderDelivery).filter(ReminderDelivery.job_id == job.job_id).one()
    assert delivery.status == "suppressed"


def test_worker_idempotent_across_duplicate_ticks(db_session, monkeypatch):
    user_id = _seed_user(db_session, "dedupe-user")
    _, job = _create_alarm_plan(db_session, user_id=user_id)
    repository.upsert_web_subscription(
        db_session,
        endpoint="https://example.com/push/sub-3",
        p256dh="p256dh-key",
        auth="auth-key",
        user_id=user_id,
        user_agent="pytest",
    )

    calls = {"n": 0}

    def _send(self, subscription, payload):
        calls["n"] += 1
        return True, None, None

    monkeypatch.setattr(WebPushProvider, "send", _send)

    now = datetime.now(timezone.utc)
    first = process_due_reminders(db_session, worker_id="worker-a", now_utc=now)
    second = process_due_reminders(db_session, worker_id="worker-b", now_utc=now)

    assert first["sent"] == 1
    assert second["sent"] == 0
    assert calls["n"] == 1

    sent_count = (
        db_session.query(ReminderDelivery)
        .filter(ReminderDelivery.job_id == job.job_id, ReminderDelivery.status == "sent")
        .count()
    )
    assert sent_count == 1


def test_upsert_legacy_unique_prefers_available_channel(db_session, monkeypatch):
    user_id = _seed_user(db_session, "legacy-channel-user")
    now_local = datetime.now(timezone.utc).astimezone(ZoneInfo("Asia/Seoul"))
    alarm_time = (now_local + timedelta(minutes=3)).strftime("%H:%M")

    plan = DayPlan(
        user_id=user_id,
        date=now_local.date(),
        mode=100,
        version=1,
        items=[
            {
                "item_id": "legacy-it-1",
                "task_title": "legacy schema test",
                "planned_block_minutes": 20,
                "micro_steps": ["step-1"],
                "alarm": {
                    "time": alarm_time,
                    "repeat": "daily",
                    "custom_days": None,
                },
            }
        ],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    repository.upsert_device_token(
        db_session,
        user_id=user_id,
        device_token="legacy-device-token-1",
        platform="android",
        device_id="legacy-device-1",
        user_agent="pytest",
    )

    monkeypatch.setattr(repository, "_supports_channel_in_stable_unique", lambda _db: False)

    repository.upsert_jobs_for_day_plan(
        db_session,
        plan,
        timezone_name="Asia/Seoul",
        channels=["webpush", "fcm"],
        now_utc=datetime.now(timezone.utc),
    )

    jobs = db_session.query(ReminderJob).filter(ReminderJob.day_id == plan.day_id).all()
    assert len(jobs) == 1
    assert jobs[0].channel == "fcm"


def test_upsert_location_mission_stores_target_metadata_from_place_fallback(db_session):
    user_id = _seed_user(db_session, "location-meta-user")
    now_local = datetime.now(timezone.utc).astimezone(ZoneInfo("Asia/Seoul"))
    alarm_time = (now_local + timedelta(minutes=5)).strftime("%H:%M")

    place = Place(
        user_id=user_id,
        name="Test Library",
        address="Seoul",
        gps_lat=37.5001,
        gps_lng=127.0301,
        gps_radius=55,
    )
    db_session.add(place)
    db_session.commit()
    db_session.refresh(place)

    plan = DayPlan(
        user_id=user_id,
        date=now_local.date(),
        mode=100,
        version=1,
        items=[
            {
                "item_id": "location-meta-item-1",
                "task_title": "location mission metadata",
                "planned_block_minutes": 30,
                "micro_steps": ["start"],
                "missions": [
                    {
                        "mission_id": "mission_1",
                        "type": "location",
                        "enabled": True,
                        # Intentionally omit config.gps to verify place_id fallback lookup.
                        "config": {
                            "place_id": place.place_id,
                            "place_name": place.name,
                        },
                    }
                ],
                "alarm": {
                    "time": alarm_time,
                    "repeat": "daily",
                    "custom_days": None,
                },
            }
        ],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    repository.upsert_jobs_for_day_plan(
        db_session,
        plan,
        timezone_name="Asia/Seoul",
        channels=["webpush"],
        now_utc=datetime.now(timezone.utc),
    )

    job = db_session.query(ReminderJob).filter(ReminderJob.day_id == plan.day_id).one()
    metadata = job.metadata_json or {}
    assert metadata["target_place_id"] == place.place_id
    assert metadata["target_place_name"] == place.name
    assert metadata["target_lat"] == place.gps_lat
    assert metadata["target_lng"] == place.gps_lng
    assert metadata["radius_meters"] == float(place.gps_radius)
