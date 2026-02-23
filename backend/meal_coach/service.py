from __future__ import annotations

import hashlib
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from config.settings import get_settings
from backend.meal_coach.authz import Actor
from backend.meal_coach.models import (
    AuditLog,
    DeviceToken,
    EventLog,
    MealAdvice,
    MealLog,
    MealPostEffect,
    MealSchedulerJob,
    NutritionEstimate,
    PostMealCheck,
)
from backend.meal_coach.push_adapter import send_push_notification
from backend.meal_coach.schemas import MealEstimateRequest, PostCheckRequest, WeeklySummaryResponse

ESTIMATE_VERSIONS = {
    "engine_version": "nutri-1.3.0",
    "model_version": "hybrid-2026.02",
    "prompt_version": "n/a",
    "dataset_version": "off_usda_2026_01",
}

ADVICE_VERSIONS = {
    "engine_version": "adv-2.1.0",
    "model_version": "rulepack-2026.02",
    "prompt_version": "adv_prompt_v5",
    "dataset_version": "coachset_2026w06",
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _clamp(n: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, n))


def _hash_int(value: str) -> int:
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:10], 16)


def make_uuid() -> str:
    return str(uuid4())


def confidence_bucket(confidence: float) -> str:
    if confidence >= 0.8:
        return "high"
    if confidence >= 0.55:
        return "med"
    return "low"


def log_event(
    db: Session,
    *,
    actor: Actor,
    event_name: str,
    payload: dict,
    meal_id: str | None = None,
) -> None:
    secret = (get_settings().SECRET_KEY or "meal-coach-salt").encode("utf-8")
    raw = f"{actor.tenant_id}:{actor.user_id}".encode("utf-8")
    pseudo = hashlib.sha256(secret + raw).hexdigest()
    row = EventLog(
        event_id=make_uuid(),
        tenant_id=actor.tenant_id,
        user_pseudo_id=pseudo,
        meal_id=meal_id,
        event_name=event_name,
        event_version="v1",
        payload=payload,
    )
    db.add(row)
    db.commit()


def log_audit(
    db: Session,
    *,
    actor: Actor,
    action: str,
    target_type: str,
    target_id: str,
    details: dict | None = None,
) -> None:
    row = AuditLog(
        audit_id=make_uuid(),
        tenant_id=actor.tenant_id,
        actor_id=actor.user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
    )
    db.add(row)
    db.commit()


def schedule_default_jobs(db: Session, *, actor: Actor, meal: MealLog) -> dict[str, datetime]:
    t30 = meal.meal_time + timedelta(minutes=35)
    t90 = meal.meal_time + timedelta(minutes=90)
    for slot, due in (("POST_CHECK_T30", t30), ("POST_CHECK_T90", t90)):
        dedupe = f"postcheck:{meal.meal_id}:{slot}"
        existing = db.query(MealSchedulerJob).filter(MealSchedulerJob.dedupe_key == dedupe).one_or_none()
        if existing:
            continue
        row = MealSchedulerJob(
            job_id=make_uuid(),
            tenant_id=actor.tenant_id,
            user_id=actor.user_id,
            meal_id=meal.meal_id,
            job_type=slot,
            due_at=due,
            dedupe_key=dedupe,
            status="queued",
        )
        db.add(row)
    db.commit()
    return {"t30_due_at": t30, "t90_due_at": t90}


def _labels_from_nutrition(carbs_g: float, protein_g: float, sodium_mg: float) -> list[str]:
    labels: list[str] = []
    if carbs_g >= 70:
        labels.append("high_carbs")
    if protein_g < 20:
        labels.append("low_protein")
    if sodium_mg >= 800:
        labels.append("high_sodium")
    if not labels:
        labels.append("balanced")
    return labels


def build_estimate(
    *,
    meal: MealLog,
    req: MealEstimateRequest,
    photo_count: int,
) -> dict:
    track_used = "A" if req.track == "A" or (req.track == "AUTO" and bool(req.barcode)) else "B"
    seed_key = req.barcode or meal.meal_id
    seed = _hash_int(seed_key)

    if track_used == "A":
        carbs = float(35 + (seed % 70))
        protein = float(10 + ((seed // 3) % 35))
        fat = float(6 + ((seed // 5) % 26))
        sodium = float(240 + (seed % 1400))
        confidence = 0.9
        uncertainty = []
        refs = ["open_food_facts", "usda_fdc"]
    else:
        carbs = float(28 + (seed % 85))
        protein = float(8 + ((seed // 7) % 30))
        fat = float(4 + ((seed // 9) % 28))
        sodium = float(180 + (seed % 1200))
        confidence = _clamp(0.45 + min(photo_count, 4) * 0.08, 0.45, 0.78)
        uncertainty = ["portion_uncertain", "composition_uncertain"]
        refs = ["photo_estimator_v1"]

    calories = int(round(carbs * 4 + protein * 4 + fat * 9))
    labels = _labels_from_nutrition(carbs, protein, sodium)

    return {
        "track_used": track_used,
        "nutrition": {
            "calories": calories,
            "carbs_g": round(carbs, 1),
            "protein_g": round(protein, 1),
            "fat_g": round(fat, 1),
            "sodium_mg": round(sodium, 1),
        },
        "labels": labels,
        "confidence": round(float(confidence), 2),
        "uncertainty_reason": uncertainty,
        "source_refs": refs,
        "versions": dict(ESTIMATE_VERSIONS),
    }


def _partial_dip(check: PostMealCheck) -> int:
    base = ((0.4 * check.sleepiness) + (0.35 * check.focus_drop) + (0.25 * check.sluggishness)) / 4.0 * 100.0
    opt_adj = 0
    if (check.gi_discomfort or 0) >= 2:
        opt_adj += 5
    if (check.headache or 0) >= 2:
        opt_adj += 5
    if check.caffeine_used:
        opt_adj -= 3
    return int(max(0, min(100, round(base + opt_adj))))


def compute_effect_and_advice(
    db: Session,
    *,
    meal: MealLog,
) -> tuple[MealPostEffect, MealAdvice]:
    checks = (
        db.query(PostMealCheck)
        .filter(PostMealCheck.meal_id == meal.meal_id)
        .order_by(PostMealCheck.submitted_at.asc())
        .all()
    )
    by_slot = {c.slot: c for c in checks}
    c30 = by_slot.get("T30")
    c90 = by_slot.get("T90")
    if c30 is None:
        raise ValueError("T30 check is required to compute effect")

    t30_score = _partial_dip(c30)
    t90_score = _partial_dip(c90) if c90 else None
    dip = t30_score if t90_score is None else int(round(0.7 * t30_score + 0.3 * t90_score))

    estimate = (
        db.query(NutritionEstimate)
        .filter(NutritionEstimate.meal_id == meal.meal_id)
        .order_by(NutritionEstimate.created_at.desc())
        .first()
    )
    est_conf = float(estimate.confidence) if estimate else 0.55
    base_conf = 0.55 + (0.15 if c90 is not None else 0.0) + (0.1 if est_conf >= 0.8 else 0.0)
    conf = float(_clamp(base_conf, 0.35, 0.95))
    bucket = confidence_bucket(conf)

    effect = db.query(MealPostEffect).filter(MealPostEffect.meal_id == meal.meal_id).one_or_none()
    if effect is None:
        effect = MealPostEffect(
            effect_id=make_uuid(),
            meal_id=meal.meal_id,
            dip_score=dip,
            dip_score_t30=t30_score,
            dip_score_t90=t90_score,
            confidence=conf,
            confidence_bucket=bucket,
        )
        db.add(effect)
    else:
        effect.dip_score = dip
        effect.dip_score_t30 = t30_score
        effect.dip_score_t90 = t90_score
        effect.confidence = conf
        effect.confidence_bucket = bucket
    db.commit()
    db.refresh(effect)

    decision_mode = "PROCEED_WITH_CAUTION"
    task_mode = "LIGHT"
    next_action = ["water_250ml", "walk_8m"]
    why_tokens = [f"dip_score_{dip}", f"confidence_{bucket}"]

    if dip >= 65:
        decision_mode = "DEFER"
        task_mode = "RECOVERY"
        next_action = ["walk_8m", "water_250ml", "power_nap_15m"]
        why_tokens.append("high_post_meal_dip")
    elif dip <= 39 and conf >= 0.6:
        decision_mode = "PROCEED"
        task_mode = "DEEP_WORK"
        next_action = ["deep_work_block_25m", "water_250ml"]
        why_tokens.append("low_post_meal_dip")
    elif dip <= 39:
        decision_mode = "PROCEED_WITH_CAUTION"
        task_mode = "LIGHT"
        next_action = ["light_task_15m", "water_250ml"]
        why_tokens.append("confidence_limited")

    existing_advice = (
        db.query(MealAdvice)
        .filter(MealAdvice.meal_id == meal.meal_id)
        .order_by(MealAdvice.created_at.desc())
        .first()
    )
    advice = MealAdvice(
        advice_id=make_uuid(),
        meal_id=meal.meal_id,
        dip_score=dip,
        decision_mode=decision_mode,
        task_mode=task_mode,
        next_action=next_action,
        why_tokens=why_tokens,
        confidence=conf,
        engine_version=ADVICE_VERSIONS["engine_version"],
        model_version=ADVICE_VERSIONS["model_version"],
        prompt_version=ADVICE_VERSIONS["prompt_version"],
        dataset_version=ADVICE_VERSIONS["dataset_version"],
    )
    db.add(advice)
    db.commit()
    db.refresh(advice)
    if existing_advice is not None:
        # Keep history rows; no delete/update.
        pass
    return effect, advice


def validate_post_check_window(meal: MealLog, req: PostCheckRequest) -> bool:
    submitted = req.submitted_at or _utcnow()
    submitted = _to_aware_utc(submitted)
    meal_time = _to_aware_utc(meal.meal_time)
    if req.slot == "T30":
        return submitted > (meal_time + timedelta(minutes=45))
    return submitted > (meal_time + timedelta(minutes=120))


def _is_quiet_hours(local_time: datetime, quiet_start_hour: int = 22, quiet_end_hour: int = 8) -> bool:
    hour = local_time.hour
    if quiet_start_hour <= quiet_end_hour:
        return quiet_start_hour <= hour < quiet_end_hour
    return hour >= quiet_start_hour or hour < quiet_end_hour


def _next_window_start(local_time: datetime, quiet_end_hour: int = 8) -> datetime:
    target = local_time.replace(hour=quiet_end_hour, minute=0, second=0, microsecond=0)
    if local_time.hour >= quiet_end_hour:
        target = target + timedelta(days=1)
    return target


def process_due_scheduler_jobs(
    db: Session,
    *,
    actor: Actor,
    limit: int = 50,
    quiet_policy: str = "next_window",
    channel: str = "push",
) -> dict[str, int]:
    now = _utcnow()
    jobs = (
        db.query(MealSchedulerJob)
        .filter(
            MealSchedulerJob.tenant_id == actor.tenant_id,
            MealSchedulerJob.user_id == actor.user_id,
            MealSchedulerJob.status == "queued",
            MealSchedulerJob.due_at <= now,
        )
        .order_by(MealSchedulerJob.due_at.asc())
        .limit(limit)
        .all()
    )

    counts = {"processed": 0, "sent": 0, "failed": 0, "skipped": 0, "rescheduled": 0}
    for job in jobs:
        counts["processed"] += 1
        local_due = job.due_at.astimezone(timezone.utc)
        if _is_quiet_hours(local_due):
            if quiet_policy == "skip":
                job.status = "skipped"
                job.last_error = "quiet_hours_skipped"
                counts["skipped"] += 1
                continue
            next_due = _next_window_start(local_due)
            job.due_at = next_due.astimezone(timezone.utc)
            counts["rescheduled"] += 1
            continue

        token = (
            db.query(DeviceToken)
            .filter(
                DeviceToken.tenant_id == actor.tenant_id,
                DeviceToken.user_id == actor.user_id,
                DeviceToken.is_active.is_(True),
            )
            .order_by(DeviceToken.last_seen_at.desc(), DeviceToken.created_at.desc())
            .first()
        )
        job.attempts = int(job.attempts or 0) + 1
        if token is None:
            job.status = "failed"
            job.last_error = "no_active_device_token"
            counts["failed"] += 1
            continue

        push_result = send_push_notification(
            channel=channel,
            platform=token.platform,
            push_token=token.push_token,
            title="Meal check reminder",
            body="Please complete your post-meal check now. It only takes 1 minute.",
            data={"meal_id": job.meal_id, "job_type": job.job_type},
        )
        if push_result.ok:
            job.status = "sent"
            job.sent_at = now
            job.last_error = None
            counts["sent"] += 1
            log_event(
                db,
                actor=actor,
                event_name="post_check_sent",
                meal_id=job.meal_id,
                payload={
                    "job_id": job.job_id,
                    "job_type": job.job_type,
                    "channel": channel,
                    "attempt": int(job.attempts),
                    "dispatch_mode": "scheduler_worker",
                    "provider": push_result.provider,
                    "message_id": push_result.message_id,
                },
            )
        else:
            job.status = "failed"
            job.last_error = push_result.error or "push_send_failed"
            counts["failed"] += 1
    db.commit()
    return counts


def process_due_scheduler_jobs_global(
    db: Session,
    *,
    limit: int = 200,
    quiet_policy: str = "next_window",
    channel: str = "push",
) -> dict[str, int]:
    now = _utcnow()
    jobs = (
        db.query(MealSchedulerJob)
        .filter(MealSchedulerJob.status == "queued", MealSchedulerJob.due_at <= now)
        .order_by(MealSchedulerJob.due_at.asc())
        .limit(limit)
        .all()
    )
    counts = {"processed": 0, "sent": 0, "failed": 0, "skipped": 0, "rescheduled": 0}
    for job in jobs:
        actor = Actor(user_id=job.user_id, tenant_id=job.tenant_id, role="Owner")
        partial = process_due_scheduler_jobs(
            db,
            actor=actor,
            limit=1,
            quiet_policy=quiet_policy,
            channel=channel,
        )
        for key in counts:
            counts[key] += int(partial.get(key, 0))
    return counts


def upsert_post_check(db: Session, *, meal: MealLog, req: PostCheckRequest) -> PostMealCheck:
    submitted = req.submitted_at or _utcnow()
    if submitted.tzinfo is None:
        submitted = submitted.replace(tzinfo=timezone.utc)
    check_ms = None
    if req.notification_opened_at is not None:
        opened = req.notification_opened_at
        if opened.tzinfo is None:
            opened = opened.replace(tzinfo=timezone.utc)
        diff = int((submitted - opened).total_seconds() * 1000)
        check_ms = max(0, diff)

    existing = (
        db.query(PostMealCheck)
        .filter(PostMealCheck.meal_id == meal.meal_id, PostMealCheck.slot == req.slot)
        .one_or_none()
    )
    if existing is None:
        row = PostMealCheck(
            check_id=make_uuid(),
            meal_id=meal.meal_id,
            slot=req.slot,
            sleepiness=req.sleepiness,
            focus_drop=req.focus_drop,
            sluggishness=req.sluggishness,
            gi_discomfort=req.gi_discomfort,
            headache=req.headache,
            caffeine_used=req.caffeine_used,
            check_completion_time_ms=check_ms,
            submitted_at=submitted,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    # Allow one correction within 15 minutes for same slot.
    if abs((submitted - existing.submitted_at).total_seconds()) > 900:
        raise ValueError("SLOT_ALREADY_SUBMITTED")

    existing.sleepiness = req.sleepiness
    existing.focus_drop = req.focus_drop
    existing.sluggishness = req.sluggishness
    existing.gi_discomfort = req.gi_discomfort
    existing.headache = req.headache
    existing.caffeine_used = req.caffeine_used
    existing.check_completion_time_ms = check_ms
    existing.submitted_at = submitted
    db.commit()
    db.refresh(existing)
    return existing


def summarize_week(db: Session, *, actor: Actor, week_start: date) -> WeeklySummaryResponse:
    start_dt = datetime.combine(week_start, time.min).replace(tzinfo=timezone.utc)
    end_dt = start_dt + timedelta(days=7)

    meals = (
        db.query(MealLog)
        .filter(
            MealLog.tenant_id == actor.tenant_id,
            MealLog.user_id == actor.user_id,
            MealLog.meal_time >= start_dt,
            MealLog.meal_time < end_dt,
            MealLog.deleted_at.is_(None),
        )
        .all()
    )
    ate_meals = [m for m in meals if m.meal_state == "ATE"]
    meal_ids = [m.meal_id for m in ate_meals]
    days_logged = len({m.meal_time.date() for m in meals})

    checks = []
    effects = []
    if meal_ids:
        checks = db.query(PostMealCheck).filter(PostMealCheck.meal_id.in_(meal_ids)).all()
        effects = db.query(MealPostEffect).filter(MealPostEffect.meal_id.in_(meal_ids)).all()

    t30_count = sum(1 for c in checks if c.slot == "T30")
    t30_response = (t30_count / len(ate_meals)) if ate_meals else 0.0
    avg_dip = (sum(float(e.dip_score) for e in effects) / len(effects)) if effects else 0.0
    zero_input = (sum(1 for m in meals if m.source == "auto") / len(meals)) if meals else 0.0

    events = (
        db.query(EventLog)
        .filter(
            EventLog.tenant_id == actor.tenant_id,
            EventLog.event_time >= start_dt,
            EventLog.event_time < end_dt,
            EventLog.event_name.in_(["advice_followed", "advice_generated"]),
        )
        .all()
    )
    generated = sum(1 for e in events if e.event_name == "advice_generated")
    followed = sum(1 for e in events if e.event_name == "advice_followed")
    advice_follow = (followed / generated) if generated else 0.0

    return WeeklySummaryResponse(
        week_start=week_start,
        days_logged=days_logged,
        avg_dip_score=round(avg_dip, 2),
        t30_response_rate=round(t30_response, 4),
        advice_follow_rate=round(advice_follow, 4),
        zero_input_meal_rate=round(zero_input, 4),
    )

