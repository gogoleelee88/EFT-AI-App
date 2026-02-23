from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from backend.spec_loop.reminder.schedule import next_fire_at_utc


def test_next_fire_once_future():
    now = datetime(2026, 2, 16, 0, 0, tzinfo=timezone.utc)
    fire = next_fire_at_utc(
        alarm_time_local="10:00",
        repeat_rule="once",
        timezone_name="Asia/Seoul",
        now_utc=now,
        anchor_date=date(2026, 2, 16),
    )
    assert fire is not None
    local = fire.astimezone(ZoneInfo("Asia/Seoul"))
    assert local.date() == date(2026, 2, 16)
    assert local.hour == 10 and local.minute == 0


def test_next_fire_once_past_returns_none():
    now = datetime(2026, 2, 16, 2, 0, tzinfo=timezone.utc)  # 11:00 KST
    fire = next_fire_at_utc(
        alarm_time_local="10:00",
        repeat_rule="once",
        timezone_name="Asia/Seoul",
        now_utc=now,
        anchor_date=date(2026, 2, 16),
    )
    assert fire is None


def test_next_fire_weekdays_skips_weekend():
    # 2026-02-20 23:30 UTC == 2026-02-21 08:30 KST (Saturday)
    now = datetime(2026, 2, 20, 23, 30, tzinfo=timezone.utc)
    fire = next_fire_at_utc(
        alarm_time_local="08:00",
        repeat_rule="weekdays",
        timezone_name="Asia/Seoul",
        now_utc=now,
        anchor_date=date(2026, 2, 20),
    )
    assert fire is not None
    local = fire.astimezone(ZoneInfo("Asia/Seoul"))
    assert local.weekday() == 0  # Monday
    assert local.hour == 8 and local.minute == 0


def test_next_fire_custom_days_uses_sun0_indices():
    # Monday 10:00 KST
    now = datetime(2026, 2, 16, 1, 0, tzinfo=timezone.utc)
    fire = next_fire_at_utc(
        alarm_time_local="09:00",
        repeat_rule="custom_days",
        custom_days=[0, 2],  # Sunday, Tuesday
        timezone_name="Asia/Seoul",
        now_utc=now,
        anchor_date=date(2026, 2, 16),
    )
    assert fire is not None
    local = fire.astimezone(ZoneInfo("Asia/Seoul"))
    assert local.weekday() == 1  # Tuesday
    assert local.hour == 9 and local.minute == 0

