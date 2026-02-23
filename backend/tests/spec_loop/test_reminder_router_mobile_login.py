from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.models.user import User
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

    db = SessionLocal()
    try:
        db.add(
            User(
                id="test-user-id-1",
                firebase_uid="firebase-uid-1",
                email="tester@example.com",
                name="Tester",
            )
        )
        db.commit()
    finally:
        db.close()

    return TestClient(app)


def test_mobile_login_by_email():
    client = _build_client()
    response = client.post("/api/reminders/mobile-login", json={"identifier": "tester@example.com"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["user"]["id"] == "test-user-id-1"


def test_mobile_login_by_user_id():
    client = _build_client()
    response = client.post("/api/reminders/mobile-login", json={"identifier": "test-user-id-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["user"]["email"] == "tester@example.com"


def test_mobile_login_auto_create_for_unknown_identifier():
    client = _build_client()
    response = client.post("/api/reminders/mobile-login", json={"identifier": "missing-user"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["created"] is True
    assert body["user"]["id"]
    assert body["user"]["email"].endswith("@mobile.local")
