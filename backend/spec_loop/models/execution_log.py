# E, PM 寃곗젙 2: event_type enum 蹂寃??놁쓬 (RESISTANCE_TECHNIQUE_END 誘몄텛媛)
# TASK_START, TASK_STOP, TASK_RESUME, TASK_COMPLETE, PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE, LOCK_APPLIED, LOCK_EXPIRED
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.task_id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(64), nullable=False, index=True)
    duration_sec = Column(Integer, nullable=True)
    mode = Column(Integer, nullable=True)
    condition_ref = Column(Integer, nullable=True)
    resistance_event_ref = Column(Integer, nullable=True)
    metrics = Column(JSON, nullable=True)
    context = Column(JSON, nullable=True)


