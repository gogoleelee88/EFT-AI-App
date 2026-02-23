# POST /simulate/day ??202 job_id
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.models import DayPlan
from backend.spec_loop.scheduler.queue import enqueue
from backend.spec_loop.simulator.schemas import SimulateDayRequest

router = APIRouter(prefix="/simulate", tags=["simulate"])


@router.post("/day")
def post_simulate_day(body: SimulateDayRequest, db: Session = Depends(get_db)):
    """day_id ??202 Accepted, job_id 반환. 400/404/422."""
    plan = db.query(DayPlan).filter(DayPlan.day_id == body.day_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="day_id not found")

    job_id = enqueue(db, "simulation", {"day_id": body.day_id})
    return JSONResponse(content={"job_id": job_id}, status_code=202)

