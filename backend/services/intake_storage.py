"""
StrictIntakeInput ?∞Ïù¥???Ä??Î∞?n8n ?πÌõÖ ?ÑÏÜ° ?úÎπÑ??- Supabase PostgreSQLÎ°?7Í∞ÄÏßÄ ÏßàÎ¨∏ ?∞Ïù¥???Ä??(AI ?ôÏäµ??
- n8n ?πÌõÖ?ºÎ°ú ?∏ÏÖò ?∞Îèô
"""

from dotenv import load_dotenv
import httpx
import os
from datetime import datetime
from typing import Optional, Dict, Any
import logging
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from models.chat_models import StrictIntakeInput

logger = logging.getLogger(__name__)

# SQLAlchemy Base ?¥Îûò??Base = declarative_base()


class IntakeDataModel(Base):
    """StrictIntake ?∞Ïù¥???åÏù¥Î∏?Î™®Îç∏"""
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
    """StrictIntakeInput ?∞Ïù¥???Ä??Î∞??ÑÏÜ° ?úÎπÑ??(Supabase PostgreSQL)"""

    def __init__(self, n8n_webhook_url: Optional[str] = None, database_url: Optional[str] = None):
        """
        Args:
            n8n_webhook_url: n8n ?πÌõÖ URL (?òÍ≤ΩÎ≥Ä?òÏóê??Í∞Ä?∏Ïò¥)
            database_url: Supabase PostgreSQL URL (?òÍ≤ΩÎ≥Ä?òÏóê??Í∞Ä?∏Ïò¥)
        """
        self.n8n_webhook_url = n8n_webhook_url

        # DATABASE_URL Í∞Ä?∏Ïò§Í∏?(?òÍ≤ΩÎ≥Ä???êÎäî ?åÎùºÎØ∏ÌÑ∞)
        self.database_url = database_url or os.getenv("DATABASE_URL")

        if not self.database_url:
            raise ValueError("DATABASE_URL ?òÍ≤ΩÎ≥Ä?òÍ? ?§Ï†ï?òÏ? ?äÏïò?µÎãà??")

        # SQLAlchemy ?îÏßÑ ?ùÏÑ±
        self.engine = create_engine(
            self.database_url,
            pool_pre_ping=True,  # ?∞Í≤∞ ?†Ìö®??Í≤Ä??            pool_recycle=3600,   # 1?úÍ∞ÑÎßàÎã§ ?∞Í≤∞ ?¨ÏÉù??            echo=False           # SQL ÏøºÎ¶¨ Î°úÍ∑∏ (?îÎ≤ÑÍπ???True)
        )

        # ?∏ÏÖò ?©ÌÜ†Î¶??ùÏÑ±
        self.SessionLocal = sessionmaker(bind=self.engine)

        # ?åÏù¥Î∏?Ï¥àÍ∏∞??        self._init_database()

    def _init_database(self):
        """Supabase PostgreSQL ?åÏù¥Î∏??ùÏÑ± (?ÜÏúºÎ©??ùÏÑ±)"""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info(f"??Supabase ?∞Ïù¥?∞Î≤†?¥Ïä§ ?åÏù¥Î∏?Ï¥àÍ∏∞???ÑÎ£å: intake_data")
        except Exception as e:
            logger.error(f"??Supabase ?åÏù¥Î∏??ùÏÑ± ?§Ìå®: {e}")
            raise

    async def save_intake(
        self,
        intake: StrictIntakeInput,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> int:
        """
        StrictIntakeInput ?∞Ïù¥?∞Î? Supabase PostgreSQL???Ä??
        Args:
            intake: 7Í∞ÄÏßÄ ÏßàÎ¨∏ ?∞Ïù¥??            session_id: ?∏ÏÖò ID (?†ÌÉù)
            user_id: ?¨Ïö©??ID (?†ÌÉù)

        Returns:
            ?Ä?•Îêú ?∞Ïù¥?∞Ïùò ID
        """
        db = self.SessionLocal()
        try:
            # ???àÏΩî???ùÏÑ±
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
                immediate_goal=intake.immediate_goal
            )

            db.add(new_record)
            db.commit()
            db.refresh(new_record)

            data_id = new_record.id
            logger.info(f"[DB ?Ä???±Í≥µ] ID: {data_id}, Í∞êÏ†ï: {intake.core_emotion}, Í∞ïÎèÑ: {intake.intensity}")

            return data_id

        except Exception as e:
            db.rollback()
            logger.error(f"[DB ?Ä???§Ìå®] {e}")
            raise
        finally:
            db.close()

    async def send_to_n8n(self, intake: StrictIntakeInput, data_id: int) -> bool:
        """
        StrictIntakeInput ?∞Ïù¥?∞Î? n8n ?πÌõÖ?ºÎ°ú ?ÑÏÜ°

        Args:
            intake: 7Í∞ÄÏßÄ ÏßàÎ¨∏ ?∞Ïù¥??            data_id: DB???Ä?•Îêú ?∞Ïù¥??ID

        Returns:
            ?ÑÏÜ° ?±Í≥µ ?¨Î?
        """
        if not self.n8n_webhook_url:
            logger.warning("[n8n] ?πÌõÖ URL???§Ï†ï?òÏ? ?äÏùå (?ÑÏÜ° ?§ÌÇµ)")
            return False

        # n8n ?ÑÏÜ°???òÏù¥Î°úÎìú Íµ¨ÏÑ±
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
                "immediate_goal": intake.immediate_goal
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self.n8n_webhook_url,
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )

                if response.status_code in [200, 201]:
                    logger.info(f"[n8n ?ÑÏÜ° ?±Í≥µ] ID: {data_id}, Í∞êÏ†ï: {intake.core_emotion}")
                    self._update_n8n_status(data_id, success=True)
                    return True
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text}"
                    logger.error(f"[n8n ?ÑÏÜ° ?§Ìå®] {error_msg}")
                    self._update_n8n_status(data_id, success=False, error=error_msg)
                    return False

        except Exception as e:
            error_msg = str(e)
            logger.error(f"[n8n ?ÑÏÜ° ?àÏô∏] {error_msg}")
            self._update_n8n_status(data_id, success=False, error=error_msg)
            return False

    def _update_n8n_status(self, data_id: int, success: bool, error: Optional[str] = None):
        """n8n ?ÑÏÜ° ?ÅÌÉú ?ÖÎç∞?¥Ìä∏"""
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
            logger.error(f"[n8n ?ÅÌÉú ?ÖÎç∞?¥Ìä∏ ?§Ìå®] {e}")
            db.rollback()
        finally:
            db.close()

    async def save_and_send(
        self,
        intake: StrictIntakeInput,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        StrictIntakeInput ?∞Ïù¥?∞Î? ?Ä?•ÌïòÍ≥?n8n?ºÎ°ú ?ÑÏÜ° (?µÌï© ?®Ïàò)

        Returns:
            Í≤∞Í≥º ?ïÏÖî?àÎ¶¨ (db_saved, db_id, n8n_sent)
        """
        # 1. Supabase ?Ä??        data_id = await self.save_intake(intake, session_id, user_id)

        # 2. n8n ?ÑÏÜ°
        n8n_success = await self.send_to_n8n(intake, data_id)

        return {
            "db_saved": True,
            "db_id": data_id,
            "n8n_sent": n8n_success
        }

    def get_statistics(self) -> Dict[str, Any]:
        """?Ä?•Îêú ?∞Ïù¥???µÍ≥Ñ Ï°∞Ìöå (Í¥ÄÎ¶¨Ïûê??"""
        db = self.SessionLocal()
        try:
            from sqlalchemy import func

            # ?ÑÏ≤¥ ?∞Ïù¥????            total_count = db.query(IntakeDataModel).count()

            # Í∞êÏ†ïÎ≥??µÍ≥Ñ
            emotion_stats = db.query(
                IntakeDataModel.core_emotion,
                func.count(IntakeDataModel.id).label('count')
            ).group_by(IntakeDataModel.core_emotion).all()

            emotion_distribution = {emotion: count for emotion, count in emotion_stats}

            # ?âÍ∑† Í∞ïÎèÑ
            avg_intensity = db.query(func.avg(IntakeDataModel.intensity)).scalar() or 0

            # n8n ?ÑÏÜ° ?µÍ≥Ñ
            n8n_sent_count = db.query(IntakeDataModel).filter(IntakeDataModel.sent_to_n8n == True).count()

            return {
                "total_records": total_count,
                "emotion_distribution": emotion_distribution,
                "average_intensity": round(float(avg_intensity), 2),
                "n8n_sent": n8n_sent_count,
                "n8n_pending": total_count - n8n_sent_count
            }
        finally:
            db.close()

