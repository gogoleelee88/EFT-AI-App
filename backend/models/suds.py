from enum import Enum
from typing import Optional
from pydantic import BaseModel


class SUDSType(str, Enum):
    MANUAL = "manual"   # 사용자가 슬라이더로 기록
    AUTO = "auto"       # 감정분석기 등 자동 산출
    SYSTEM = "system"   # 시스템 이벤트성 기록


class SUDSEntry(BaseModel):
    trace_id: str
    type: SUDSType
    score: int                      # 0~10 (프로젝트 컨벤션)
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    saved_at: str                   # ISO8601 (UTC)
    timestamp: str                  # 서버 응답 시간(UTC)


class SUDSRequest(BaseModel):
    type: SUDSType
    score: int
    session_id: Optional[str] = None
    user_id: Optional[str] = None


class SUDSResponse(BaseModel):
    ok: bool
    trace_id: str
    saved_at: str
    message: Optional[str] = None