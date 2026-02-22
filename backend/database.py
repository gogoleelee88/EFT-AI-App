# backend/database.py

from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import sys
from dotenv import load_dotenv

# backend/.env ??⑥ろ맖 ?β돦裕녻キ?(cwd??.env ??怨몃굵 ??????
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_env_path)
load_dotenv()  # cwd ?リ옇?? .env???β돦裕녻キ?

# Ensure package imports remain stable regardless of uvicorn launch path.
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.append(str(_backend_dir))

# .env??????띠럾??筌뤾쑴湲?(??怨몃さ嶺??β돦裕뉛쭚?SQLite ????    
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./eft_sessions.db"

# SQLite????check_same_thread=False (FastAPI ???х뙴?꾨Ь??筌뤿굞??
_connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

_pool_size = int(os.getenv("SQLALCHEMY_POOL_SIZE", "10"))
_max_overflow = int(os.getenv("SQLALCHEMY_MAX_OVERFLOW", "20"))
_pool_timeout = int(os.getenv("SQLALCHEMY_POOL_TIMEOUT", "30"))
_pool_recycle = int(os.getenv("SQLALCHEMY_POOL_RECYCLE", "1800"))

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=_connect_args,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_timeout=_pool_timeout,
    pool_recycle=_pool_recycle,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

if __package__ == "backend":
    try:
        import backend.spec_loop  # noqa: F401
        import backend.spec_loop.google_calendar.models  # noqa: F401
    except ModuleNotFoundError:
        # Keep server start-up when optional spec_loop package is not included in runtime image.
        pass

    import backend.models.user  # noqa: F401
    import backend.models.refresh_token  # noqa: F401
    import backend.models.proposal_os  # noqa: F401
    import backend.models.menstrual  # noqa: F401
    import backend.app.models.chat  # noqa: F401
    import backend.app.models.coach  # noqa: F401
    import backend.app.models.context_rag  # noqa: F401
    import backend.meal_coach.models  # noqa: F401
    import backend.focus.models  # noqa: F401
else:
    import spec_loop  # noqa: F401
    import spec_loop.google_calendar.models  # noqa: F401
    import models.user  # noqa: F401
    import models.refresh_token  # noqa: F401
    import models.proposal_os  # noqa: F401
    import models.menstrual  # noqa: F401
    import app.models.chat  # noqa: F401
    import app.models.coach  # noqa: F401
    import app.models.context_rag  # noqa: F401
    import meal_coach.models  # noqa: F401
    import focus.models  # noqa: F401

# ??琉돠???낅슣??????貫??(FastAPI Router???????)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()




