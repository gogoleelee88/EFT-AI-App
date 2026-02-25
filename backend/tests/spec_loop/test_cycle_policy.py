from datetime import date

from backend.spec_loop.cycle.policy import get_cycle_policy
from backend.spec_loop.cycle.service import upsert_cycle_state


def test_cycle_phase_probabilities_sum_to_one(db_session):
    today = date.today()
    row = upsert_cycle_state(
        db=db_session,
        reference_date=today,
        user_id="cycle-user",
        last_period_start_date=today.replace(day=max(1, today.day - 3)),
    )
    total = sum((row.phase_prob or {}).values())
    assert 0.99 <= total <= 1.01


def test_cycle_policy_env_override(monkeypatch):
    monkeypatch.setenv("CYCLE_DEFAULT_LEN_DAYS", "30")
    monkeypatch.setenv("CYCLE_LUTEAL_LEN_DAYS", "13")
    policy = get_cycle_policy()
    assert policy.default_cycle_len_days == 30
    assert policy.luteal_len_days == 13
