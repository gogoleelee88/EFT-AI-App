from __future__ import annotations

import os
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import inspect, text

# Load env before importing modules that may instantiate Settings/AuthService.
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)
load_dotenv()

from config.settings import get_settings
from database import Base, engine
from utils.logger import get_logger

# Core services (optional initialization at startup)
from services.vllm_client import VLLMClient
from services.prompt_manager import EFTPromptManager
from services.emotion_analyzer import EmotionAnalyzer
from services.intake_storage import IntakeStorageService

# Core routers
from app.api.chat import chat_router as chat_hub_router
from routers.auth import router as auth_router
from routers.compare import router as compare_router
from routers.emotion_candidates import router as emotion_router
from routers.guidance_router import router as guidance_router
from routers.health import router as health_router
from routers.intake import router as intake_router
from routers.menstrual import router as menstrual_router
from routers.notion import router as notion_router
from routers.notion_oauth import router as notion_oauth_router
from routers.profile import router as profile_router
from routers.push import router as push_router
from routers.recommend_router import router as recommend_router
from routers.suds import router as suds_router
from routers.work_guide import router as work_guide_router
from meal_coach.router import router as meal_coach_router

# Proposal OS routers
from routers.profiles import router as proposal_profiles_router
from routers.proposals import router as proposal_router
from routers.signals import router as proposal_signals_router

# spec_loop routers
from spec_loop.adapter.router import router as spec_adapt_router
from spec_loop.coach.router import router as spec_resistance_router
from spec_loop.condition.router import router as spec_condition_router
from spec_loop.cycle.router import router as spec_cycle_router
from spec_loop.google_calendar.router import router as spec_google_router
from spec_loop.mission.router import router as spec_mission_router
from spec_loop.mission.verify_router import router as spec_mission_verify_router
from spec_loop.plan_patch.router import router as spec_plan_patch_router
from spec_loop.planner.router import router as spec_plan_router
from spec_loop.scheduler.router import router as spec_jobs_router
from spec_loop.simulator.router import router as spec_simulate_router
from spec_loop.behavior.router import router as spec_behavior_router
from spec_loop.focus_session.router import router as spec_focus_session_router
from spec_loop.reminder.router import router as spec_reminder_router
from spec_loop.reminder.runtime import start_reminder_ticker_if_enabled, stop_reminder_ticker
from focus.router import router as focus_router

settings = get_settings()
logger = get_logger(__name__)


def _ensure_google_mapping_columns() -> None:
    """
    Backfill columns that older deployments may miss on google_event_mappings.
    create_all() does not alter existing tables, so we patch forward safely.
    """
    try:
        inspector = inspect(engine)
        if "google_event_mappings" not in inspector.get_table_names():
            return

        existing = {col["name"] for col in inspector.get_columns("google_event_mappings")}
        if not existing:
            return

        dialect = engine.dialect.name
        statements: list[str] = []

        if "privacy_mode" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN IF NOT EXISTS privacy_mode VARCHAR(16) NOT NULL DEFAULT 'NORMAL'"
                )
            else:
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN privacy_mode VARCHAR(16) DEFAULT 'NORMAL'"
                )
        if "privacy_key" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN IF NOT EXISTS privacy_key VARCHAR(255)"
                )
            else:
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN privacy_key VARCHAR(255)"
                )
        if "display_title" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN IF NOT EXISTS display_title VARCHAR(255)"
                )
            else:
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN display_title VARCHAR(255)"
                )
        if "display_description" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN IF NOT EXISTS display_description TEXT"
                )
            else:
                statements.append(
                    "ALTER TABLE google_event_mappings "
                    "ADD COLUMN display_description TEXT"
                )

        if not statements:
            return

        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

        logger.info(
            "google_event_mappings schema patched: added %s",
            ", ".join(
                name
                for name in ("privacy_mode", "privacy_key", "display_title", "display_description")
                if name not in existing
            ),
        )
    except Exception:
        logger.exception("google_event_mappings schema patch failed")


def _ensure_day_plan_security_columns() -> None:
    """
    Backfill security-friendly columns for day_plans without breaking old DBs.
    """
    try:
        inspector = inspect(engine)
        if "day_plans" not in inspector.get_table_names():
            return

        existing = {col["name"] for col in inspector.get_columns("day_plans")}
        if not existing:
            return

        dialect = engine.dialect.name
        statements: list[str] = []

        if "deleted_at" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE day_plans "
                    "ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL"
                )
            else:
                statements.append("ALTER TABLE day_plans ADD COLUMN deleted_at DATETIME NULL")

        if "version" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE day_plans "
                    "ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1"
                )
            else:
                statements.append("ALTER TABLE day_plans ADD COLUMN version INTEGER NOT NULL DEFAULT 1")

        if not statements:
            return

        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

        logger.info(
            "day_plans schema patched: added %s",
            ", ".join(name for name in ("deleted_at", "version") if name not in existing),
        )
    except Exception:
        logger.exception("day_plans schema patch failed")


def _ensure_chat_contact_columns() -> None:
    """Backfill chat_room.contact_id for existing deployments."""
    try:
        inspector = inspect(engine)
        if "chat_room" not in inspector.get_table_names():
            return

        existing = {col["name"] for col in inspector.get_columns("chat_room")}
        if "contact_id" in existing:
            return

        dialect = engine.dialect.name
        statements: list[str] = []
        if dialect == "postgresql":
            statements.append("ALTER TABLE chat_room ADD COLUMN IF NOT EXISTS contact_id VARCHAR(36)")
        else:
            statements.append("ALTER TABLE chat_room ADD COLUMN contact_id VARCHAR(36)")
        statements.append("CREATE INDEX IF NOT EXISTS ix_chat_room_contact_id ON chat_room(contact_id)")

        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))
        logger.info("chat_room schema patched: added contact_id")
    except Exception:
        logger.exception("chat_room contact_id schema patch failed")


def _ensure_focus_behavior_columns() -> None:
    """Backfill columns for candidate/session integration without requiring full migration."""
    try:
        inspector = inspect(engine)
        if "activity_candidates" not in inspector.get_table_names():
            return
        existing = {col["name"] for col in inspector.get_columns("activity_candidates")}
        if not existing:
            return

        dialect = engine.dialect.name
        statements: list[str] = []

        if "focus_session_id" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE activity_candidates "
                    "ADD COLUMN IF NOT EXISTS focus_session_id VARCHAR(64)"
                )
            else:
                statements.append("ALTER TABLE activity_candidates ADD COLUMN focus_session_id VARCHAR(64)")
            statements.append(
                "CREATE INDEX IF NOT EXISTS ix_activity_candidates_focus_session_id "
                "ON activity_candidates (focus_session_id)"
            )
        if "schedule_id" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE activity_candidates "
                    "ADD COLUMN IF NOT EXISTS schedule_id VARCHAR(128)"
                )
            else:
                statements.append("ALTER TABLE activity_candidates ADD COLUMN schedule_id VARCHAR(128)")
        if "schedule_type" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE activity_candidates "
                    "ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(32)"
                )
            else:
                statements.append("ALTER TABLE activity_candidates ADD COLUMN schedule_type VARCHAR(32)")

        if not statements:
            return

        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

        logger.info("activity_candidates schema patched with focus context columns")
    except Exception:
        logger.exception("focus behavior schema patch failed")

    try:
        inspector = inspect(engine)
        if "focus_behavior_sessions" not in inspector.get_table_names():
            return
        existing = {col["name"] for col in inspector.get_columns("focus_behavior_sessions")}
        if not existing:
            return

        dialect = engine.dialect.name
        statements: list[str] = []
        if "expected_motion" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE focus_behavior_sessions "
                    "ADD COLUMN IF NOT EXISTS expected_motion VARCHAR(32)"
                )
                statements.append(
                    "CREATE INDEX IF NOT EXISTS ix_focus_behavior_sessions_expected_motion "
                    "ON focus_behavior_sessions (expected_motion)"
                )
            else:
                statements.append("ALTER TABLE focus_behavior_sessions ADD COLUMN expected_motion VARCHAR(32)")
                statements.append(
                    "CREATE INDEX ix_focus_behavior_sessions_expected_motion "
                    "ON focus_behavior_sessions (expected_motion)"
                )

        if not statements:
            return

        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

        if "expected_motion" not in existing:
            logger.info("focus_behavior_sessions schema patched with expected_motion")
    except Exception:
        logger.exception("focus_behavior_sessions expected_motion schema patch failed")


def _ensure_clarification_question_columns() -> None:
    """Backfill focus context on clarification questions for soft-nudge tracing."""
    try:
        inspector = inspect(engine)
        if "clarification_questions" not in inspector.get_table_names():
            return
        existing = {col["name"] for col in inspector.get_columns("clarification_questions")}
        if not existing:
            return

        dialect = engine.dialect.name
        statements: list[str] = []

        if "focus_session_id" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE clarification_questions "
                    "ADD COLUMN IF NOT EXISTS focus_session_id VARCHAR(64)"
                )
            else:
                statements.append("ALTER TABLE clarification_questions ADD COLUMN focus_session_id VARCHAR(64)")

        if "schedule_id" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE clarification_questions "
                    "ADD COLUMN IF NOT EXISTS schedule_id VARCHAR(128)"
                )
            else:
                statements.append("ALTER TABLE clarification_questions ADD COLUMN schedule_id VARCHAR(128)")

        if "schedule_type" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE clarification_questions "
                    "ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(32)"
                )
            else:
                statements.append("ALTER TABLE clarification_questions ADD COLUMN schedule_type VARCHAR(32)")

        if "ix_clarification_questions_focus_session_id" not in {idx["name"] for idx in inspector.get_indexes("clarification_questions")}:
            if dialect == "postgresql":
                statements.append(
                    "CREATE INDEX IF NOT EXISTS ix_clarification_questions_focus_session_id "
                    "ON clarification_questions (focus_session_id)"
                )
            else:
                statements.append(
                    "CREATE INDEX ix_clarification_questions_focus_session_id "
                    "ON clarification_questions (focus_session_id)"
                )

        if "ix_clarification_questions_schedule_id" not in {idx["name"] for idx in inspector.get_indexes("clarification_questions")}:
            if dialect == "postgresql":
                statements.append(
                    "CREATE INDEX IF NOT EXISTS ix_clarification_questions_schedule_id "
                    "ON clarification_questions (schedule_id)"
                )
            else:
                statements.append(
                    "CREATE INDEX ix_clarification_questions_schedule_id "
                    "ON clarification_questions (schedule_id)"
                )

        if not statements:
            return

        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

        logger.info("clarification_questions schema patched with focus context columns")
    except Exception:
        logger.exception("clarification question schema patch failed")


def _ensure_reminder_columns() -> None:
    """Backfill reminder schema columns for existing databases."""
    try:
        inspector = inspect(engine)
        if "reminder_jobs" not in inspector.get_table_names():
            return

        existing = {col["name"] for col in inspector.get_columns("reminder_jobs")}

        dialect = engine.dialect.name
        statements: list[str] = []

        if "channel" not in existing:
            if dialect == "postgresql":
                statements.append(
                    "ALTER TABLE reminder_jobs "
                    "ADD COLUMN IF NOT EXISTS channel VARCHAR(24) NOT NULL DEFAULT 'webpush'"
                )
            else:
                statements.append(
                    "ALTER TABLE reminder_jobs "
                    "ADD COLUMN channel VARCHAR(24) DEFAULT 'webpush'"
                )

        if dialect == "postgresql":
            # Legacy DBs may still have old unique key without channel.
            statements.append("ALTER TABLE reminder_jobs DROP CONSTRAINT IF EXISTS uq_reminder_job_stable")
            statements.append(
                "ALTER TABLE reminder_jobs "
                "ADD CONSTRAINT uq_reminder_job_stable "
                "UNIQUE (user_id, plan_date, task_uid, alarm_time_local, repeat_rule, channel)"
            )

        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))
        if statements:
            logger.info("reminder_jobs schema patched")
    except Exception:
        logger.exception("reminder_jobs schema patch failed")


app = FastAPI(
    title="EFT AI Service",
    description="EFT and planning backend service",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)


@app.on_event("startup")
async def startup_event() -> None:
    """Initialize app state and ensure DB tables exist."""
    logger.info("server startup begin")

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("database tables ensured")
    except Exception:
        logger.exception("database create_all failed")

    _ensure_google_mapping_columns()
    _ensure_day_plan_security_columns()
    _ensure_chat_contact_columns()
    _ensure_focus_behavior_columns()
    _ensure_clarification_question_columns()
    _ensure_reminder_columns()

    # Optional services: keep startup resilient.
    try:
        app.state.vllm = VLLMClient()
    except Exception:
        logger.exception("vllm client init failed")
        app.state.vllm = None

    try:
        app.state.prompt_manager = EFTPromptManager()
    except Exception:
        logger.exception("prompt manager init failed")
        app.state.prompt_manager = None

    try:
        app.state.emotion_analyzer = EmotionAnalyzer()
    except Exception:
        logger.exception("emotion analyzer init failed")
        app.state.emotion_analyzer = None

    try:
        n8n_webhook_url = os.getenv("N8N_WEBHOOK_URL", "").strip() or None
        app.state.intake_storage = IntakeStorageService(n8n_webhook_url=n8n_webhook_url)
    except Exception:
        logger.exception("intake storage init failed")
        app.state.intake_storage = None

    try:
        await start_reminder_ticker_if_enabled()
    except Exception:
        logger.exception("reminder ticker init failed")

    logger.info("server startup done")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    try:
        await stop_reminder_ticker()
    except Exception:
        logger.exception("reminder ticker shutdown failed")
    logger.info("server shutdown")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "path": request.url.path,
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled exception path=%s", request.url.path)
    payload = {
        "error_code": "INTERNAL_SERVER_ERROR",
        "message": "Internal server error.",
    }
    if settings.DEBUG:
        payload["detail"] = str(exc)
    return JSONResponse(status_code=500, content=payload)


# CORS
def _normalize_allowed_origins(origins: list[str]) -> list[str]:
    allow_credentials = True
    normalized: list[str] = []
    for origin in origins:
        value = (origin or "").strip()
        if not value:
            continue
        if allow_credentials and value == "*":
            logger.warning(
                "CORS allow_origins contains '*' while allow_credentials=True; "
                "wildcard is ignored for safety."
            )
            continue
        if value not in normalized:
            normalized.append(value)
    return normalized


def _build_origin_regex() -> str:
    return (
        r"^https?://("
        r"localhost"
        r"|127\.0\.0\.1"
        r"|192\.168\.\d{1,3}\.\d{1,3}"
        r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|172\.(1\d|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r")(:(\d{1,5}))?$"
    )


extra = (settings.EXTRA_ALLOWED_ORIGINS or "").strip()
origins: list[str] = list(settings.ALLOWED_ORIGINS)
if extra:
    origins.extend([o.strip() for o in extra.split(",") if o.strip()])


def _extract_origin(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    try:
        parsed = urlparse(raw.strip())
    except Exception:
        return None

    scheme = (parsed.scheme or "").lower()
    host = (parsed.hostname or "").strip()
    if not scheme or not host:
        return None

    if parsed.port:
        return f"{scheme}://{host}:{parsed.port}"
    return f"{scheme}://{host}"


for _frontend_origin in (getattr(settings, "FRONTEND_URL", None), settings.FRONTEND_DASHBOARD_URL):
    origin_value = _extract_origin(_frontend_origin)
    if origin_value:
        origins.append(origin_value)

allow_origins = _normalize_allowed_origins(origins)
if not allow_origins:
    allow_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

force_all_origins = os.getenv("RENDER_CORS_ALLOW_ALL_ORIGINS", "").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)

if force_all_origins:
    allow_origins = ["*"]
    cors_kwargs = {
        "allow_origins": ["*"],
        "allow_credentials": False,
    }
else:
    cors_kwargs = {
        "allow_origins": list(dict.fromkeys(allow_origins)),
        "allow_credentials": True,
    }

if settings.DEBUG:
    # Keep local dev accessible even when IP changes (e.g. mobile/PC on LAN)
    cors_kwargs["allow_origin_regex"] = _build_origin_regex()
    cors_kwargs.update({
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    })
else:
    cors_kwargs.update({
        "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Authorization", "Content-Type", "X-API-Key"],
    })

app.add_middleware(CORSMiddleware, **cors_kwargs)


@app.get("/")
async def root() -> dict[str, object]:
    return {
        "service": "eft-ai",
        "status": "ok",
        "docs": "/docs" if settings.DEBUG else None,
    }


# Router registration order (health/chat first)
app.include_router(health_router)
app.include_router(chat_hub_router)

app.include_router(emotion_router)
app.include_router(guidance_router)
app.include_router(recommend_router)
app.include_router(work_guide_router)

app.include_router(compare_router)
app.include_router(suds_router)
app.include_router(notion_router)
app.include_router(auth_router)
app.include_router(notion_oauth_router)
app.include_router(profile_router)
app.include_router(push_router)
app.include_router(intake_router)
app.include_router(menstrual_router)
app.include_router(meal_coach_router, prefix="/api/v1")

# Proposal OS
app.include_router(proposal_profiles_router)
app.include_router(proposal_signals_router)
app.include_router(proposal_router)

# spec_loop
app.include_router(spec_condition_router, prefix="/api/spec")
app.include_router(spec_adapt_router, prefix="/api/spec")
app.include_router(spec_plan_router, prefix="/api/spec")
app.include_router(spec_resistance_router, prefix="/api/spec")
app.include_router(spec_jobs_router, prefix="/api/spec")
app.include_router(spec_simulate_router, prefix="/api/spec")
app.include_router(spec_google_router, prefix="/api/spec")
app.include_router(spec_cycle_router, prefix="/api/spec")
app.include_router(spec_plan_patch_router, prefix="/api/spec")
app.include_router(spec_mission_router, prefix="/api")
app.include_router(spec_mission_verify_router, prefix="/api")
app.include_router(spec_behavior_router, prefix="/api/spec")
app.include_router(spec_focus_session_router, prefix="/api/spec")
app.include_router(spec_reminder_router, prefix="/api")
app.include_router(focus_router, prefix="/api")


# Optional SPA catch-all
STATIC_DIR = Path("static-frontend")
if STATIC_DIR.exists():
    @app.get("/{catchall:path}")
    async def spa_catchall(catchall: str):
        if catchall.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        file_path = STATIC_DIR / catchall
        if file_path.is_file():
            return FileResponse(file_path)

        index_path = STATIC_DIR / "index.html"
        if index_path.is_file():
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info" if settings.DEBUG else "warning",
    )


