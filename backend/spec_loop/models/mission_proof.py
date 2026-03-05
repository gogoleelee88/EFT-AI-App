from __future__ import annotations

from sqlalchemy import Column, Date, DateTime, Integer, JSON, String, UniqueConstraint, func

from backend.database import Base


class MissionProof(Base):
    """
    Stores completion evidence for mission types that require proof
    (time_check/photo).
    """

    __tablename__ = "mission_proofs"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "plan_date",
            "task_uid",
            "mission_type",
            name="uq_mission_proof_user_day_task_type",
        ),
    )

    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    plan_date = Column(Date, nullable=False, index=True)
    task_uid = Column(String(128), nullable=False, index=True)
    mission_type = Column(String(32), nullable=False, index=True)  # time_check | photo

    min_seconds = Column(Integer, nullable=False, default=10)
    scheduled_fire_at_utc = Column(DateTime(timezone=True), nullable=True)
    verified_at_utc = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    data_json = Column(JSON, nullable=True)
    photo_path = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
