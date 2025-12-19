from enum import Enum
from typing import Optional
from pydantic import BaseModel

import os
from sqlalchemy import text
from sqlalchemy import create_engine


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

def _persist_suds(request: SUDSRequest) -> tuple[str, str]:
    trace_id = uuid4().hex
    saved_at = datetime.now(timezone.utc).isoformat()
    entry = SUDSEntry(
        trace_id=trace_id,
        type=request.type,  # type: ignore[arg-type]
        score=request.score,
        session_id=request.session_id,
        user_id=request.user_id,
        saved_at=saved_at,
        timestamp=saved_at,
    )
    try:
        append_suds(entry)

        # --- NEW: persist to Supabase (optional, best-effort) ---
        database_url = os.getenv("DATABASE_URL")
        if database_url and request.session_id:
            try:
                engine = create_engine(database_url, pool_pre_ping=True, pool_recycle=3600, echo=False)
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            """
                            insert into public.suds_records (session_id, score, note, created_at)
                            values (:session_id, :score, :note, now())
                            """
                        ),
                        {
                            "session_id": request.session_id,
                            "score": int(request.score),
                            "note": getattr(request, "note", None),
                        },
                    )
            except Exception:
                logger.exception("Failed to write SUDS to Supabase", extra={"trace_id": trace_id})
        # --- /NEW ---

    except Exception:
        logger.exception("Failed to persist SUDS entry", extra={"trace_id": trace_id})
        raise HTTPException(status_code=500, detail="Failed to persist SUDS entry") from None
    return trace_id, saved_at


