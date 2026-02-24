from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app
from backend.meal_coach.authz import Actor
from backend.meal_coach.router import _get_actor
from backend.models.user import User
from backend.spec_loop.models import DayPlan


def _headers(idempotency_key: str | None = None) -> dict[str, str]:
    h = {"X-Tenant-Id": "u-smoke-1"}
    if idempotency_key:
        h["Idempotency-Key"] = idempotency_key
    return h


def main() -> int:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = session_local()
    try:
        db.add(
            User(
                id="u-smoke-1",
                firebase_uid="fb-u-smoke-1",
                email="u-smoke-1@example.com",
                name="Smoke User",
            )
        )
        db.add(DayPlan(user_id="u-smoke-1", date=date.today(), mode=70, items=[]))
        db.commit()
    finally:
        db.close()

    def override_get_db():
        db2 = session_local()
        try:
            yield db2
        finally:
            db2.close()

    def override_actor():
        return Actor(user_id="u-smoke-1", tenant_id="u-smoke-1", role="Owner")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[_get_actor] = override_actor

    try:
        client = TestClient(app)

        # 1) meals
        r1 = client.post(
            "/api/v1/meals",
            json={"meal_state": "ATE", "source": "manual"},
            headers=_headers("SMOKE-1"),
        )
        assert r1.status_code == 200, r1.text
        meal_id = r1.json()["meal_id"]

        # 2) photos/upload
        r2 = client.post(
            f"/api/v1/meals/{meal_id}/photos/upload",
            data={"raw_store": "false"},
            files=[("files", ("meal.jpg", b"\xff\xd8\xff\xe0jpg", "image/jpeg"))],
            headers=_headers("SMOKE-2"),
        )
        assert r2.status_code == 200, r2.text
        assert len(r2.json().get("uploaded", [])) == 1, r2.text

        # 3) estimate
        r3 = client.post(
            f"/api/v1/meals/{meal_id}/estimate",
            json={"track": "AUTO", "force_recompute": True},
            headers=_headers("SMOKE-3"),
        )
        assert r3.status_code == 200, r3.text

        # 4) post-check
        r4 = client.post(
            f"/api/v1/meals/{meal_id}/post-check",
            json={
                "slot": "T30",
                "sleepiness": 2,
                "focus_drop": 2,
                "sluggishness": 2,
                "gi_discomfort": 0,
                "headache": 0,
                "caffeine_used": False,
            },
            headers=_headers("SMOKE-4"),
        )
        assert r4.status_code == 200, r4.text

        # 5) advice
        r5 = client.get(f"/api/v1/meals/{meal_id}/advice", headers=_headers())
        assert r5.status_code == 200, r5.text
        out = r5.json()
        assert out.get("decision_mode"), r5.text
        assert out.get("task_mode"), r5.text
        assert isinstance(out.get("next_action"), list), r5.text

        print("SMOKE_OK")
        print("meal_id:", meal_id)
        print("advice:", {"decision_mode": out["decision_mode"], "task_mode": out["task_mode"]})
        return 0
    finally:
        app.dependency_overrides.clear()


if __name__ == "__main__":
    raise SystemExit(main())

