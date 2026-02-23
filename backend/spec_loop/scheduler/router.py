# GET /jobs/{job_id}
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.scheduler.queue import get_job
from backend.spec_loop.scheduler.schemas import JobStatusResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=JobStatusResponse)
def get_jobs_job_id(job_id: int, db: Session = Depends(get_db)) -> JobStatusResponse:
    """job_id, status(pending|completed|failed), kind, result, created_ts. 404."""
    job = get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return JobStatusResponse(
        job_id=job.job_id,
        status=job.status,
        kind=job.kind,
        result=job.result,
        created_ts=job.created_ts,
    )

