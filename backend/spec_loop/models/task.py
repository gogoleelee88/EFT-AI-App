# SPEC C3: Task model ??task_id, title, est_minutes, priority, tags, energy_cost(1-5), pain_sensitive, requires_focus
from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class Task(Base):
    __tablename__ = "tasks"

    task_id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(512), nullable=False)
    est_minutes = Column(Integer, nullable=False)
    priority = Column(Integer, nullable=True)
    tags = Column(JSON, nullable=True)
    energy_cost = Column(Integer, nullable=True)  # 1-5
    pain_sensitive = Column(Boolean, default=False, nullable=False)
    requires_focus = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


