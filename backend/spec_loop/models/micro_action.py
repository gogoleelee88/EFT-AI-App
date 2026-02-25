from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from backend.database import Base


class MicroAction(Base):
    """Micro action model."""

    __tablename__ = "micro_actions"

    micro_action_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    task_id = Column(
        Integer, ForeignKey("tasks.task_id", ondelete="CASCADE"), nullable=False, index=True
    )

    # action name / description
    name = Column(String(512), nullable=False)
    description = Column(String(1024), nullable=True)
    start_trigger = Column(String(512), nullable=True)

    source = Column(String(32), nullable=False, default="user_custom")
    est_minutes = Column(Integer, nullable=True)

    success_count = Column(Integer, default=0, nullable=False)
    total_count = Column(Integer, default=0, nullable=False)

    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<MicroAction(id={self.micro_action_id}, name='{self.name}', success_rate={self.success_rate:.2%})>"

    @property
    def success_rate(self) -> float:
        if self.total_count == 0:
            return 0.0
        return self.success_count / self.total_count

