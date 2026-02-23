# Slice 2: condition_score(F4), 모드 구간, pain override, checkin 응답
from datetime import date

from backend.spec_loop.condition.service import (
    compute_condition_score,
    compute_mode_from_score,
    apply_pain_override,
)
from backend.spec_loop.condition.schemas import (
    CheckinRequest,
    MinConditionSet,
    MODE_DOWN_REASON_LINE,
)


def test_sleep_penalties():
    """F4: 수면 패널티 LT5:-25, H5_6:-15, H6_7:-8, H7_8:0, GT8:0."""
    base = MinConditionSet(sleep_hours="H7_8", fatigue=0, pain=0, mood="calm")
    assert compute_condition_score(base) == 100
    base_lt5 = MinConditionSet(sleep_hours="LT5", fatigue=0, pain=0, mood="calm")
    assert compute_condition_score(base_lt5) == 100 - 25
    base_h56 = MinConditionSet(sleep_hours="H5_6", fatigue=0, pain=0, mood="calm")
    assert compute_condition_score(base_h56) == 100 - 15
    base_h67 = MinConditionSet(sleep_hours="H6_7", fatigue=0, pain=0, mood="calm")
    assert compute_condition_score(base_h67) == 100 - 8
    base_gt8 = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm")
    assert compute_condition_score(base_gt8) == 100


def test_fatigue_pain_mood_penalties():
    """F4: 피로 -fatigue*4, 통증 -pain*6, 기분 calm:0, ok:-5, anxious:-15, low:-20, irritated:-15."""
    base = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm")
    assert compute_condition_score(base) == 100
    f = MinConditionSet(sleep_hours="GT8", fatigue=2, pain=0, mood="calm")
    assert compute_condition_score(f) == 100 - 8
    p = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=1, mood="calm")
    assert compute_condition_score(p) == 100 - 6
    mood_ok = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="ok")
    assert compute_condition_score(mood_ok) == 95
    mood_anxious = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="anxious")
    assert compute_condition_score(mood_anxious) == 85
    mood_low = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="low")
    assert compute_condition_score(mood_low) == 80
    mood_irritated = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="irritated")
    assert compute_condition_score(mood_irritated) == 85


def test_period_penalties():
    """F4: 생리 on:-8, pre:-5, post:0, none:0."""
    base = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm", period_status="none")
    assert compute_condition_score(base) == 100
    on = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm", period_status="on")
    assert compute_condition_score(on) == 92
    pre = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm", period_status="pre")
    assert compute_condition_score(pre) == 95
    post = MinConditionSet(sleep_hours="GT8", fatigue=0, pain=0, mood="calm", period_status="post")
    assert compute_condition_score(post) == 100


def test_mode_bands():
    """F4: score>=70→100, 40<=score<70→70, score<40→40."""
    assert compute_mode_from_score(70) == 100
    assert compute_mode_from_score(69) == 70
    assert compute_mode_from_score(40) == 70
    assert compute_mode_from_score(39) == 40
    assert compute_mode_from_score(0) == 40


def test_pain_9_forces_40():
    """F4: pain>=9 → 40 강제 (score 무관)."""
    assert apply_pain_override(9, 80, None) == 40
    assert apply_pain_override(10, 100, None) == 40


def test_pain_7_caps_70():
    """F4: pain>=7 → 최대 70 (score 무관)."""
    assert apply_pain_override(7, 80, None) == 70
    assert apply_pain_override(8, 100, None) == 70


def test_pain_delta_within_2h_caps_70():
    """pain_delta>=+2 within 2h → 최대 70."""
    assert apply_pain_override(5, 80, 2) == 70
    assert apply_pain_override(4, 90, 3) == 70


def test_checkin_response_has_adapt_applied_and_updated_day_plan(db_session):
    """결정 1: checkin 응답에 adapt_applied, updated_day_plan 포함."""
    from backend.spec_loop.models import DayPlan
    from backend.spec_loop.condition.service import checkin

    today = date.today()
    plan = DayPlan(user_id=None, date=today, mode=100, items=[])
    db_session.add(plan)
    db_session.commit()
    db_session.refresh(plan)
    day_id = plan.day_id

    body = CheckinRequest(
        min_condition_set=MinConditionSet(sleep_hours="H6_7", fatigue=5, pain=2, mood="ok"),
        day_id=day_id,
    )
    resp = checkin(db_session, body)
    assert resp.adapt_applied is True
    assert resp.updated_day_plan is not None
    assert resp.final_mode == 70
    assert resp.updated_day_plan["mode"] == 70


def test_mode_down_reason_single_line():
    """Slice 7: 모드 하향 1줄 문구(B1). 개행 없이 한 줄이어야 한다."""
    assert MODE_DOWN_REASON_LINE == "수면/피로/통증 신호로 인해 시작 성공률을 우선합니다."
    # 줄바꿈이 없어야 UI에서 한 줄 문구로 안전하게 사용 가능
    assert "\n" not in MODE_DOWN_REASON_LINE

