from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.routers.push import router as push_router


def _build_client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(push_router)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_push_metrics_endpoint_exists():
    client = _build_client()
    response = client.post("/api/push/metrics", json={"type": "close"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert "subscription_counts" in body


def test_push_subscribe_and_unsubscribe():
    client = _build_client()
    subscribe = client.post(
        "/api/push/subscribe",
        json={
            "endpoint": "https://example.com/push/abc",
            "keys": {"p256dh": "k", "auth": "a"},
            "user_id": "test-user",
        },
    )
    assert subscribe.status_code == 200
    assert subscribe.json()["ok"] is True

    unsubscribe = client.post("/api/push/unsubscribe", json={"endpoint": "https://example.com/push/abc"})
    assert unsubscribe.status_code == 200
    assert unsubscribe.json()["ok"] is True


def test_push_vapid_public_key_endpoint_exists():
    client = _build_client()
    response = client.get("/api/push/vapid-public-key")
    assert response.status_code == 200
    body = response.json()
    assert "ok" in body
    assert "public_key" in body
