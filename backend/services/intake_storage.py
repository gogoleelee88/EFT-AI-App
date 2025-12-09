"""
StrictIntakeInput 데이터 저장 및 n8n 웹훅 전송 서비스
- Supabase PostgreSQL로 7가지 질문 데이터 저장 (AI 학습용)
- n8n 웹훅으로 노션 연동
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
from backend.models.chat_models import StrictIntakeInput

logger = logging.getLogger(__name__)

# SQLAlchemy Base 클래스
Base = declarative_base()


class IntakeDataModel(Base):
    """StrictIntake 데이터 테이블 모델"""
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
    """StrictIntakeInput 데이터 저장 및 전송 서비스 (Supabase PostgreSQL)"""

    def __init__(self, n8n_webhook_url: Optional[str] = None, database_url: Optional[str] = None):
        """
        Args:
            n8n_webhook_url: n8n 웹훅 URL (환경변수에서 가져옴)
            database_url: Supabase PostgreSQL URL (환경변수에서 가져옴)
        """
        self.n8n_webhook_url = n8n_webhook_url

        # DATABASE_URL 가져오기 (환경변수 또는 파라미터)
        self.database_url = database_url or os.getenv("DATABASE_URL")

        if not self.database_url:
            raise ValueError("DATABASE_URL 환경변수가 설정되지 않았습니다!")

        # SQLAlchemy 엔진 생성
        self.engine = create_engine(
            self.database_url,
            pool_pre_ping=True,  # 연결 유효성 검사
            pool_recycle=3600,   # 1시간마다 연결 재생성
            echo=False           # SQL 쿼리 로그 (디버깅 시 True)
        )

        # 세션 팩토리 생성
        self.SessionLocal = sessionmaker(bind=self.engine)

        # 테이블 초기화
        self._init_database()

    def _init_database(self):
        """Supabase PostgreSQL 테이블 생성 (없으면 생성)"""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info(f"✅ Supabase 데이터베이스 테이블 초기화 완료: intake_data")
        except Exception as e:
            logger.error(f"❌ Supabase 테이블 생성 실패: {e}")
            raise

    async def save_intake(
        self,
        intake: StrictIntakeInput,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> int:
        """
        StrictIntakeInput 데이터를 Supabase PostgreSQL에 저장

        Args:
            intake: 7가지 질문 데이터
            session_id: 세션 ID (선택)
            user_id: 사용자 ID (선택)

        Returns:
            저장된 데이터의 ID
        """
        db = self.SessionLocal()
        try:
            # 새 레코드 생성
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
            logger.info(f"[DB 저장 성공] ID: {data_id}, 감정: {intake.core_emotion}, 강도: {intake.intensity}")

            return data_id

        except Exception as e:
            db.rollback()
            logger.error(f"[DB 저장 실패] {e}")
            raise
        finally:
            db.close()

    async def send_to_n8n(self, intake: StrictIntakeInput, data_id: int) -> bool:
        """
        StrictIntakeInput 데이터를 n8n 웹훅으로 전송

        Args:
            intake: 7가지 질문 데이터
            data_id: DB에 저장된 데이터 ID

        Returns:
            전송 성공 여부
        """
        if not self.n8n_webhook_url:
            logger.warning("[n8n] 웹훅 URL이 설정되지 않음 (전송 스킵)")
            return False

        # n8n 전송용 페이로드 구성
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
                    logger.info(f"[n8n 전송 성공] ID: {data_id}, 감정: {intake.core_emotion}")
                    self._update_n8n_status(data_id, success=True)
                    return True
                else:
                    error_msg = f"HTTP {response.status_code}: {response.text}"
                    logger.error(f"[n8n 전송 실패] {error_msg}")
                    self._update_n8n_status(data_id, success=False, error=error_msg)
                    return False

        except Exception as e:
            error_msg = str(e)
            logger.error(f"[n8n 전송 예외] {error_msg}")
            self._update_n8n_status(data_id, success=False, error=error_msg)
            return False

    def _update_n8n_status(self, data_id: int, success: bool, error: Optional[str] = None):
        """n8n 전송 상태 업데이트"""
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
            logger.error(f"[n8n 상태 업데이트 실패] {e}")
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
        StrictIntakeInput 데이터를 저장하고 n8n으로 전송 (통합 함수)

        Returns:
            결과 딕셔너리 (db_saved, db_id, n8n_sent)
        """
        # 1. Supabase 저장
        data_id = await self.save_intake(intake, session_id, user_id)

        # 2. n8n 전송
        n8n_success = await self.send_to_n8n(intake, data_id)

        return {
            "db_saved": True,
            "db_id": data_id,
            "n8n_sent": n8n_success
        }

    def get_statistics(self) -> Dict[str, Any]:
        """저장된 데이터 통계 조회 (관리자용)"""
        db = self.SessionLocal()
        try:
            from sqlalchemy import func

            # 전체 데이터 수
            total_count = db.query(IntakeDataModel).count()

            # 감정별 통계
            emotion_stats = db.query(
                IntakeDataModel.core_emotion,
                func.count(IntakeDataModel.id).label('count')
            ).group_by(IntakeDataModel.core_emotion).all()

            emotion_distribution = {emotion: count for emotion, count in emotion_stats}

            # 평균 강도
            avg_intensity = db.query(func.avg(IntakeDataModel.intensity)).scalar() or 0

            # n8n 전송 통계
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
