from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.meal_coach.models import MealLog, PostMealCheck
from backend.meal_coach.service import compute_effect_and_advice, make_uuid
from backend.spec_loop.models import Condition, DailyConditionSummary, DayPlan


def _clamp_0_4(value: Any, default: int = 0) -> int:
    try:
        n = int(round(float(value)))
    except Exception:
        n = default
    return max(0, min(4, n))


def _safe_dt(ts: datetime | None) -> datetime:
    now = ts or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now


def _neutral_min_condition_set() -> dict[str, Any]:
    return {
        "sleep_hours": "H7_8",
        "fatigue": 3,
        "pain": 1,
        "mood": "ok",
        "period_status": "none",
    }


def sync_condition_checkin_to_meal(
    db: Session,
    *,
    body: Any,
    condition_id: int,
    ts: datetime | None,
    effective_user_id: str | None,
) -> None:
    behavior = body.behavior_inference if isinstance(getattr(body, "behavior_inference", None), dict) else {}
    if not behavior:
        return

    dip_val = behavior.get("post_meal_dip_0_4")
    focus_val = behavior.get("focus_drop_0_4")
    sleepiness_val = behavior.get("sleepiness_0_4")
    sluggish_val = behavior.get("sluggishness_0_4")
    if dip_val is None and focus_val is None and sleepiness_val is None and sluggish_val is None:
        return

    user_id = effective_user_id
    day_id = getattr(body, "day_id", None)
    if (not user_id) and day_id:
        plan = db.query(DayPlan).filter(DayPlan.day_id == int(day_id)).first()
        user_id = plan.user_id if plan else None
    if not user_id:
        return

    now = _safe_dt(ts)
    meal_id = str(behavior.get("meal_id") or "").strip()
    meal: MealLog | None = None
    if meal_id:
        meal = db.query(MealLog).filter(MealLog.meal_id == meal_id, MealLog.user_id == user_id).first()

    if meal is None:
        meal = (
            db.query(MealLog)
            .filter(
                MealLog.user_id == user_id,
                MealLog.meal_state == "ATE",
                MealLog.deleted_at.is_(None),
            )
            .order_by(MealLog.meal_time.desc())
            .first()
        )

    if meal is None:
        meal = MealLog(
            meal_id=make_uuid(),
            tenant_id=user_id,
            user_id=user_id,
            meal_state="ATE",
            meal_time=now,
            source="sync_spec_checkin",
            track_selected="AUTO",
        )
        db.add(meal)
        db.commit()
        db.refresh(meal)

    dip = _clamp_0_4(dip_val, default=2)
    slot_raw = str(behavior.get("post_check_slot") or "T30").upper()
    slot = "T90" if slot_raw == "T90" else "T30"
    sleepiness = _clamp_0_4(sleepiness_val, default=dip)
    focus_drop = _clamp_0_4(focus_val, default=dip)
    sluggishness = _clamp_0_4(sluggish_val, default=dip)
    gi = _clamp_0_4(behavior.get("gi_discomfort_0_4"), default=0)
    headache = _clamp_0_4(behavior.get("headache_0_4"), default=0)
    caffeine_used = bool(behavior.get("caffeine_used", False))

    row = (
        db.query(PostMealCheck)
        .filter(PostMealCheck.meal_id == meal.meal_id, PostMealCheck.slot == slot)
        .one_or_none()
    )
    if row is None:
        row = PostMealCheck(
            check_id=make_uuid(),
            meal_id=meal.meal_id,
            slot=slot,
            sleepiness=sleepiness,
            focus_drop=focus_drop,
            sluggishness=sluggishness,
            gi_discomfort=gi,
            headache=headache,
            caffeine_used=caffeine_used,
            submitted_at=now,
            check_completion_time_ms=None,
        )
        db.add(row)
    else:
        row.sleepiness = sleepiness
        row.focus_drop = focus_drop
        row.sluggishness = sluggishness
        row.gi_discomfort = gi
        row.headache = headache
        row.caffeine_used = caffeine_used
        row.submitted_at = now
    db.commit()

    effect, advice = compute_effect_and_advice(db, meal=meal)

    behavior["meal_id"] = meal.meal_id
    behavior["synced_to_meal_coach"] = True
    behavior["meal_coach_condition_link"] = {
        "condition_id": condition_id,
        "effect_id": effect.effect_id,
        "advice_id": advice.advice_id,
    }

    condition = db.query(Condition).filter(Condition.condition_id == condition_id).first()
    if condition is not None:
        condition.behavior_inference = behavior
        db.commit()


def sync_meal_post_check_to_spec_condition(
    db: Session,
    *,
    user_id: str,
    meal: MealLog,
    check: PostMealCheck,
    dip_score: int,
    dip_score_t30: int | None,
    dip_score_t90: int | None,
) -> None:
    meal_date = meal.meal_time.date()
    behavior_patch: dict[str, Any] = {
        "inferred": True,
        "meal_id": meal.meal_id,
        "post_check_slot": check.slot,
        "post_meal_dip_0_4": _clamp_0_4(round(float(dip_score) / 25.0), default=2),
        "focus_drop_0_4": _clamp_0_4(check.focus_drop, default=2),
        "sleepiness_0_4": _clamp_0_4(check.sleepiness, default=2),
        "sluggishness_0_4": _clamp_0_4(check.sluggishness, default=2),
        "gi_discomfort_0_4": _clamp_0_4(check.gi_discomfort or 0, default=0),
        "headache_0_4": _clamp_0_4(check.headache or 0, default=0),
        "caffeine_used": bool(check.caffeine_used),
        "dip_score_0_100": int(dip_score),
        "dip_score_t30_0_100": int(dip_score_t30 or 0),
        "dip_score_t90_0_100": int(dip_score_t90 or 0),
        "synced_from_meal_coach": True,
    }

    summary = (
        db.query(DailyConditionSummary)
        .filter(DailyConditionSummary.user_id == user_id, DailyConditionSummary.date == meal_date)
        .first()
    )
    condition_row: Condition | None = None
    if summary is not None and summary.condition_id is not None:
        condition_row = db.query(Condition).filter(Condition.condition_id == summary.condition_id).first()

    if condition_row is not None:
        merged = {}
        if isinstance(condition_row.behavior_inference, dict):
            merged.update(condition_row.behavior_inference)
        merged.update(behavior_patch)
        condition_row.behavior_inference = merged
        db.commit()
        return

    # Fallback: create a synthetic condition row if none exists for that day.
    from backend.spec_loop.condition.schemas import MinConditionSet
    from backend.spec_loop.condition.service import compute_condition_score
    from backend.spec_loop.condition.summary_service import build_daily_condition_summary

    min_set_raw = _neutral_min_condition_set()
    min_set = MinConditionSet(**min_set_raw)
    condition_score = compute_condition_score(min_set, behavior_patch)
    daily_summary = build_daily_condition_summary(min_set, None, behavior_patch)

    condition_row = Condition(
        ts=_safe_dt(check.submitted_at),
        source_level=2,
        min_condition_set=min_set_raw,
        wearable=None,
        behavior_inference=behavior_patch,
        condition_score=condition_score,
        inferred_flags={"synced_from_meal_coach": True},
        condition_domain="GENERAL",
        metrics={"sync_source": "meal_coach"},
        data_quality=daily_summary.get("data_quality"),
        confidence=daily_summary.get("confidence"),
    )
    db.add(condition_row)
    db.commit()
    db.refresh(condition_row)

    day_plan = (
        db.query(DayPlan)
        .filter(DayPlan.user_id == user_id, DayPlan.date == meal_date)
        .order_by(DayPlan.day_id.desc())
        .first()
    )

    if summary is None:
        summary = DailyConditionSummary(
            user_id=user_id,
            day_id=day_plan.day_id if day_plan else None,
            condition_id=condition_row.condition_id,
            date=meal_date,
            drivers=daily_summary.get("drivers"),
            confidence=daily_summary.get("confidence"),
            evidence_snapshot=daily_summary.get("evidence_snapshot"),
            menstrual_score=daily_summary.get("menstrual_score_0_100"),
            data_quality=daily_summary.get("data_quality"),
        )
        db.add(summary)
    else:
        summary.day_id = day_plan.day_id if day_plan else summary.day_id
        summary.condition_id = condition_row.condition_id
        summary.drivers = daily_summary.get("drivers")
        summary.confidence = daily_summary.get("confidence")
        summary.evidence_snapshot = daily_summary.get("evidence_snapshot")
        summary.menstrual_score = daily_summary.get("menstrual_score_0_100")
        summary.data_quality = daily_summary.get("data_quality")
    db.commit()


