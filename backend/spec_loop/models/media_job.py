# SPEC C3: media_jobs
from sqlalchemy import Column, DateTime, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class MediaJob(Base):
    __tablename__ = "media_jobs"

    media_job_id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String(16), nullable=True)  # img | vid
    status = Column(String(32), nullable=True)
    input_refs = Column(JSON, nullable=True)
    output_url = Column(String(1024), nullable=True)
    created_ts = Column(DateTime(timezone=True), server_default=func.now())


