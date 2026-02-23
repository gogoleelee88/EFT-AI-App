# 寃곗젙 5: DB 湲곕컲 job ?뚯씠釉? Redis 誘몄궗??
from sqlalchemy import Column, DateTime, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class Job(Base):
    __tablename__ = "jobs"

    job_id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String(32), nullable=True)  # simulation | media | rag
    status = Column(String(32), nullable=False)  # pending | completed | failed
    result = Column(JSON, nullable=True)
    created_ts = Column(DateTime(timezone=True), server_default=func.now())
    updated_ts = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


