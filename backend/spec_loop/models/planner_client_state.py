from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy import JSON

from backend.database import Base


class PlannerClientState(Base):
    __tablename__ = "planner_client_states"
    __table_args__ = (UniqueConstraint("user_id", name="uq_planner_client_states_user"),)

    planner_client_state_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    deadline_goals = Column(JSON, nullable=False, default=list)
    privacy_mappings = Column(JSON, nullable=False, default=list)
    app_only_events = Column(JSON, nullable=False, default=list)
    add_alarm_draft = Column(JSON, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
