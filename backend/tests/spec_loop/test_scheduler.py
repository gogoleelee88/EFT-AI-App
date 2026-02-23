# Slice 1: jobs 테이블 존재·DB 기반(Redis 미사용)
# Slice 5: enqueue/poll/set_result DB만, GET /jobs status·result
import pytest

from backend.spec_loop.models import Job
from backend.spec_loop.scheduler.queue import enqueue, poll, set_status_result, get_job


def test_enqueue_poll_set_result_db_only(db_session):
    """결정 5: Job 큐 enqueue → poll → set_status_result, DB만 사용."""
    job_id = enqueue(db_session, "simulation", {"day_id": 1})
    assert job_id > 0
    jobs = poll(db_session, status="pending", limit=5)
    assert len(jobs) >= 1
    ok = set_status_result(db_session, job_id, "completed", {"output": "done"})
    assert ok is True
    job = get_job(db_session, job_id)
    assert job.status == "completed"
    assert job.result.get("output") == "done"


def test_get_jobs_returns_status_result(db_session):
    """GET /jobs/{job_id} → status, result 반환."""
    job_id = enqueue(db_session, "simulation", {"day_id": 99})
    job = get_job(db_session, job_id)
    assert job is not None
    assert job.job_id == job_id
    assert job.status == "pending"
    assert job.result is not None


def test_job_table_exists_and_has_status_result(db_session):
    """결정 5: jobs 테이블 존재, status/result 컬럼, DB만 사용(Redis 미사용)."""
    assert Job.__tablename__ == "jobs"
    assert hasattr(Job, "job_id")
    assert hasattr(Job, "status")
    assert hasattr(Job, "result")
    assert hasattr(Job, "kind")
    assert hasattr(Job, "created_ts")
    assert hasattr(Job, "updated_ts")
    job = Job(status="pending", kind="simulation")
    db_session.add(job)
    db_session.commit()
    assert job.job_id is not None
    db_session.refresh(job)
    assert job.status == "pending"
    assert job.result is None


def test_job_table_db_only():
    """결정 5: Job 큐는 DB 기반, Redis 미사용 — 모듈에 redis import 없음."""
    import backend.spec_loop.models.job as job_module

    with open(job_module.__file__, encoding="utf-8") as f:
        source = f.read()
    assert "import redis" not in source and "from redis" not in source
