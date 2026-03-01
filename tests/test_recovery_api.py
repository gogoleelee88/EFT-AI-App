import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DEBUG", "false")

from backend.database import get_db  # noqa: E402
from backend.spec_loop.models.recovery_event import RecoveryEvent  # noqa: E402
from backend.spec_loop.recovery.router import router as recovery_router  # noqa: E402
from backend.spec_loop.recovery.schemas import IosSignalIn, RecoveryEventIn  # noqa: E402
from backend.spec_loop.recovery import service as recovery_service  # noqa: E402


class _DummySettings:
    FRONTEND_DASHBOARD_URL = "http://localhost:5173/dashboard"


@pytest.fixture()
def db_session(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
        conn.execute(text("INSERT INTO users (id) VALUES ('u1')"))
    RecoveryEvent.__table__.create(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = SessionLocal()

    monkeypatch.setattr(recovery_service, "get_settings", lambda: _DummySettings())
    monkeypatch.setattr(recovery_service, "get_active_focus_session", lambda db, user_id=None: None)
    monkeypatch.setattr(
        recovery_service,
        "get_focus_session_by_id",
        lambda db, focus_session_id, user_id=None: None,
    )
    try:
        yield session
    finally:
        session.close()


def test_create_recovery_event_open_web(db_session):
    out = recovery_service.create_recovery_event(
        db_session,
        RecoveryEventIn(
            user_id="u1",
            session_state="in_progress",
            entry_point="distraction_detected",
            schedule_id="sch-1",
            schedule_name="문서 정리",
            distraction_type="SNS",
            confidence=0.8,
            source="pytest",
        ),
    )
    assert out.action == "open_web"
    assert out.entry_point == "distraction_detected"
    assert "문서 정리" in out.entry_sentence
    assert out.recovery_url is not None
    assert "/eft-strict?" in out.recovery_url


def test_create_recovery_event_cooldown(db_session):
    payload = RecoveryEventIn(
        user_id="u1",
        session_state="in_progress",
        entry_point="distraction_detected",
        schedule_id="sch-1",
        schedule_name="문서 정리",
        distraction_type="SNS",
        confidence=0.8,
        source="pytest",
    )
    first = recovery_service.create_recovery_event(db_session, payload)
    second = recovery_service.create_recovery_event(db_session, payload)
    assert first.action == "open_web"
    assert second.action == "ignore"
    assert second.suppressed_reason == "cooldown"


def test_ios_signal_mapping(db_session):
    out = recovery_service.create_recovery_event_from_ios_signal(
        db_session,
        IosSignalIn(
            user_id="u1",
            signal_type="screen_off",
            schedule_id="sch-ios",
            schedule_name="iOS 세션",
            confidence=0.7,
        ),
    )
    assert out.entry_point == "distraction_detected"
    assert out.action == "open_web"
    assert "ScreenOff" in out.entry_sentence


def test_recovery_journal_aggregate(db_session):
    events = [
        RecoveryEventIn(
            user_id="u1",
            session_state="start",
            entry_point="schedule_start",
            schedule_id="sch-a",
            schedule_name="기획서",
            blocked_min=4,
            confidence=0.8,
            source="pytest",
        ),
        RecoveryEventIn(
            user_id="u1",
            session_state="in_progress",
            entry_point="progress_blocked",
            schedule_id="sch-a",
            schedule_name="기획서",
            blocked_min=11,
            confidence=0.8,
            source="pytest",
        ),
        RecoveryEventIn(
            user_id="u1",
            session_state="in_progress",
            entry_point="distraction_detected",
            schedule_id="sch-b",
            schedule_name="코딩",
            distraction_type="Browser",
            confidence=0.8,
            source="pytest",
        ),
    ]
    for event in events:
        recovery_service.create_recovery_event(db_session, event)

    journal = recovery_service.get_recovery_journal(
        db_session,
        user_id="u1",
        days=7,
        limit=100,
        include_events=True,
    )
    assert journal.total_events >= 3
    assert journal.open_web_count >= 2
    assert "schedule_start" in journal.entry_point_counts
    assert len(journal.summary_lines) >= 1
    assert len(journal.events) >= 1


def test_recovery_router_event_endpoint(db_session):
    app = FastAPI()
    app.include_router(recovery_router, prefix="/api/spec")

    def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app)
    response = client.post(
        "/api/spec/recovery/events?user_id=u1",
        json={
            "entry_point": "schedule_start",
            "session_state": "start",
            "schedule_name": "테스트 일정",
            "blocked_min": 3,
            "confidence": 0.8,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["entry_point"] == "schedule_start"
    assert data["action"] in {"open_web", "ignore"}


def test_recovery_router_ios_signal_endpoint(db_session):
    app = FastAPI()
    app.include_router(recovery_router, prefix="/api/spec")

    def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app)
    response = client.post(
        "/api/spec/recovery/ios-signals?user_id=u1",
        json={
            "signal_type": "background",
            "schedule_id": "sch-ios-2",
            "schedule_name": "ios-task",
            "confidence": 0.75,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["entry_point"] == "distraction_detected"
    assert data["action"] in {"open_web", "ignore"}


def test_recovery_router_journal_endpoint(db_session):
    app = FastAPI()
    app.include_router(recovery_router, prefix="/api/spec")

    def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    client = TestClient(app)
    client.post(
        "/api/spec/recovery/events?user_id=u1",
        json={
            "entry_point": "distraction_detected",
            "session_state": "in_progress",
            "schedule_id": "sch-journal",
            "schedule_name": "journal-task",
            "distraction_type": "Browser",
            "confidence": 0.8,
        },
    )
    response = client.get("/api/spec/recovery/journal?user_id=u1&days=7&include_events=true")
    assert response.status_code == 200
    data = response.json()
    assert "total_events" in data
    assert "summary_lines" in data
    assert data["total_events"] >= 1
