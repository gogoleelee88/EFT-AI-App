from datetime import date, datetime, timezone

from backend.spec_loop.condition.schemas import MenstrualQuickCheck, MinConditionSet
from backend.spec_loop.condition.summary_service import build_daily_condition_summary, compute_menstrual_score
from backend.spec_loop.google_calendar.models import GoogleEventMapping
from backend.spec_loop.models import DailyConditionSummary, DayPlan, Task
from backend.spec_loop.plan_patch.service import apply_plan_patch, suggest_plan_patch


def test_menstrual_score_weighted_formula():
    full = MenstrualQuickCheck(
        bleeding_level_0_2=2,
        cramps_0_4=4,
        fatigue_0_4=4,
        irritability_0_4=4,
        focus_drop_0_4=4,
    )
    assert compute_menstrual_score(full) == 100

    cramps_only = MenstrualQuickCheck(
        cramps_0_4=4,
        fatigue_0_4=0,
        irritability_0_4=0,
        focus_drop_0_4=0,
    )
    assert compute_menstrual_score(cramps_only) == 35


def test_driver_disambiguation_keeps_sleep_as_primary_when_high_confidence():
    min_set = MinConditionSet(sleep_hours="LT5", fatigue=8, pain=1, mood="ok")
    menstrual = MenstrualQuickCheck(
        cramps_0_4=4,
        fatigue_0_4=4,
        irritability_0_4=4,
        focus_drop_0_4=4,
    )
    summary = build_daily_condition_summary(min_set, menstrual_quick_check=menstrual)
    assert summary["drivers_top2"][0]["driver"] == "SLEEP_DEBT_LOAD"
    assert summary["drivers_top2"][1]["driver"] == "MENSTRUAL_SYMPTOM_LOAD"


def test_plan_patch_suggest_blocks_decision_delay_when_confidence_low(db_session):
    today = date.today()
    task = Task(title="중요 의사결정 미팅", est_minutes=60, priority=5, energy_cost=3)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    plan = DayPlan(
        user_id=None,
        date=today,
        mode=70,
        items=[{"task_id": task.task_id, "planned_block_minutes": 60, "micro_steps": []}],
    )
    db_session.add(plan)
    db_session.commit()

    summary = DailyConditionSummary(
        user_id=None,
        day_id=plan.day_id,
        condition_id=None,
        date=today,
        drivers=[{"driver": "MENSTRUAL_SYMPTOM_LOAD", "score": 40, "confidence": "low"}],
        confidence="low",
        evidence_snapshot=["line1", "line2"],
        menstrual_score=40,
        data_quality="self_report_low",
    )
    db_session.add(summary)
    db_session.commit()

    out = suggest_plan_patch(db_session, target_date=today, user_id=None, day_id=plan.day_id)
    decision = next(s for s in out["suggestions"] if s["patch_type"] == "DECISION_DELAY")
    assert decision["allowed"] is False
    assert decision["blocked_reason"] is not None


def test_plan_patch_apply_split_deep_work_rule(db_session):
    today = date.today()
    task = Task(title="Deep Work", est_minutes=120, priority=4, energy_cost=4)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    plan = DayPlan(
        user_id=None,
        date=today,
        mode=70,
        items=[{"task_id": task.task_id, "planned_block_minutes": 120, "micro_steps": ["draft"]}],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    summary = DailyConditionSummary(
        user_id=None,
        day_id=plan.day_id,
        condition_id=None,
        date=today,
        drivers=[{"driver": "MENSTRUAL_SYMPTOM_LOAD", "score": 62, "confidence": "med"}],
        confidence="med",
        evidence_snapshot=["line1", "line2"],
        menstrual_score=62,
        data_quality="self_report_med",
    )
    db_session.add(summary)
    db_session.commit()

    result = apply_plan_patch(
        db=db_session,
        target_date=today,
        patch_type="SPLIT_DEEP_WORK",
        user_id=None,
        day_id=plan.day_id,
    )
    assert result["applied"] is True
    blocks = [int(it.get("planned_block_minutes") or 0) for it in result["updated_plan"]["items"]]
    assert blocks[:3] == [45, 15, 45]


def test_decision_delay_moves_google_event_when_mapping_exists(db_session, monkeypatch):
    today = date.today()
    task = Task(title="의사결정 미팅", est_minutes=60, priority=5, energy_cost=3)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    plan = DayPlan(
        user_id="u1",
        date=today,
        mode=70,
        items=[{"task_id": task.task_id, "planned_block_minutes": 60, "micro_steps": []}],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    summary = DailyConditionSummary(
        user_id="u1",
        day_id=plan.day_id,
        condition_id=None,
        date=today,
        drivers=[{"driver": "MENSTRUAL_SYMPTOM_LOAD", "score": 65, "confidence": "med"}],
        confidence="med",
        evidence_snapshot=["line1", "line2"],
        menstrual_score=65,
        data_quality="self_report_med",
    )
    db_session.add(summary)
    db_session.commit()

    mapping = GoogleEventMapping(
        user_id="u1",
        task_id=task.task_id,
        calendar_id="primary",
        google_event_id="evt-123",
    )
    db_session.add(mapping)
    db_session.commit()

    called = {}

    def _fake_update_google_event(**kwargs):
        called["event_id"] = kwargs.get("event_id")
        return {"google_event_id": kwargs.get("event_id"), "calendar_id": "primary", "raw": {}}

    monkeypatch.setattr(
        "backend.spec_loop.plan_patch.service.update_google_event",
        _fake_update_google_event,
    )

    result = apply_plan_patch(
        db=db_session,
        target_date=today,
        patch_type="DECISION_DELAY",
        user_id="u1",
        day_id=plan.day_id,
    )
    assert result["applied"] is True
    assert called["event_id"] == "evt-123"
    assert "Google Calendar 이벤트를 내일 오전으로 이동했습니다." in result["message"]


def test_buffer_patch_syncs_google_with_two_buffer_events(db_session, monkeypatch):
    today = date.today()
    task = Task(title="important design review", est_minutes=60, priority=5, energy_cost=3)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    plan = DayPlan(
        user_id="u-buffer",
        date=today,
        mode=70,
        items=[{"task_id": task.task_id, "planned_block_minutes": 60, "micro_steps": []}],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    summary = DailyConditionSummary(
        user_id="u-buffer",
        day_id=plan.day_id,
        condition_id=None,
        date=today,
        drivers=[{"driver": "MENSTRUAL_SYMPTOM_LOAD", "score": 55, "confidence": "med"}],
        confidence="med",
        evidence_snapshot=["line1", "line2"],
        menstrual_score=55,
        data_quality="self_report_med",
    )
    db_session.add(summary)
    db_session.commit()

    mapping = GoogleEventMapping(
        user_id="u-buffer",
        task_id=task.task_id,
        calendar_id="primary",
        google_event_id="evt-buffer-1",
    )
    db_session.add(mapping)
    db_session.commit()

    def _fake_fetch_google_events(db, user_id, target_date):
        return [
            {
                "id": "evt-buffer-1",
                "title": "important design review",
                "start": datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
                .replace(hour=10, minute=0)
                .isoformat(),
                "end": datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
                .replace(hour=11, minute=0)
                .isoformat(),
            }
        ]

    create_calls = []

    def _fake_create_google_event(**kwargs):
        create_calls.append(kwargs)
        return {"google_event_id": f"new-{len(create_calls)}", "calendar_id": "primary", "raw": {}, "mapping": None}

    monkeypatch.setattr("backend.spec_loop.plan_patch.service.fetch_google_events", _fake_fetch_google_events)
    monkeypatch.setattr("backend.spec_loop.plan_patch.service.create_google_event", _fake_create_google_event)

    result = apply_plan_patch(
        db=db_session,
        target_date=today,
        patch_type="BUFFER_BLOCK",
        user_id="u-buffer",
        day_id=plan.day_id,
    )
    assert result["applied"] is True
    assert result["calendar_synced"] is True
    assert len(create_calls) == 2


def test_split_patch_syncs_google_with_update_and_two_new_events(db_session, monkeypatch):
    today = date.today()
    task = Task(title="deep focus block", est_minutes=120, priority=4, energy_cost=4)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    plan = DayPlan(
        user_id="u-split",
        date=today,
        mode=70,
        items=[{"task_id": task.task_id, "planned_block_minutes": 120, "micro_steps": []}],
    )
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    summary = DailyConditionSummary(
        user_id="u-split",
        day_id=plan.day_id,
        condition_id=None,
        date=today,
        drivers=[{"driver": "MENSTRUAL_SYMPTOM_LOAD", "score": 58, "confidence": "med"}],
        confidence="med",
        evidence_snapshot=["line1", "line2"],
        menstrual_score=58,
        data_quality="self_report_med",
    )
    db_session.add(summary)
    db_session.commit()

    mapping = GoogleEventMapping(
        user_id="u-split",
        task_id=task.task_id,
        calendar_id="primary",
        google_event_id="evt-split-1",
    )
    db_session.add(mapping)
    db_session.commit()

    def _fake_fetch_google_events(db, user_id, target_date):
        return [
            {
                "id": "evt-split-1",
                "title": "deep focus block",
                "start": datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
                .replace(hour=13, minute=0)
                .isoformat(),
                "end": datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
                .replace(hour=14, minute=30)
                .isoformat(),
            }
        ]

    update_calls = []
    create_calls = []

    def _fake_update_google_event(**kwargs):
        update_calls.append(kwargs)
        return {"google_event_id": kwargs.get("event_id"), "calendar_id": "primary", "raw": {}}

    def _fake_create_google_event(**kwargs):
        create_calls.append(kwargs)
        return {"google_event_id": f"new-{len(create_calls)}", "calendar_id": "primary", "raw": {}, "mapping": None}

    monkeypatch.setattr("backend.spec_loop.plan_patch.service.fetch_google_events", _fake_fetch_google_events)
    monkeypatch.setattr("backend.spec_loop.plan_patch.service.update_google_event", _fake_update_google_event)
    monkeypatch.setattr("backend.spec_loop.plan_patch.service.create_google_event", _fake_create_google_event)

    result = apply_plan_patch(
        db=db_session,
        target_date=today,
        patch_type="SPLIT_DEEP_WORK",
        user_id="u-split",
        day_id=plan.day_id,
    )
    assert result["applied"] is True
    assert result["calendar_synced"] is True
    assert len(update_calls) == 1
    assert len(create_calls) == 2

