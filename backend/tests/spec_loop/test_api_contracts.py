# Slice 1: DB·모델·검증 기초 — API 계약/모델 필드·event_type·저장 스키마
from backend.spec_loop.models import Task, DayPlan, Condition, ExecutionLog, ResistanceEvent
from backend.spec_loop.validation import ConditionStored, ExecutionLogStored, ResistanceEventStored
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType


def test_task_model_fields():
    """SPEC C3: tasks — task_id, title, est_minutes, priority, tags, energy_cost(1-5), pain_sensitive, requires_focus."""
    assert hasattr(Task, "task_id")
    assert hasattr(Task, "title")
    assert hasattr(Task, "est_minutes")
    assert hasattr(Task, "priority")
    assert hasattr(Task, "tags")
    assert hasattr(Task, "energy_cost")
    assert hasattr(Task, "pain_sensitive")
    assert hasattr(Task, "requires_focus")
    assert Task.__tablename__ == "tasks"


def test_day_plan_model_fields():
    """SPEC C3, F5, PM 결정 3: day_plans — day_id, user_id, date, mode(100/70/40), items, protected_block_minutes, UNIQUE(user_id, date)."""
    assert hasattr(DayPlan, "day_id")
    assert hasattr(DayPlan, "user_id")
    assert hasattr(DayPlan, "date")
    assert hasattr(DayPlan, "mode")
    assert hasattr(DayPlan, "items")
    assert hasattr(DayPlan, "protected_block_minutes")
    assert hasattr(DayPlan, "created_at")
    assert hasattr(DayPlan, "updated_at")
    assert DayPlan.__tablename__ == "day_plans"
    uc = [c for c in DayPlan.__table__.constraints if c.name == "uq_day_plans_user_date"]
    assert len(uc) == 1


def test_condition_model_has_id_ts_storage_schema():
    """F3: Condition model has condition_id, ts (server-generated). Request has no condition_id; storage/response schema has condition_id."""
    assert hasattr(Condition, "condition_id")
    assert hasattr(Condition, "ts")
    assert hasattr(Condition, "min_condition_set")
    assert hasattr(Condition, "condition_score")
    assert Condition.__tablename__ == "conditions"
    assert "condition_id" in ConditionStored.model_fields
    assert "ts" in ConditionStored.model_fields


def test_condition_model_no_id_in_request():
    """F3, 충돌 해결: 요청(CheckinRequest)에는 condition_id 없음; 저장/응답에만 condition_id·ts."""
    assert "condition_id" in ConditionStored.model_fields
    assert "ts" in ConditionStored.model_fields
    # CheckinRequest is in Slice 2; here we only assert storage schema has id/ts


def test_execution_log_event_types():
    """E, PM 결정 2: event_type enum 변경 없음. RESISTANCE_TECHNIQUE_END 미추가."""
    allowed = {
        ExecutionLogEventType.TASK_START,
        ExecutionLogEventType.TASK_STOP,
        ExecutionLogEventType.TASK_RESUME,
        ExecutionLogEventType.TASK_COMPLETE,
        ExecutionLogEventType.PLAN_COMMIT,
        ExecutionLogEventType.ADAPT_APPLIED,
        ExecutionLogEventType.MODE_CHANGE,
        ExecutionLogEventType.LOCK_APPLIED,
        ExecutionLogEventType.LOCK_EXPIRED,
    }
    assert len(allowed) == 9
    assert not hasattr(ExecutionLogEventType, "RESISTANCE_TECHNIQUE_END")
    assert ExecutionLog.__tablename__ == "execution_logs"
    assert hasattr(ExecutionLog, "event_type")


def test_resistance_event_has_technique_end_ts():
    """PM 결정 2: resistance_events — technique_end_ts (5분 내 START율 산출용)."""
    assert hasattr(ResistanceEvent, "technique_end_ts")
    assert hasattr(ResistanceEvent, "ts")
    assert hasattr(ResistanceEvent, "action")
    assert "technique_end_ts" in ResistanceEventStored.model_fields


def test_mode_changes_day_id_only():
    """PM 결정 3: mode_changes — day_id(FK) 귀속만, date 컬럼 없음."""
    from backend.spec_loop.models import ModeChange

    assert hasattr(ModeChange, "id")
    assert hasattr(ModeChange, "day_id")
    assert hasattr(ModeChange, "from_mode")
    assert hasattr(ModeChange, "to_mode")
    assert hasattr(ModeChange, "ts")
    assert not hasattr(ModeChange, "date") or getattr(ModeChange, "date", None) is None
    # Ensure no 'date' column on table
    assert "date" not in [c.name for c in ModeChange.__table__.c]


def test_media_job_fields():
    """SPEC C3: media_jobs — kind(img/vid), status, input_refs, output_url, created_ts."""
    from backend.spec_loop.models import MediaJob

    assert hasattr(MediaJob, "media_job_id")
    assert hasattr(MediaJob, "kind")
    assert hasattr(MediaJob, "status")
    assert hasattr(MediaJob, "input_refs")
    assert hasattr(MediaJob, "output_url")
    assert hasattr(MediaJob, "created_ts")
    assert MediaJob.__tablename__ == "media_jobs"

def test_post_simulate_day_returns_job_id(db_session):
    """SPEC C2: POST /simulate/day → job_id 반환 (202)."""
    from datetime import date
    from backend.spec_loop.models import DayPlan
    from backend.spec_loop.scheduler.queue import enqueue, get_job

    plan = DayPlan(user_id=None, date=date.today(), mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    job_id = enqueue(db_session, "simulation", {"day_id": plan.day_id})
    assert job_id > 0
    job = get_job(db_session, job_id)
    assert job.kind == "simulation"
    assert job.status == "pending"


def test_get_jobs_contract(db_session):
    """SPEC C2: GET /jobs/{job_id} → job_id, status, kind, result, created_ts."""
    from backend.spec_loop.scheduler.queue import enqueue, get_job

    job_id = enqueue(db_session, "simulation", {"day_id": 1})
    job = get_job(db_session, job_id)
    assert job is not None
    assert job.job_id == job_id
    assert job.status in ("pending", "completed", "failed")
    assert hasattr(job, "kind")
    assert hasattr(job, "result")
    assert hasattr(job, "created_ts")


def test_all_six_endpoints_registered():
    """Slice 7: /api/spec 하위 6개 엔드포인트가 main.py에 등록되어 있어야 한다."""
    from backend.main import (\n        app,\n    )
    paths = {(route.path, tuple(sorted(getattr(route, "methods", [])))) for route in app.routes}

    assert ("/api/spec/plan/day", ("POST",)) in paths
    assert ("/api/spec/condition/checkin", ("POST",)) in paths
    assert ("/api/spec/adapt/day", ("POST",)) in paths
    assert ("/api/spec/resistance/event", ("POST",)) in paths
    assert ("/api/spec/jobs/{job_id}", ("GET",)) in paths
    assert ("/api/spec/simulate/day", ("POST",)) in paths
    # Menstrual extension endpoints
    assert ("/api/spec/cycle/state", ("GET",)) in paths
    assert ("/api/spec/cycle/period_start", ("POST",)) in paths
    assert ("/api/spec/plan/patch/suggest", ("GET",)) in paths
    assert ("/api/spec/plan/patch/apply", ("POST",)) in paths


def test_plan_day_contract_schema_only():
    """Slice 7: POST /plan/day 요청/응답 스키마 계약 확인."""
    from backend.spec_loop.planner.schemas import PlanDayRequest, PlanDayResponse, PlanItem
    from datetime import date

    item = PlanItem(task_id=1, resistance_level=6, planned_block_minutes=25, micro_steps=["a", "b"])
    body = PlanDayRequest(date=date.today(), mode=70, items=[item])
    data = body.model_dump()
    assert set(data.keys()) >= {"date", "mode", "items"}
    assert data["items"][0]["resistance_level"] == 6

    resp = PlanDayResponse(day_id=1, date=date.today(), mode=70, items=[data["items"][0]])
    out = resp.model_dump()
    assert set(out.keys()) == {"day_id", "date", "mode", "items"}


def test_condition_checkin_contract_schema_only():
    """Slice 7: POST /condition/checkin 요청/응답 스키마 계약 확인."""
    from backend.spec_loop.condition.schemas import CheckinRequest, CheckinResponse, MinConditionSet
    from datetime import datetime

    body = CheckinRequest(
        ts=datetime.utcnow(),
        source_level=1,
        min_condition_set=MinConditionSet(sleep_hours="H6_7", fatigue=5, pain=2, mood="ok"),
        wearable={"hr": 70},
        behavior_inference=None,
        previous_condition_id=None,
        day_id=1,
    )
    data = body.model_dump()
    assert "condition_id" not in data
    assert data["day_id"] == 1

    dummy = CheckinResponse(
        condition_id=1,
        ts=datetime.utcnow(),
        source_level=1,
        condition_score=80,
        final_mode=70,
        inferred_flags=None,
        adapt_applied=False,
        updated_day_plan=None,
    )
    out = dummy.model_dump()
    assert set(out.keys()) >= {"condition_id", "ts", "condition_score", "final_mode", "adapt_applied", "updated_day_plan"}


def test_adapt_day_contract_schema_only():
    """Slice 7: POST /adapt/day 요청/응답 스키마 계약 확인."""
    from backend.spec_loop.adapter.schemas import AdaptRequest, AdaptResult

    body = AdaptRequest(day_id=1, condition_id=2, mode=70, condition_score=60)
    data = body.model_dump()
    assert set(data.keys()) == {"day_id", "condition_id", "mode", "condition_score"}

    dummy = AdaptResult(
        day_id=1,
        actions_applied=["drop", "protect"],
        updated_plan={"day_id": 1, "items": [], "mode": 70, "protected_block_minutes": 30},
        soothe_requested=False,
        delay_scheduler_hint=None,
    )
    out = dummy.model_dump()
    assert set(out.keys()) == {"day_id", "actions_applied", "updated_plan", "soothe_requested", "delay_scheduler_hint"}


def test_resistance_event_contract_schema_only():
    """Slice 7: POST /resistance/event 요청/응답 스키마 계약 확인."""
    from backend.spec_loop.coach.schemas import ResistanceEventRequest, ResistanceEventResponse, CoachAction

    body = ResistanceEventRequest(day_id=1, task_id=None, trigger="test", intensity=5, context={"x": 1})
    data = body.model_dump()
    assert set(data.keys()) >= {"day_id", "trigger", "intensity"}

    action = CoachAction(technique="EFT_TIMER", duration_sec=60, lock_sec=120, micro_step="첫 2분 착수")
    dummy = ResistanceEventResponse(
        event_id=1,
        ts="2025-01-01T00:00:00Z",
        action=action,
        lock_applied=120,
        adapt_required=False,
    )
    out = dummy.model_dump()
    assert set(out.keys()) == {"event_id", "ts", "action", "lock_applied", "adapt_required"}


def test_execution_log_plan_commit_and_adapt_applied(db_session):
    """Slice 7: PLAN_COMMIT / ADAPT_APPLIED ExecutionLog 기록 및 KPI 메트릭 확인."""
    from datetime import date
    from backend.spec_loop.planner.schemas import PlanDayRequest, PlanItem
    from backend.spec_loop.planner.service import create_or_update_day_plan
    from backend.spec_loop.adapter.schemas import AdaptRequest
    from backend.spec_loop.adapter.service import apply_adaptation

    # PLAN_COMMIT: DayPlan 생성
    t = Task(title="T1", est_minutes=20, priority=1, energy_cost=2)
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)

    today = date.today()
    body = PlanDayRequest(
        date=today,
        mode=70,
        items=[
            PlanItem(
                task_id=t.task_id,
                resistance_level=4,
                planned_block_minutes=20,
                micro_steps=["step1"],
            )
        ],
    )
    plan = create_or_update_day_plan(db_session, body)

    logs = db_session.query(ExecutionLog).filter(ExecutionLog.day_id == plan.day_id).all()
    types = {log.event_type for log in logs}
    assert ExecutionLogEventType.PLAN_COMMIT.value in types
    for log in logs:
        assert log.metrics is None or log.metrics.get("kpi_priority") == "behavior_first"

    # ADAPT_APPLIED: 명시적 호출
    adapt_body = AdaptRequest(day_id=plan.day_id, condition_id=0, mode=40, condition_score=30)
    apply_adaptation(
        db_session,
        adapt_body.day_id,
        adapt_body.condition_id,
        target_mode=adapt_body.mode,
        condition_score=adapt_body.condition_score,
    )

    logs_after = db_session.query(ExecutionLog).filter(ExecutionLog.day_id == plan.day_id).all()
    types_after = {log.event_type for log in logs_after}
    assert ExecutionLogEventType.ADAPT_APPLIED in types_after

