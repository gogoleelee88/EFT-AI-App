from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.spec_loop.condition.schemas import CheckinRequest, CheckinResponse, MinConditionSet
from backend.spec_loop.condition.summary_service import build_daily_condition_summary
from backend.spec_loop.dataset_priors import get_dataset_priors
from backend.spec_loop.models import Condition, DailyConditionSummary, DayPlan
from backend.spec_loop.google_calendar.models import GoogleEventMapping
from backend.spec_loop.google_calendar.sync import fetch_google_events, update_google_event

_DEFAULT_PRIORS: dict[str, Any] = {
    "condition_score": {
        "sleep_penalty": {"LT5": -25, "H5_6": -15, "H6_7": -8, "H7_8": 0, "GT8": 0},
        "mood_penalty": {"calm": 0, "ok": -5, "anxious": -15, "low": -20, "irritated": -15},
        "period_penalty": {"on": -8, "pre": -5, "post": 0, "none": 0},
        "fatigue_weight": 4,
        "pain_weight": 6,
        "behavior_inference": {
            "require_inferred_flag": True,
            "input_latency": {"threshold_sec": 120, "penalty": 5},
            "app_switch": {"threshold_30min": 15, "penalty": 5},
        },
    }
}


def _score_cfg() -> dict[str, Any]:
    priors = get_dataset_priors(_DEFAULT_PRIORS)
    return dict(priors.get("condition_score") or {})


def _build_inferred_flags(behavior_inference: Optional[dict]) -> Optional[dict[str, Any]]:
    if not behavior_inference:
        return None

    cfg = _score_cfg()
    inference_cfg = cfg.get("behavior_inference") or {}
    require_inferred = bool(inference_cfg.get("require_inferred_flag", True))
    if require_inferred and behavior_inference.get("inferred") is not True:
        return None

    latency_cfg = inference_cfg.get("input_latency") or {}
    switch_cfg = inference_cfg.get("app_switch") or {}
    latency_threshold = int(latency_cfg.get("threshold_sec", 120))
    switch_threshold = int(switch_cfg.get("threshold_30min", 15))

    flags: dict[str, Any] = {"inferred": True}
    if int(behavior_inference.get("input_latency_sec") or 0) > latency_threshold:
        flags["input_latency_high"] = True
    if int(behavior_inference.get("app_switch_count_30min") or 0) > switch_threshold:
        flags["app_switch_high"] = True
    return flags or None


def compute_condition_score(min_condition_set: MinConditionSet, behavior_inference: Optional[dict] = None) -> int:
    cfg = _score_cfg()
    sleep_penalty = cfg.get("sleep_penalty") or {}
    mood_penalty = cfg.get("mood_penalty") or {}
    period_penalty = cfg.get("period_penalty") or {}
    fatigue_weight = int(cfg.get("fatigue_weight", 4))
    pain_weight = int(cfg.get("pain_weight", 6))

    inference_cfg = cfg.get("behavior_inference") or {}
    require_inferred = bool(inference_cfg.get("require_inferred_flag", True))
    latency_cfg = inference_cfg.get("input_latency") or {}
    switch_cfg = inference_cfg.get("app_switch") or {}
    latency_threshold = int(latency_cfg.get("threshold_sec", 120))
    switch_threshold = int(switch_cfg.get("threshold_30min", 15))
    latency_penalty = int(latency_cfg.get("penalty", 5))
    switch_penalty = int(switch_cfg.get("penalty", 5))

    score = 100
    score += int(sleep_penalty.get(min_condition_set.sleep_hours, 0))
    score -= min_condition_set.fatigue * fatigue_weight
    score -= min_condition_set.pain * pain_weight
    score += int(mood_penalty.get(min_condition_set.mood, 0))
    score += int(period_penalty.get(min_condition_set.period_status or "none", 0))

    if behavior_inference:
        inferred_ok = behavior_inference.get("inferred") is True
        if (not require_inferred) or inferred_ok:
            if int(behavior_inference.get("input_latency_sec") or 0) > latency_threshold:
                score -= latency_penalty
            if int(behavior_inference.get("app_switch_count_30min") or 0) > switch_threshold:
                score -= switch_penalty

    return max(0, min(100, score))


def compute_mode_from_score(score: int) -> int:
    if score >= 70:
        return 100
    if score >= 40:
        return 70
    return 40


def apply_pain_override(pain: int, score: int, pain_delta: Optional[int]) -> int:
    if pain >= 9:
        return 40
    if pain >= 7:
        return 70
    if pain_delta is not None and pain_delta >= 2:
        return 70
    return compute_mode_from_score(score)


def _resolve_condition_domain(body: CheckinRequest) -> str:
    if body.condition_domain is not None:
        return str(body.condition_domain)
    if body.menstrual_quick_check is not None or body.period_start_date is not None:
        return "MENSTRUAL"
    return "GENERAL"


def _build_menstrual_metrics(body: CheckinRequest) -> dict[str, Any] | None:
    if body.menstrual_quick_check is None and body.period_start_date is None:
        return None
    metrics: dict[str, Any] = {}
    if body.menstrual_quick_check is not None:
        metrics.update(body.menstrual_quick_check.model_dump(exclude_none=True))
    if body.period_start_date is not None:
        metrics["period_start_date"] = body.period_start_date.isoformat()
    return metrics or None


def _find_daily_summary(
    db: Session,
    target_date: datetime,
    user_id: str | None,
) -> DailyConditionSummary | None:
    q = db.query(DailyConditionSummary).filter(DailyConditionSummary.date == target_date.date())
    if user_id:
        q = q.filter(DailyConditionSummary.user_id == user_id)
    else:
        q = q.filter(DailyConditionSummary.user_id.is_(None))
    return q.first()


def _build_medical_attention_notice(db: Session, metrics: dict[str, Any] | None) -> str | None:
    if not metrics:
        return None
    cramps = int(metrics.get("cramps_0_4") or -1)
    bleeding = int(metrics.get("bleeding_level_0_2") or -1)
    if cramps < 4 and bleeding < 2:
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (
        db.query(Condition)
        .filter(Condition.condition_domain == "MENSTRUAL", Condition.ts >= cutoff)
        .all()
    )
    high_count = 0
    for row in rows:
        row_metrics = row.metrics if isinstance(row.metrics, dict) else {}
        r_cramps = int(row_metrics.get("cramps_0_4") or -1)
        r_bleeding = int(row_metrics.get("bleeding_level_0_2") or -1)
        if r_cramps >= 4 or r_bleeding >= 2:
            high_count += 1
    if high_count >= 2:
        return "high menstrual symptom risk detected (cramps/bleeding pattern). Please review clinically."
    return None


def _parse_iso_datetime(raw: Any) -> datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _get_block_minutes_for_task(items: list[dict[str, Any]], task_id: int) -> int:
    for it in items:
        if int(it.get("task_id") or -1) == task_id:
            raw_minutes = it.get("planned_block_minutes") or 30
            try:
                return max(15, int(raw_minutes))
            except (TypeError, ValueError):
                return 30
    return 30


def _sync_delay_tasks_to_google(
    db: Session,
    user_id: str,
    day_date: Any,
    delayed_task_ids: list[int],
    day_items: list[dict[str, Any]],
) -> tuple[bool, str | None]:
    if not delayed_task_ids:
        return False, None

    try:
        events = fetch_google_events(db, user_id, day_date)
    except Exception:
        return False, "Google Calendar event fetch failed. Reauthorize Google account and retry."

    event_by_id = {
        str(ev.get("id")): ev
        for ev in events
        if isinstance(ev, dict) and ev.get("id") is not None
    }
    moved_events: list[str] = []
    defer_hour = 9
    defer_minute = 30

    for raw_task_id in delayed_task_ids:
        try:
            task_id = int(raw_task_id)
        except (TypeError, ValueError):
            continue

        mapping = (
            db.query(GoogleEventMapping)
            .filter(
                GoogleEventMapping.user_id == user_id,
                GoogleEventMapping.task_id == task_id,
            )
            .order_by(GoogleEventMapping.updated_at.desc())
            .first()
        )
        if mapping is None:
            continue

        event = event_by_id.get(str(mapping.google_event_id))
        if event is None:
            continue

        event_start = _parse_iso_datetime(event.get("start"))
        event_end = _parse_iso_datetime(event.get("end"))
        block_minutes = 30
        if event_start is not None and event_end is not None and event_end > event_start:
            block_minutes = max(15, int((event_end - event_start).total_seconds() // 60))

        if block_minutes < 15:
            block_minutes = _get_block_minutes_for_task(day_items, task_id)

        base_date = day_date.date() if isinstance(day_date, datetime) else day_date
        new_start = datetime.combine(
            base_date + timedelta(days=1),
            time(defer_hour, defer_minute, tzinfo=timezone.utc),
        )
        new_end = new_start + timedelta(minutes=block_minutes)

        try:
            update_google_event(
                db=db,
                user_id=user_id,
                event_id=str(mapping.google_event_id),
                start=new_start,
                end=new_end,
                summary=None,
                calendar_id=mapping.calendar_id or "primary",
            )
        except Exception:
            continue

        moved_events.append(str(mapping.google_event_id))

    if not moved_events:
        return False, "Google Calendar sync skipped: no delayed events were moved."
    return True, f"Google Calendar {len(moved_events)} delayed tasks moved to next day at 09:30."


def _safe_task_id(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _collect_task_blocks(items: list[dict[str, Any]]) -> dict[int, int]:
    blocks: dict[int, int] = {}
    for it in items:
        task_id = _safe_task_id(it.get("task_id"))
        if task_id is None:
            continue
        raw = it.get("planned_block_minutes")
        if raw is None:
            continue
        try:
            mins = int(raw)
        except (TypeError, ValueError):
            continue
        blocks[task_id] = max(1, mins)
    return blocks


def _collect_task_order(items: list[dict[str, Any]]) -> list[int]:
    ordered: list[int] = []
    seen: set[int] = set()
    for it in items:
        task_id = _safe_task_id(it.get("task_id"))
        if task_id is None or task_id in seen:
            continue
        seen.add(task_id)
        ordered.append(task_id)
    return ordered


def _sync_plan_tasks_to_google(
    db: Session,
    user_id: str,
    day_date: Any,
    before_items: list[dict[str, Any]],
    after_items: list[dict[str, Any]],
    actions_applied: list[str],
) -> tuple[bool, str | None]:
    if not any(action in {"shrink", "swap", "split", "protect"} for action in actions_applied):
        return False, None

    target_order = _collect_task_order(after_items)
    if not target_order:
        return False, None

    before_blocks = _collect_task_blocks(before_items)
    after_blocks = _collect_task_blocks(after_items)
    task_ids = sorted(set(before_blocks) | set(after_blocks) | set(target_order))
    if not task_ids:
        return False, None

    try:
        events = fetch_google_events(db, user_id, day_date)
    except Exception:
        return False, "Google Calendar event fetch failed. Reconnect Google account and retry."

    events_by_id = {
        str(ev.get("id")): ev
        for ev in events
        if isinstance(ev, dict) and ev.get("id") is not None
    }
    if not events_by_id:
        return False, "Google Calendar has no events to process for this day."

    mappings = (
        db.query(GoogleEventMapping)
        .filter(
            GoogleEventMapping.user_id == user_id,
            GoogleEventMapping.task_id.in_(task_ids),
        )
        .order_by(GoogleEventMapping.updated_at.desc())
        .all()
    )
    mapping_by_task: dict[int, GoogleEventMapping] = {}
    for mapping in mappings:
        mapping_by_task[int(mapping.task_id)] = mapping
    if not mapping_by_task:
        return False, "Google Calendar has no event mappings for the target tasks."

    mapped_rows: list[tuple[int, datetime, datetime, GoogleEventMapping]] = []
    for task_id, mapping in mapping_by_task.items():
        raw = events_by_id.get(str(mapping.google_event_id))
        if raw is None:
            continue
        start = _parse_iso_datetime(raw.get("start"))
        end = _parse_iso_datetime(raw.get("end"))
        if start is None or end is None or end <= start:
            continue
        mapped_rows.append((task_id, start, end, mapping))
    if not mapped_rows:
        return False, "Google Calendar has no mapped schedule rows for requested reorder."

    mapped_rows.sort(key=lambda row: row[1])
    slots = [(row[1], row[2]) for row in mapped_rows]
    current_by_task = {
        task_id: (start, end, mapping.calendar_id or "primary", str(mapping.google_event_id))
        for task_id, start, end, mapping in mapped_rows
    }

    ordered_update_targets: list[int] = []
    for task_id in target_order:
        if task_id in current_by_task and task_id not in ordered_update_targets:
            ordered_update_targets.append(task_id)

    if not ordered_update_targets:
        return False, "Google Calendar has no matching events for the requested order."

    updated = 0
    for idx, task_id in enumerate(ordered_update_targets):
        if idx >= len(slots):
            break

        target_start = slots[idx][0]
        cur_start, cur_end, calendar_id, event_id = current_by_task[task_id]
        target_block = after_blocks.get(task_id, _get_block_minutes_for_task(after_items, task_id))
        target_end = target_start + timedelta(minutes=target_block)
        if target_end <= target_start:
            target_end = cur_end

        if cur_start == target_start and cur_end == target_end:
            continue

        try:
            update_google_event(
                db=db,
                user_id=user_id,
                event_id=event_id,
                start=target_start,
                end=target_end,
                summary=None,
                calendar_id=calendar_id,
            )
        except Exception:
            continue

        updated += 1
        current_by_task[task_id] = (target_start, target_end, calendar_id, event_id)

    if updated == 0:
        return False, "Google Calendar reorder request did not update any event."
        return False, "Google Calendar had no eligible events for the time window."

        return True, f"Google Calendar {updated} events reordered successfully."


def checkin(
    db: Session,
    body: CheckinRequest,
    *,
    user_id: Optional[str] = None,
) -> CheckinResponse:
    now = body.ts or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    pain_delta: Optional[int] = None
    if body.previous_condition_id:
        prev = db.query(Condition).filter(Condition.condition_id == body.previous_condition_id).first()
        if prev and prev.min_condition_set and isinstance(prev.min_condition_set, dict):
            prev_pain = prev.min_condition_set.get("pain")
            if prev_pain is not None:
                pain_delta = body.min_condition_set.pain - int(prev_pain)

    score = compute_condition_score(body.min_condition_set, body.behavior_inference)
    final_mode = apply_pain_override(body.min_condition_set.pain, score, pain_delta)
    condition_domain = _resolve_condition_domain(body)
    menstrual_metrics = _build_menstrual_metrics(body)
    effective_user_id = body.user_id or user_id

    inferred_flags = _build_inferred_flags(body.behavior_inference)
    daily_summary = build_daily_condition_summary(
        body.min_condition_set,
        body.menstrual_quick_check,
        body.behavior_inference,
    )

    row = Condition(
        ts=now,
        source_level=body.source_level,
        min_condition_set=body.min_condition_set.model_dump(),
        wearable=body.wearable,
        behavior_inference=body.behavior_inference,
        condition_score=score,
        inferred_flags=inferred_flags,
        condition_domain=condition_domain,
        metrics=menstrual_metrics,
        data_quality=daily_summary.get("data_quality"),
        confidence=daily_summary.get("confidence"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    adapt_applied = False
    updated_day_plan: Optional[dict[str, Any]] = None
    google_calendar_synced = False
    google_calendar_sync_message: Optional[str] = None

    if body.day_id is not None:
        plan = db.query(DayPlan).filter(DayPlan.day_id == body.day_id).first()
        if plan and plan.mode != final_mode:
            before_items = list(plan.items or [])
            if effective_user_id is None and plan.user_id:
                effective_user_id = plan.user_id
            from backend.spec_loop.adapter import service as adapter_service
            from backend.spec_loop.mode_change import service as mode_change_service

            mode_change_service.can_change(db, body.day_id, plan.mode, final_mode)
            result = adapter_service.apply_adaptation(
                db,
                body.day_id,
                row.condition_id,
                target_mode=final_mode,
                condition_score=score,
            )
            actions_applied = list(result.get("actions_applied") or [])
            mode_change_service.record(db, body.day_id, plan.mode, final_mode, reason="checkin")
            plan.mode = final_mode
            db.commit()
            db.refresh(plan)
            adapt_applied = bool(actions_applied)
            updated_day_plan = result.get("updated_plan") or {
                "day_id": plan.day_id,
                "date": plan.date.isoformat() if hasattr(plan.date, "isoformat") else str(plan.date),
                "mode": plan.mode,
                "items": plan.items,
                "protected_block_minutes": plan.protected_block_minutes,
            }
            if updated_day_plan is not None:
                updated_day_plan["mode"] = final_mode
            if updated_day_plan and "mode" not in updated_day_plan:
                updated_day_plan["mode"] = final_mode
            delay_task_ids = [
                int(task_id)
                for task_id in (result.get("delay_scheduler_hint") or [])
                if str(task_id).strip()
            ]
            sync_messages: list[str] = []
            updated_items: list[dict[str, Any]] = list((updated_day_plan or {}).get("items") or [])
            if not updated_items and isinstance(plan.items, list):
                updated_items = list(plan.items)
            if delay_task_ids and effective_user_id is not None:
                try:
                    google_calendar_synced, sync_message = _sync_delay_tasks_to_google(
                        db,
                        effective_user_id,
                        plan.date,
                        delay_task_ids,
                        list(plan.items or []),
                    )
                    if sync_message:
                        sync_messages.append(sync_message)
                except Exception:
                    google_calendar_synced = False
                    google_calendar_sync_message = None
            if effective_user_id is not None:
                try:
                    sync_applied, sync_message = _sync_plan_tasks_to_google(
                        db,
                        effective_user_id,
                        plan.date,
                        before_items,
                        updated_items,
                        actions_applied,
                    )
                    if sync_message:
                        sync_messages.append(sync_message)
                    if sync_applied:
                        google_calendar_synced = True
                except Exception:
                    pass
            if sync_messages:
                google_calendar_sync_message = " | ".join(sync_messages)

    if body.period_start_date is not None:
        from backend.spec_loop.cycle import service as cycle_service

        cycle_service.upsert_cycle_state(
            db=db,
            reference_date=now.date(),
            user_id=effective_user_id,
            last_period_start_date=body.period_start_date,
        )

    summary_row = _find_daily_summary(db, now, effective_user_id)
    if summary_row is None:
        summary_row = DailyConditionSummary(
            user_id=effective_user_id,
            day_id=body.day_id,
            condition_id=row.condition_id,
            date=now.date(),
            drivers=daily_summary.get("drivers"),
            confidence=daily_summary.get("confidence"),
            evidence_snapshot=daily_summary.get("evidence_snapshot"),
            menstrual_score=daily_summary.get("menstrual_score_0_100"),
            data_quality=daily_summary.get("data_quality"),
        )
        db.add(summary_row)
    else:
        summary_row.day_id = body.day_id
        summary_row.condition_id = row.condition_id
        summary_row.drivers = daily_summary.get("drivers")
        summary_row.confidence = daily_summary.get("confidence")
        summary_row.evidence_snapshot = daily_summary.get("evidence_snapshot")
        summary_row.menstrual_score = daily_summary.get("menstrual_score_0_100")
        summary_row.data_quality = daily_summary.get("data_quality")
    db.commit()

    # Bidirectional sync bridge: /api/spec/condition/checkin -> /api/v1 meal coaching.
    try:
        from backend.meal_coach.sync import sync_condition_checkin_to_meal

        sync_condition_checkin_to_meal(
            db,
            body=body,
            condition_id=row.condition_id,
            ts=now,
            effective_user_id=effective_user_id,
        )
    except Exception:
        # Do not fail primary checkin path if bridge sync fails.
        pass

    medical_attention_notice = _build_medical_attention_notice(db, menstrual_metrics)

    return CheckinResponse(
        condition_id=row.condition_id,
        ts=row.ts,
        source_level=row.source_level,
        condition_score=row.condition_score,
        final_mode=final_mode,
        inferred_flags=row.inferred_flags,
        adapt_applied=adapt_applied,
        updated_day_plan=updated_day_plan,
        condition_domain=condition_domain,
        confidence=daily_summary.get("confidence"),
        daily_summary=daily_summary,
        medical_attention_notice=medical_attention_notice,
        google_calendar_synced=google_calendar_synced,
        google_calendar_sync_message=google_calendar_sync_message,
    )


def handle_user_stop_impossible(
    db: Session,
    day_id: int,
    condition_id: int,
    *,
    target_mode: int = 40,
    condition_score: int = 30,
) -> dict[str, Any]:
    from backend.spec_loop.adapter import service as adapter_service

    return adapter_service.apply_adaptation(
        db,
        day_id,
        condition_id,
        target_mode=target_mode,
        condition_score=condition_score,
    )



