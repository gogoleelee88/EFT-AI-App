# backend/database.py

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

# .env에서 가져옴
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# 연결 엔진 생성
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# 세션 생성기
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 모델용 베이스 클래스
Base = declarative_base()

# 의존성 주입용 함수 (FastAPI Router에서 씀)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()