from datetime import datetime
import sys

from sqlalchemy import Column, DateTime, Integer, String, Text

from backend.database import Base

# Keep a single module instance even when imported via both package paths.
if __name__ == "backend.spec_loop.google_calendar.models":
    sys.modules.setdefault("spec_loop.google_calendar.models", sys.modules[__name__])
elif __name__ == "spec_loop.google_calendar.models":
    sys.modules.setdefault("backend.spec_loop.google_calendar.models", sys.modules[__name__])

class GoogleToken(Base):
    """????癒??Google OAuth ?醫뤾쿃 ???關??"""

    __tablename__ = "google_tokens"

    user_id = Column(String(64), primary_key=True, index=True)
    token_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class GoogleEventMapping(Base):
    """?怨뺚봺 Task/DayPlan?? Google ??源??揶?筌띲끋釉?

    Phase 3: Task ??Google Calendar export ????밴쉐.
    """

    __tablename__ = "google_event_mappings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    task_id = Column(Integer, nullable=False)
    calendar_id = Column(String(128), nullable=False, default="primary")
    google_event_id = Column(String(256), nullable=False)
    privacy_mode = Column(String(16), nullable=False, default="NORMAL")
    privacy_key = Column(String(255), nullable=True)
    display_title = Column(String(255), nullable=True)
    display_description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )



