from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import get_db
from backend.spec_loop.models import DayPlan, ReminderJob
from backend.spec_loop.reminder.router import router as reminder_router


def _build_client() -> tuple[TestClient, sessionmaker]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    DayPlan.__table__.create(bind=engine, checkfirst=True)
    ReminderJob.__table__.create(bind=engine, checkfirst=True)

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


def test_mobile_sync_dedupes_channels_and_includes_location_target():
    client, SessionLocal = _build_client()
    db = SessionLocal()
    try:
        plan = DayPlan(user_id=None, date=date(2026, 2, 17), mode=100, items=[])
        db.add(plan)
        db.flush()

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
            next_fire_at_utc=None,
            state="active",
            metadata_json={
                "task_title": "alarm test",
                "mission_type": "location_arrival",
                "source_type": "service",
                "target_lat": 37.49991,
                "target_lng": 127.03534,
                "radius_meters": 60.0,
            },
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
    assert alarm["title"] == "alarm test"
    assert alarm["mission_type"] == "location_arrival"
    assert alarm["source_type"] == "service"
    assert alarm["target_lat"] == 37.49991
    assert alarm["target_lng"] == 127.03534
    assert alarm["radius_meters"] == 60.0
