# PM 寃곗젙 3: day_id(FK) 洹?띾쭔, date 而щ읆 ?놁쓬 (day_plans.date濡??뚯깮)
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from backend.database import Base


class ModeChange(Base):
    __tablename__ = "mode_changes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    day_id = Column(Integer, ForeignKey("day_plans.day_id", ondelete="CASCADE"), nullable=False, index=True)
    from_mode = Column(Integer, nullable=False)
    to_mode = Column(Integer, nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reason = Column(String(256), nullable=True)


