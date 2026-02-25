from __future__ import annotations

from datetime import date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import (\n    app,\n)
from backend.meal_coach.authz import Actor
from backend.meal_coach.models import DeviceToken, MealLog, MealSchedulerJob, PostMealCheck
from backend.meal_coach.push_adapter import PushResult
from backend.meal_coach.router import _get_actor
from backend.models.user import User
from backend.spec_loop.models import Condition, DailyConditionSummary, DayPlan


def _headers(idempotency_key: str | None = None) -> dict[str, str]:
    h = {"X-Tenant-Id": "u-test-1"}
    if idempotency_key:
        h["Idempotency-Key"] = idempotency_key
    return h


def _seed_user(session_factory) -> None:
    db = session_factory()
    try:
        db.add(
            User(
                id="u-test-1",
                firebase_uid="fb-u-test-1",
                email="u-test-1@example.com",
                name="Test User",
            )
        )
        db.commit()
    finally:
        db.close()


def _client_and_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    _seed_user(SessionLocal)

    def override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_actor():
        return Actor(user_id="u-test-1", tenant_id="u-test-1", role="Owner")

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[_get_actor] = override_actor
    client = TestClient(app)
    return client, SessionLocal


def _cleanup_overrides() -> None:
    app.dependency_overrides.clear()


def test_v1_routes_registered():
    path_methods: dict[str, set[str]] = {}
    for route in app.routes:
        methods = set(getattr(route, "methods", set()) or set())
        path_methods.setdefault(route.path, set()).update(methods)

    assert "POST" in path_methods.get("/api/v1/meals", set())
    assert "GET" in path_methods.get("/api/v1/meals", set())
    assert "GET" in path_methods.get("/api/v1/meals/{meal_id}", set())
    assert "PATCH" in path_methods.get("/api/v1/meals/{meal_id}", set())
    assert "POST" in path_methods.get("/api/v1/meals/{meal_id}/photos", set())
    assert "POST" in path_methods.get("/api/v1/meals/{meal_id}/photos/upload", set())
    assert "POST" in path_methods.get("/api/v1/meals/{meal_id}/estimate", set())
    assert "GET" in path_methods.get("/api/v1/meals/{meal_id}/estimate", set())
    assert "POST" in path_methods.get("/api/v1/meals/{meal_id}/post-check", set())
    assert "GET" in path_methods.get("/api/v1/meals/{meal_id}/post-checks", set())
    assert "GET" in path_methods.get("/api/v1/meals/{meal_id}/advice", set())
    assert "GET" in path_methods.get("/api/v1/device-tokens", set())
    assert "POST" in path_methods.get("/api/v1/device-tokens", set())
    assert "DELETE" in path_methods.get("/api/v1/device-tokens/{token_id}", set())
    assert "POST" in path_methods.get("/api/v1/scheduler/jobs", set())
    assert "POST" in path_methods.get("/api/v1/scheduler/run-due", set())
    assert "POST" in path_methods.get("/api/v1/notifications/trigger", set())
    assert "GET" in path_methods.get("/api/v1/summaries/weekly", set())
    assert "POST" in path_methods.get("/api/v1/consents", set())
    assert "POST" in path_methods.get("/api/v1/consents/revoke", set())


def test_meal_v1_end_to_end_contract():
    client, _ = _client_and_session_factory()
    try:
        create_resp = client.post(
            "/api/v1/meals",
            json={
                "meal_state": "ATE",
                "meal_time": "2026-02-14T12:10:00+09:00",
                "source": "manual",
            },
            headers=_headers("MEAL-E2E-1"),
        )
        assert create_resp.status_code == 200
        meal = create_resp.json()
        meal_id = meal["meal_id"]
        assert meal["status"] == "logged"

        photo_resp = client.post(
            f"/api/v1/meals/{meal_id}/photos",
            json={
                "photos": [
                    {"storage_uri": "https://example.com/meal1.jpg", "raw_store": False},
                ]
            },
            headers=_headers("MEAL-E2E-2"),
        )
        assert photo_resp.status_code == 200
        assert len(photo_resp.json()["uploaded"]) == 1

        est_resp = client.post(
            f"/api/v1/meals/{meal_id}/estimate",
            json={"track": "AUTO", "force_recompute": True},
            headers=_headers("MEAL-E2E-3"),
        )
        assert est_resp.status_code == 200
        est = est_resp.json()
        assert est["track_used"] in ("A", "B")
        assert 0 <= est["confidence"] <= 1
        assert est["confidence_bucket"] in ("low", "med", "high")

        post_check_resp = client.post(
            f"/api/v1/meals/{meal_id}/post-check",
            json={
                "slot": "T30",
                "sleepiness": 3,
                "focus_drop": 2,
                "sluggishness": 3,
                "gi_discomfort": 1,
                "headache": 0,
                "caffeine_used": False,
            },
            headers=_headers("MEAL-E2E-4"),
        )
        assert post_check_resp.status_code == 200
        post_check = post_check_resp.json()
        assert post_check["slot"] == "T30"
        assert 0 <= post_check["dip_score_partial"] <= 100

        advice_resp = client.get(
            f"/api/v1/meals/{meal_id}/advice",
            headers=_headers(),
        )
        assert advice_resp.status_code == 200
        advice = advice_resp.json()
        assert advice["decision_mode"] in ("DEFER", "PROCEED", "PROCEED_WITH_CAUTION")
        assert advice["task_mode"] in ("RECOVERY", "LIGHT", "DEEP_WORK")
        assert isinstance(advice["next_action"], list)

        summary_resp = client.get("/api/v1/summaries/weekly", headers=_headers())
        assert summary_resp.status_code == 200
        summary = summary_resp.json()
        assert "zero_input_meal_rate" in summary

        consent_resp = client.post(
            "/api/v1/consents",
            json={"consent_type": "wellness_coaching", "version": "2026-02", "granted": True},
            headers=_headers("MEAL-E2E-5"),
        )
        assert consent_resp.status_code == 200
        assert consent_resp.json()["status"] == "recorded"

        revoke_resp = client.post(
            "/api/v1/consents/revoke",
            json={"consent_type": "wellness_coaching", "effective_at": "2026-02-14T13:00:00+09:00"},
            headers=_headers("MEAL-E2E-6"),
        )
        assert revoke_resp.status_code == 200
        assert revoke_resp.json()["status"] == "revoked"

        scheduler_resp = client.post(
            "/api/v1/scheduler/jobs",
            json={
                "meal_id": meal_id,
                "job_type": "POST_CHECK_T30",
                "due_at": "2026-02-14T12:45:00+09:00",
            },
            headers=_headers("MEAL-E2E-7"),
        )
        assert scheduler_resp.status_code == 200
        job_id = scheduler_resp.json()["job_id"]

        trigger_resp = client.post(
            "/api/v1/notifications/trigger",
            json={"job_id": job_id, "channel": "push"},
            headers=_headers("MEAL-E2E-8"),
        )
        assert trigger_resp.status_code == 200
        assert trigger_resp.json()["status"] == "sent"
    finally:
        _cleanup_overrides()


def test_meal_list_and_multipart_photo_upload_contract():
    client, _ = _client_and_session_factory()
    try:
        create_resp = client.post(
            "/api/v1/meals",
            json={"meal_state": "ATE", "source": "manual"},
            headers=_headers("MEAL-LIST-1"),
        )
        assert create_resp.status_code == 200
        meal_id = create_resp.json()["meal_id"]

        upload_resp = client.post(
            f"/api/v1/meals/{meal_id}/photos/upload",
            headers=_headers("MEAL-LIST-2"),
            data={"raw_store": "false"},
            files=[("files", ("meal.jpg", b"\xff\xd8\xff\xe0jpg", "image/jpeg"))],
        )
        assert upload_resp.status_code == 200
        upload_json = upload_resp.json()
        assert len(upload_json["uploaded"]) == 1
        assert upload_json["raw_store"] is False

        list_resp = client.get("/api/v1/meals?limit=10&meal_state=ATE", headers=_headers())
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert len(items) >= 1
        assert items[0]["meal_id"] == meal_id
        assert items[0]["photo_count"] >= 1
    finally:
        _cleanup_overrides()


def test_multipart_photo_upload_auto_estimate_contract(monkeypatch):
    client, _ = _client_and_session_factory()
    try:
        async def fake_auto_estimate(_photos):
            return {
                "track_used": "B",
                "nutrition": {
                    "calories": 640,
                    "carbs_g": 78.0,
                    "protein_g": 29.0,
                    "fat_g": 22.0,
                    "sodium_mg": 980.0,
                },
                "labels": ["high_carb"],
                "confidence": 0.86,
                "uncertainty_reason": ["portion_uncertain"],
                "source_refs": ["openai_responses_vision"],
                "versions": {
                    "engine_version": "nutri-responses-vision-1.0.0",
                    "model_version": "gpt-5.2",
                    "prompt_version": "meal_photo_v1",
                    "dataset_version": "vision_live_2026_02",
                },
            }

        monkeypatch.setattr(
            "backend.meal_coach.router.estimate_nutrition_from_meal_photos",
            fake_auto_estimate,
        )

        create_resp = client.post(
            "/api/v1/meals",
            json={"meal_state": "ATE", "source": "manual"},
            headers=_headers("MEAL-AUTO-1"),
        )
        assert create_resp.status_code == 200
        meal_id = create_resp.json()["meal_id"]

        upload_resp = client.post(
            f"/api/v1/meals/{meal_id}/photos/upload",
            headers=_headers("MEAL-AUTO-2"),
            data={"raw_store": "false"},
            files=[("files", ("meal.jpg", b"\xff\xd8\xff\xe0jpg", "image/jpeg"))],
        )
        assert upload_resp.status_code == 200
        upload_json = upload_resp.json()
        assert len(upload_json["uploaded"]) == 1
        assert upload_json["auto_estimate"]["nutrition"]["calories"] == 640
        assert upload_json["auto_estimate"]["track_used"] == "B"

        est_resp = client.get(f"/api/v1/meals/{meal_id}/estimate", headers=_headers())
        assert est_resp.status_code == 200
        assert est_resp.json()["nutrition"]["protein_g"] == 29.0
    finally:
        _cleanup_overrides()


def test_idempotency_contract_conflict():
    client, _ = _client_and_session_factory()
    try:
        key = "MEAL-IDEM-SAME"
        first = client.post(
            "/api/v1/meals",
            json={"meal_state": "FASTING", "fasting_hours": 14, "source": "manual"},
            headers=_headers(key),
        )
        assert first.status_code == 200
        first_meal_id = first.json()["meal_id"]

        second_same = client.post(
            "/api/v1/meals",
            json={"meal_state": "FASTING", "fasting_hours": 14, "source": "manual"},
            headers=_headers(key),
        )
        assert second_same.status_code == 200
        assert second_same.json()["meal_id"] == first_meal_id

        third_different = client.post(
            "/api/v1/meals",
            json={"meal_state": "ATE", "source": "manual"},
            headers=_headers(key),
        )
        assert third_different.status_code == 409
        assert third_different.json()["detail"] == "IDEMPOTENCY_CONFLICT"
    finally:
        _cleanup_overrides()


def test_bidirectional_sync_meal_to_spec_condition():
    client, session_factory = _client_and_session_factory()
    try:
        db = session_factory()
        try:
            plan = DayPlan(user_id="u-test-1", date=date.today(), mode=70, items=[])
            db.add(plan)
            db.commit()
        finally:
            db.close()

        create_resp = client.post(
            "/api/v1/meals",
            json={"meal_state": "ATE", "source": "manual"},
            headers=_headers("SYNC-A-1"),
        )
        assert create_resp.status_code == 200
        meal_id = create_resp.json()["meal_id"]

        post_check_resp = client.post(
            f"/api/v1/meals/{meal_id}/post-check",
            json={
                "slot": "T30",
                "sleepiness": 3,
                "focus_drop": 3,
                "sluggishness": 2,
                "gi_discomfort": 0,
                "headache": 0,
                "caffeine_used": False,
            },
            headers=_headers("SYNC-A-2"),
        )
        assert post_check_resp.status_code == 200

        db2 = session_factory()
        try:
            summary = (
                db2.query(DailyConditionSummary)
                .filter(DailyConditionSummary.user_id == "u-test-1", DailyConditionSummary.date == date.today())
                .first()
            )
            assert summary is not None
            assert summary.condition_id is not None

            condition = db2.query(Condition).filter(Condition.condition_id == summary.condition_id).first()
            assert condition is not None
            assert isinstance(condition.behavior_inference, dict)
            assert condition.behavior_inference.get("meal_id") == meal_id
            assert condition.behavior_inference.get("synced_from_meal_coach") is True
        finally:
            db2.close()
    finally:
        _cleanup_overrides()


def test_bidirectional_sync_spec_checkin_to_meal():
    client, session_factory = _client_and_session_factory()
    try:
        db = session_factory()
        try:
            plan = DayPlan(user_id="u-test-1", date=date.today(), mode=70, items=[])
            db.add(plan)
            db.commit()
            db.refresh(plan)
            day_id = plan.day_id
        finally:
            db.close()

        checkin_payload = {
            "source_level": 1,
            "min_condition_set": {
                "sleep_hours": "H7_8",
                "fatigue": 5,
                "pain": 2,
                "mood": "ok",
                "period_status": "none",
            },
            "behavior_inference": {
                "inferred": True,
                "post_meal_dip_0_4": 3,
                "focus_drop_0_4": 2,
                "sleepiness_0_4": 3,
                "sluggishness_0_4": 2,
                "post_check_slot": "T30",
            },
            "previous_condition_id": None,
            "day_id": day_id,
            "user_id": "u-test-1",
        }
        checkin_resp = client.post("/api/spec/condition/checkin", json=checkin_payload)
        assert checkin_resp.status_code == 200

        db2 = session_factory()
        try:
            meal = (
                db2.query(MealLog)
                .filter(MealLog.user_id == "u-test-1")
                .order_by(MealLog.created_at.desc())
                .first()
            )
            assert meal is not None
            checks = db2.query(PostMealCheck).filter(PostMealCheck.meal_id == meal.meal_id).all()
            assert len(checks) >= 1
            assert checks[0].slot in ("T30", "T90")
        finally:
            db2.close()
    finally:
        _cleanup_overrides()


def test_scheduler_run_due_dispatch_contract(monkeypatch):
    client, session_factory = _client_and_session_factory()
    try:
        monkeypatch.setattr(
            "backend.meal_coach.service.send_push_notification",
            lambda **kwargs: PushResult(ok=True, provider="mock", message_id="msg-1"),
        )
        create_resp = client.post(
            "/api/v1/meals",
            json={"meal_state": "ATE", "source": "manual"},
            headers=_headers("SCHED-1"),
        )
        assert create_resp.status_code == 200
        meal_id = create_resp.json()["meal_id"]

        db = session_factory()
        try:
            job = (
                db.query(MealSchedulerJob)
                .filter(MealSchedulerJob.meal_id == meal_id, MealSchedulerJob.job_type == "POST_CHECK_T30")
                .first()
            )
            assert job is not None
            job.due_at = datetime.fromisoformat("2026-01-01T00:00:00+00:00")
            db.add(
                DeviceToken(
                    token_id="tok-1",
                    tenant_id="u-test-1",
                    user_id="u-test-1",
                    platform="web",
                    push_token="push-token-1",
                    is_active=True,
                )
            )
            db.commit()
        finally:
            db.close()

        run_resp = client.post(
            "/api/v1/scheduler/run-due",
            json={"limit": 20, "quiet_policy": "next_window", "channel": "push"},
            headers=_headers(),
        )
        assert run_resp.status_code == 200
        body = run_resp.json()
        assert body["processed"] >= 1
        assert body["sent"] >= 1
    finally:
        _cleanup_overrides()


def test_device_token_crud_contract():
    client, _ = _client_and_session_factory()
    try:
        create_resp = client.post(
            "/api/v1/device-tokens",
            json={"platform": "web", "push_token": "tok-abc-12345678", "is_active": True},
            headers=_headers("DT-1"),
        )
        assert create_resp.status_code == 200
        token_id = create_resp.json()["token_id"]

        list_resp = client.get("/api/v1/device-tokens", headers=_headers())
        assert list_resp.status_code == 200
        items = list_resp.json()["items"]
        assert any(it["token_id"] == token_id for it in items)

        delete_resp = client.delete(f"/api/v1/device-tokens/{token_id}", headers=_headers("DT-2"))
        assert delete_resp.status_code == 200
        assert delete_resp.json()["status"] == "deactivated"
    finally:
        _cleanup_overrides()
