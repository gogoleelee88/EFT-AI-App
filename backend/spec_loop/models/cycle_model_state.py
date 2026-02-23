# Cycle state snapshot for a specific date.
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy import JSON

from backend.database import Base


class CycleModelState(Base):
    __tablename__ = "cycle_model_states"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_cycle_model_states_user_date"),)

    cycle_state_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    date = Column(Date, nullable=False, index=True)
    last_period_start_date = Column(Date, nullable=True)
    avg_cycle_len_days = Column(Integer, nullable=True)
    cycle_len_std_days = Column(Integer, nullable=True)
    irregularity_level = Column(String(8), nullable=False, default="MED")
    phase_prob = Column(JSON, nullable=True)
    next_period_window = Column(JSON, nullable=True)
    confidence = Column(String(16), nullable=False, default="low")
    evidence_snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


