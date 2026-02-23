# ?´ë§ ?ì»¤: pending job ì²ë¦¬ ???ë?/ë¯¸ë???¤í ??result ???(ê²°ì 5)
from sqlalchemy.orm import Session

from backend.spec_loop.scheduler.queue import poll, set_status_result
from backend.spec_loop.simulator.service import run_simulation_for_day


def run_once(db: Session) -> int:
    """pending Job??ìµë? 10ê±??´ë§?ì¬ ì²ë¦¬. ì²ë¦¬??ê±´ì ë°í."""
    jobs = poll(db, status="pending", limit=10)
    processed = 0
    for job in jobs:
        if job.kind == "simulation":
            day_id = (job.result or {}).get("day_id")
            if day_id is not None:
                try:
                    result = run_simulation_for_day(day_id)
                    set_status_result(db, job.job_id, "completed", result)
                    processed += 1
                except Exception:
                    set_status_result(db, job.job_id, "failed", {"error": "simulation_failed"})
                    processed += 1
    return processed

