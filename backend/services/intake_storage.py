"""Storage helper for strict intake records and optional n8n webhook forwarding."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

import httpx
import logging
import os

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from backend.models.chat_models import StrictIntakeInput

logger = logging.getLogger(__name__)

Base = declarative_base()


class IntakeDataModel(Base):
    """SQLAlchemy model for strict intake records."""

    __tablename__ = "intake_data"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(255))
    user_id = Column(String(255))
    core_emotion = Column(String(100), nullable=False)
    situation_context = Column(Text, nullable=False)
    automatic_thought = Column(Text, nullable=False)
    physical_sensation = Column(Text)
    behavioral_reaction = Column(Text)
    intensity = Column(Integer, nullable=False)
    available_time = Column(Integer)
    immediate_goal = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    sent_to_n8n = Column(Boolean, default=False)
    n8n_sent_at = Column(DateTime)
    n8n_error = Column(Text)


class IntakeStorageService:
    """Persist strict intake in PostgreSQL and optionally send to n8n."""

    def __init__(self, n8n_webhook_url: Optional[str] = None, database_url: Optional[str] = None):
        self.n8n_webhook_url = n8n_webhook_url
        self.database_url = database_url or os.getenv("DATABASE_URL")
        if not self.database_url:
            raise ValueError("DATABASE_URL is required")

        self.engine = create_engine(
            self.database_url,
            pool_pre_ping=True,
            pool_recycle=3600,
            echo=False,
        )
        self.SessionLocal = sessionmaker(bind=self.engine)
        self._init_database()

    def _init_database(self):
        """Create table schema if missing."""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("[Supabase] intake_data table is ready")
        except Exception as e:
            logger.error(f"[Supabase] failed to initialize table: {e}")
            raise

    async def save_intake(
        self,
        intake: StrictIntakeInput,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> int:
        """Save one strict intake row."""
        db = self.SessionLocal()
        try:
            new_record = IntakeDataModel(
                session_id=session_id,
                user_id=user_id,
                core_emotion=intake.core_emotion,
                situation_context=intake.situation_context,
                automatic_thought=intake.automatic_thought,
                physical_sensation=intake.physical_sensation,
                behavioral_reaction=intake.behavioral_reaction,
                intensity=intake.intensity,
                available_time=intake.available_time,
                immediate_goal=intake.immediate_goal,
            )
            db.add(new_record)
            db.commit()
            db.refresh(new_record)
            data_id = new_record.id
            logger.info(f"[DB] saved ID: {data_id}, emotion={intake.core_emotion}, intensity={intake.intensity}")
            return data_id
        except Exception as e:
            db.rollback()
            logger.error(f"[DB] save failed: {e}")
            raise
        finally:
            db.close()

    async def send_to_n8n(self, intake: StrictIntakeInput, data_id: int) -> bool:
        """Forward intake payload to n8n webhook."""
        if not self.n8n_webhook_url:
            logger.warning("[n8n] webhook url is missing; skip")
            return False

        payload = {
            "data_id": data_id,
            "timestamp": datetime.now().isoformat(),
            "intake_data": {
                "core_emotion": intake.core_emotion,
                "situation_context": intake.situation_context,
                "automatic_thought": intake.automatic_thought,
                "physical_sensation": intake.physical_sensation,
                "behavioral_reaction": intake.behavioral_reaction,
                "intensity": intake.intensity,
                "available_time": intake.available_time,
                "immediate_goal": intake.immediate_goal,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self.n8n_webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

                if response.status_code in [200, 201]:
                    logger.info(f"[n8n] send success: ID={data_id}, emotion={intake.core_emotion}")
                    self._update_n8n_status(data_id, success=True)
                    return True

                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error(f"[n8n] send failed: {error_msg}")
                self._update_n8n_status(data_id, success=False, error=error_msg)
                return False
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[n8n] send exception: {error_msg}")
            self._update_n8n_status(data_id, success=False, error=error_msg)
            return False

    def _update_n8n_status(self, data_id: int, success: bool, error: Optional[str] = None):
        """Update send status for a stored intake row."""
        db = self.SessionLocal()
        try:
            record = db.query(IntakeDataModel).filter(IntakeDataModel.id == data_id).first()
            if record:
                record.sent_to_n8n = success
                if success:
                    record.n8n_sent_at = datetime.utcnow()
                    record.n8n_error = None
                else:
                    record.n8n_error = error
                db.commit()
        except Exception as e:
            logger.error(f"[n8n] update status failed: {e}")
            db.rollback()
        finally:
            db.close()

    async def save_and_send(
        self,
        intake: StrictIntakeInput,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Save to DB and attempt webhook forward."""
        data_id = await self.save_intake(intake, session_id, user_id)
        n8n_success = await self.send_to_n8n(intake, data_id)
        return {"db_saved": True, "db_id": data_id, "n8n_sent": n8n_success}

    def get_statistics(self) -> Dict[str, Any]:
        """Get simple intake statistics."""
        db = self.SessionLocal()
        try:
            from sqlalchemy import func

            total_count = db.query(IntakeDataModel).count()
            emotion_stats = (
                db.query(
                    IntakeDataModel.core_emotion,
                    func.count(IntakeDataModel.id).label("count"),
                )
                .group_by(IntakeDataModel.core_emotion)
                .all()
            )
            emotion_distribution = {emotion: count for emotion, count in emotion_stats}
            avg_intensity = db.query(func.avg(IntakeDataModel.intensity)).scalar() or 0
            n8n_sent_count = db.query(IntakeDataModel).filter(IntakeDataModel.sent_to_n8n == True).count()

            return {
                "total_records": total_count,
                "emotion_distribution": emotion_distribution,
                "average_intensity": round(float(avg_intensity), 2),
                "n8n_sent": n8n_sent_count,
                "n8n_pending": total_count - n8n_sent_count,
            }
        finally:
            db.close()
