from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.spec_loop.focus_session import service as focus_service
from backend.spec_loop.models import FocusBehaviorSession, RecoveryEvent
from backend.spec_loop.recovery import service as recovery_service
from backend.spec_loop.recovery.schemas import RecoveryEventIn


def _new_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    FocusBehaviorSession.__table__.create(bind=engine)
    RecoveryEvent.__table__.create(bind=engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    return Session()


def test_android_native_recovery_opens_without_frontend_url(monkeypatch):
    session = _new_session()
    try:
        monkeypatch.setattr(focus_service, "_resolve_expected_motion_from_schedule", lambda *args, **kwargs: None)
        monkeypatch.setattr(recovery_service, "_resolve_frontend_base_url", lambda: "")

        focus_service.create_focus_session(
            session,
            user_id="u1",
            schedule_id="task-1",
            mission_run_id=None,
            schedule_type="focus",
            auto_end_existing=True,
        )

        out = recovery_service.create_recovery_event(
            session,
            RecoveryEventIn(
                user_id="u1",
                schedule_id="task-1",
                session_state="in_progress",
                entry_point="distraction_detected",
                distraction_type="SNS",
                confidence=0.84,
                client_platform="android",
                ui_capability="native_sheet",
                source="android_usage_realtime",
            ),
        )

        assert out.action == "open_native"
        assert out.suppressed_reason is None
        assert out.recovery_url is None
    finally:
        session.close()


def test_android_native_recovery_still_requires_active_session_context(monkeypatch):
    session = _new_session()
    try:
        monkeypatch.setattr(recovery_service, "_resolve_frontend_base_url", lambda: "")

        out = recovery_service.create_recovery_event(
            session,
            RecoveryEventIn(
                user_id="u1",
                session_state="in_progress",
                entry_point="distraction_detected",
                distraction_type="SNS",
                confidence=0.84,
                client_platform="android",
                ui_capability="native_sheet",
                source="android_usage_realtime",
            ),
        )

        assert out.action == "ignore"
        assert out.suppressed_reason == "no_active_session"
    finally:
        session.close()


def test_android_native_recovery_includes_eft_strict_url_when_frontend_available(monkeypatch):
    session = _new_session()
    try:
        monkeypatch.setattr(focus_service, "_resolve_expected_motion_from_schedule", lambda *args, **kwargs: None)
        monkeypatch.setattr(recovery_service, "_resolve_frontend_base_url", lambda: "https://app.example.com")

        focus_service.create_focus_session(
            session,
            user_id="u1",
            schedule_id="task-1",
            mission_run_id=None,
            schedule_type="focus",
            auto_end_existing=True,
        )

        out = recovery_service.create_recovery_event(
            session,
            RecoveryEventIn(
                user_id="u1",
                schedule_id="task-1",
                session_state="in_progress",
                entry_point="distraction_detected",
                distraction_type="YouTube",
                confidence=0.84,
                client_platform="android",
                ui_capability="native_sheet",
                source="android_usage_realtime",
            ),
        )

        assert out.action == "open_native"
        assert out.recovery_url is not None
        assert out.recovery_url.startswith("https://app.example.com/eft-strict?")
        assert "entry_sentence=" in out.recovery_url
        assert "schedule_id=task-1" in out.recovery_url
    finally:
        session.close()
