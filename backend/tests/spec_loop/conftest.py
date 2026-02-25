# spec_loop pytest fixtures: DB session, in-memory SQLite for tests
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base

# DayPlan FK to users.id — ensure users table exists
import backend.models.user  # noqa: F401
import backend.models.refresh_token  # noqa: F401


@pytest.fixture(scope="session")
def spec_loop_engine():
    """In-memory SQLite for spec_loop tests (all tables via Base.metadata)."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def db_session(spec_loop_engine):
    """Fresh session per test."""
    Session = sessionmaker(autocommit=False, autoflush=False, bind=spec_loop_engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
