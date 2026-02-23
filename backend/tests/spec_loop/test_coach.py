# Slice 4: POST /resistance/event 응답 구조 (technique, duration_sec, lock_sec, micro_step)
from datetime import date

from backend.spec_loop.models import DayPlan
from backend.spec_loop.coach.service import record_resistance_event
from backend.spec_loop.coach.schemas import LOCK_SEC, TechniqueEnum


def test_resistance_response_has_technique_duration_lock_micro_step(db_session):
    """응답에 action{ technique, duration_sec(30-90), lock_sec(120), micro_step } 포함."""
    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=70, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)

    row, action, adapt_required = record_resistance_event(
        db_session,
        plan.day_id,
        None,
        "START_AVERSION",
        5,
        None,
        technique=TechniqueEnum.EFT_TIMER.value,
        duration_sec=45,
    )
    assert row.event_id is not None
    assert action.technique == TechniqueEnum.EFT_TIMER.value
    assert action.duration_sec == 45
    assert action.lock_sec == LOCK_SEC
    assert action.micro_step is not None


def test_technique_enum_five_values():
    """E: technique enum 5종."""
    from backend.spec_loop.coach.schemas import TechniqueEnum

    assert TechniqueEnum.EFT_TIMER.value == "EFT_TIMER"
    assert TechniqueEnum.HOOPONO_TIMER.value == "HOOPONO_TIMER"
    assert TechniqueEnum.BREATH_60.value == "BREATH_60"
    assert TechniqueEnum.BODY_SCAN_60.value == "BODY_SCAN_60"
    assert TechniqueEnum.LABEL_30.value == "LABEL_30"
    assert len(TechniqueEnum) == 5


def test_trigger_enum_seven_values():
    """E: trigger enum 7종."""
    from backend.spec_loop.coach.schemas import TriggerEnum

    assert TriggerEnum.START_AVERSION.value == "START_AVERSION"
    assert TriggerEnum.OVERWHELM.value == "OVERWHELM"
    assert TriggerEnum.PERFECTIONISM.value == "PERFECTIONISM"
    assert TriggerEnum.PAIN.value == "PAIN"
    assert TriggerEnum.FATIGUE.value == "FATIGUE"
    assert TriggerEnum.CONFLICT.value == "CONFLICT"
    assert TriggerEnum.UNKNOWN.value == "UNKNOWN"
    assert len(TriggerEnum) == 7
