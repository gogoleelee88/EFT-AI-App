# PM 寃곗젙 2: technique_end_ts (ts + duration_sec濡??쒕쾭 怨꾩궛), 5遺???START???곗텧??
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class ResistanceEvent(Base):
    __tablename__ = "resistance_events"

    event_id = Column(Integer, primary_key=True, autoincrement=True)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.task_id", ondelete="SET NULL"), nullable=True)
    trigger = Column(String(64), nullable=True)
    intensity = Column(Integer, nullable=True)  # 0-10
    context = Column(JSON, nullable=True)
    action = Column(JSON, nullable=True)
    technique_end_ts = Column(DateTime(timezone=True), nullable=True)
    chosen_technique = Column(String(64), nullable=True)
    lock_applied = Column(Integer, nullable=True)
    outcome = Column(JSON, nullable=True)


