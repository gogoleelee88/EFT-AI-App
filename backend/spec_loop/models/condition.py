# F3: condition_id, ts are server-generated; request has no condition_id
from sqlalchemy import Column, DateTime, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class Condition(Base):
    __tablename__ = "conditions"

    condition_id = Column(Integer, primary_key=True, autoincrement=True)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    source_level = Column(Integer, nullable=True)  # 0 | 1 | 2
    min_condition_set = Column(JSON, nullable=True)
    wearable = Column(JSON, nullable=True)
    behavior_inference = Column(JSON, nullable=True)
    condition_score = Column(Integer, nullable=True)
    inferred_flags = Column(JSON, nullable=True)
    # Extension: keep legacy min_condition_set flow and add domain-specific payload.
    condition_domain = Column(String(32), nullable=False, default="GENERAL")
    metrics = Column(JSON, nullable=True)
    data_quality = Column(String(16), nullable=True)
    confidence = Column(String(16), nullable=True)


