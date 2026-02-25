# SPEC C3, F5, PM 寃곗젙 3: 1 user + 1 date = 1 DayPlan, UNIQUE(user_id, date)
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy import JSON

from backend.database import Base


class DayPlan(Base):
    __tablename__ = "day_plans"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_day_plans_user_date"),)

    day_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    date = Column(Date, nullable=False, index=True)
    mode = Column(Integer, nullable=False)  # 100 | 70 | 40
    # items: [{ item_id, task_id, planned_block_minutes, micro_steps[] }]
    items = Column(JSON, nullable=True)
    protected_block_minutes = Column(Integer, nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


