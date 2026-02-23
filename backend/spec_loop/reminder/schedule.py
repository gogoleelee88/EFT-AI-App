from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

DEFAULT_TZ = "Asia/Seoul"
SUPPORTED_RULES = {"once", "daily", "weekdays", "weekends", "custom", "custom_days"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def normalize_repeat_rule(value: Optional[str]) -> str:
    rule = (value or "daily").strip().lower()
    if rule not in SUPPORTED_RULES:
        return "daily"
    if rule == "custom":
        return "custom_days"
    return rule


def normalize_custom_days(days: Optional[Iterable[int]]) -> list[int]:
    if not days:
        return []
    normalized: set[int] = set()
    for day in days:
        try:
            v = int(day)
        except (TypeError, ValueError):
            continue
        if 0 <= v <= 6:
            normalized.add(v)
    return sorted(normalized)


def parse_hhmm(value: str) -> Optional[time]:
    raw = (value or "").strip()
    parts = raw.split(":")
    if len(parts) != 2:
        return None
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return time(hour=hour, minute=minute)


def resolve_timezone(value: Optional[str]) -> ZoneInfo:
    name = (value or DEFAULT_TZ).strip() or DEFAULT_TZ
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo(DEFAULT_TZ)


def _sun0_from_python_weekday(py_weekday: int) -> int:
    return (py_weekday + 1) % 7


def _rule_matches(rule: str, local_day: date, custom_days: list[int]) -> bool:
    sun0_weekday = _sun0_from_python_weekday(local_day.weekday())
    if rule == "daily":
        return True
    if rule == "weekdays":
        return sun0_weekday in {1, 2, 3, 4, 5}
    if rule == "weekends":
        return sun0_weekday in {0, 6}
    if rule == "custom_days":
        return sun0_weekday in set(custom_days)
    return False


def next_fire_at_utc(
    *,
    alarm_time_local: str,
    repeat_rule: str,
    custom_days: Optional[list[int]] = None,
    timezone_name: Optional[str] = None,
    now_utc: Optional[datetime] = None,
    anchor_date: Optional[date] = None,
) -> Optional[datetime]:
    local_time = parse_hhmm(alarm_time_local)
    if local_time is None:
        return None

    rule = normalize_repeat_rule(repeat_rule)
    days = normalize_custom_days(custom_days)
    tz = resolve_timezone(timezone_name)
    now = now_utc.astimezone(timezone.utc) if now_utc else _now_utc()
    now_local = now.astimezone(tz)

    if rule == "once":
        base_date = anchor_date or now_local.date()
        candidate = datetime.combine(base_date, local_time, tzinfo=tz)
        if candidate <= now_local:
            return None
        return candidate.astimezone(timezone.utc)

    if rule == "custom_days" and not days:
        return None

    start = anchor_date or now_local.date()
    if start < now_local.date():
        start = now_local.date()

    # Search up to one year ahead to avoid unbounded loops.
    for offset in range(0, 366):
        d = start + timedelta(days=offset)
        if not _rule_matches(rule, d, days):
            continue
        candidate = datetime.combine(d, local_time, tzinfo=tz)
        if candidate <= now_local:
            continue
        return candidate.astimezone(timezone.utc)
    return None

