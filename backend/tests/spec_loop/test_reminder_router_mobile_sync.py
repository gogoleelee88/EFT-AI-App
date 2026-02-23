from datetime import date, datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.spec_loop.models import DayPlan, ReminderJob
from backend.spec_loop.reminder.router import router as reminder_router


def _build_client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(reminder_router, prefix="/api")

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), SessionLocal


def test_mobile_sync_dedupes_channels():
    client, SessionLocal = _build_client()
    db = SessionLocal()
    try:
        plan = DayPlan(user_id=None, date=date(2026, 2, 17), mode=100, items=[])
        db.add(plan)
        db.flush()

        fire_at = datetime(2026, 2, 17, 10, 0, tzinfo=timezone.utc)
        common = dict(
            user_id=None,
            day_id=plan.day_id,
            task_id=None,
            task_uid="task-uid-1",
            plan_date=date(2026, 2, 17),
            alarm_time_local="19:00",
            repeat_rule="daily",
            custom_days=None,
            timezone="Asia/Seoul",
            next_fire_at_utc=fire_at,
            state="active",
            metadata_json={"task_title": "알람 테스트", "mission_type": "location_arrival", "source_type": "service"},
        )
        db.add(ReminderJob(channel="webpush", **common))
        db.add(ReminderJob(channel="fcm", **common))
        db.commit()
    finally:
        db.close()

    response = client.get("/api/reminders/mobile-sync")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    alarm = body["alarms"][0]
    assert alarm["title"] == "알람 테스트"
    assert alarm["mission_type"] == "location_arrival"
    assert alarm["source_type"] == "service"
