# backend/database.py

from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# backend/.env ?°ì„  ë¡œë“œ (cwd??.env ?†ì„ ???€ë¹?
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_env_path)
load_dotenv()  # cwd ê¸°ì? .env??ë¡œë“œ

# .env?ì„œ ê°€?¸ì˜´ (?†ìœ¼ë©?ë¡œì»¬ SQLite ?¬ìš©)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL") or "sqlite:///./eft_sessions.db"

# SQLite????check_same_thread=False (FastAPI ë¹„ë™ê¸??¸í™˜)
_connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args=_connect_args)

# ?¸ì…˜ ?ì„±ê¸?SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ëª¨ë¸??ë² ì´???´ë˜??Base = declarative_base()

# spec_loop ?Œì´ë¸??±ë¡ (create_all ???¨ê»˜ ?ì„±)
import spec_loop.models  # noqa: F401
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

# ?˜ì¡´??ì£¼ì…???¨ìˆ˜ (FastAPI Router?ì„œ ?€)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

