# 寃곗젙 5: DB 湲곕컲 Job ?? Redis 誘몄궗??
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.spec_loop.models import Job


def enqueue(db: Session, kind: str, payload: Optional[dict[str, Any]] = None) -> int:
    """Job ?앹꽦(pending), job_id 諛섑솚."""
    job = Job(kind=kind, status="pending", result=payload)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job.job_id


def poll(db: Session, status: str = "pending", limit: int = 10) -> list[Job]:
    """status??Job 紐⑸줉 議고쉶 (created_ts ?ㅻ쫫李⑥닚)."""
    return (
        db.query(Job)
        .filter(Job.status == status)
        .order_by(Job.created_ts.asc())
        .limit(limit)
        .all()
    )


def set_status_result(db: Session, job_id: int, status: str, result: Optional[dict[str, Any]] = None) -> bool:
    """job_id???대떦?섎뒗 Job??status쨌result 媛깆떊."""
    job = db.query(Job).filter(Job.job_id == job_id).first()
    if not job:
        return False
    job.status = status
    if result is not None:
        job.result = result
    db.commit()
    db.refresh(job)
    return True


def get_job(db: Session, job_id: int) -> Optional[Job]:
    """job_id濡?Job 1嫄?議고쉶."""
    return db.query(Job).filter(Job.job_id == job_id).first()

