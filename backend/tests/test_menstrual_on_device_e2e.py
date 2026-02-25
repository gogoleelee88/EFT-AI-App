from __future__ import annotations

from pathlib import Path
from typing import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.app.services.auth_helpers import get_current_user_id
from backend.database import get_db
from backend.models.menstrual import (
    MenstrualDaySummary,
    MenstrualEvent,
    MenstrualExportJob,
    MenstrualPrediction,
    MenstrualPrivacySettings,
)
from backend.models.user import User
from backend.routers.menstrual import router as menstrual_router


def _make_session_factory(tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'menstrual_e2e.db'}", connect_args={"check_same_thread": False})
    User.__table__.create(bind=engine, checkfirst=True)
    MenstrualEvent.__table__.create(bind=engine, checkfirst=True)
    MenstrualDaySummary.__table__.create(bind=engine, checkfirst=True)
    MenstrualPrediction.__table__.create(bind=engine, checkfirst=True)
    MenstrualExportJob.__table__.create(bind=engine, checkfirst=True)
    MenstrualPrivacySettings.__table__.create(bind=engine, checkfirst=True)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _seed_user(session: Session, user_id: str) -> None:
    session.add(
        User(
            id=user_id,
            firebase_uid=f"firebase-{user_id}",
            email=f"{user_id}@example.com",
            name="tester",
        )
    )
    session.commit()


def _build_app(session_factory):
    app = FastAPI()
    app.include_router(menstrual_router)

    def _override_user_id() -> str:
        return "u-e2e-1"

    def _override_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_current_user_id] = _override_user_id
    app.dependency_overrides[get_db] = _override_db
    return app


def test_on_device_mode_blocks_sensitive_server_writes(tmp_path: Path):
    session_factory = _make_session_factory(tmp_path)
    with session_factory() as session:
        _seed_user(session, "u-e2e-1")

    app = _build_app(session_factory)
    client = TestClient(app)

    patch_resp = client.patch("/v1/menstrual/settings", json={"on_device_only": True})
    assert patch_resp.status_code == 200
    assert patch_resp.json()["on_device_only"] is True

    bleeding_resp = client.post(
        "/v1/menstrual/bleeding",
        json={
            "date": "2026-02-15",
            "type": "menstruation_start",
            "flow_level": 2,
        },
    )
    assert bleeding_resp.status_code == 409
    assert "On-device only mode is enabled" in bleeding_resp.json()["detail"]

    export_blocked = client.post(
        "/v1/menstrual/export",
        json={"from": "2026-02-01", "to": "2026-02-15", "formats": ["csv"]},
    )
    assert export_blocked.status_code == 409
    assert "allow_server_export=true" in export_blocked.json()["detail"]

    export_allowed = client.post(
        "/v1/menstrual/export",
        json={
            "from": "2026-02-01",
            "to": "2026-02-15",
            "formats": ["csv"],
            "allow_server_export": True,
        },
    )
    assert export_allowed.status_code == 200
    body = export_allowed.json()
    assert body["job_id"]
    assert body["status"] in {"pending", "completed"}

