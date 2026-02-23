from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.spec_loop.dataset_priors import get_dataset_priors
from backend.spec_loop.google_calendar.models import GoogleEventMapping
from backend.spec_loop.google_calendar.sync import create_google_event, fetch_google_events, update_google_event
from backend.spec_loop.models import DailyConditionSummary, DayPlan, Task
from backend.spec_loop.plan_patch.schemas import PatchType

IMPORTANT_KEYWORDS = ("critical", "important", "high", "deadline", "urgent", "priority", "focus", "required")
DECISION_KEYWORDS = ("결정", "승인", "조치", "리뷰", "피드백", "의사결정", "재확인")
DEEP_WORK_KEYWORDS = ("심화", "집중", "연구", "분석", "코드", "개발")
_DEFAULT_PRIORS: dict[str, Any] = {
    "plan_patch": {
        "buffer": {"before_minutes": 10, "after_minutes": 15},
        "split_deep_work": {"min_block_minutes": 90, "segments": [45, 15, 45]},
        "decision_delay": {"defer_hour_utc": 9, "defer_minute_utc": 30},
        "quality_gate": {"disallow_move_or_cancel_when_confidence": "low"},
    }
}


def _patch_cfg() -> dict[str, Any]:
    priors = get_dataset_priors(_DEFAULT_PRIORS)
    return dict(priors.get("plan_patch") or {})


def _find_day_plan(db: Session, target_date: date, user_id: str | None, day_id: int | None) -> DayPlan | None:
    if day_id is not None:
        return db.query(DayPlan).filter(DayPlan.day_id == day_id).first()

    q = db.query(DayPlan).filter(DayPlan.date == target_date)
    if user_id:
        q = q.filter(DayPlan.user_id == user_id)
    else:
        q = q.filter(DayPlan.user_id.is_(None))
    plan = q.order_by(DayPlan.day_id.desc()).first()
    if plan is not None:
        return plan
    return db.query(DayPlan).filter(DayPlan.date == target_date).order_by(DayPlan.day_id.desc()).first()


def _load_task_map(db: Session, items: list[dict[str, Any]]) -> dict[int, Task]:
    task_ids = [it.get("task_id") for it in items if isinstance(it.get("task_id"), int)]
    if not task_ids:
        return {}
    rows = db.query(Task).filter(Task.task_id.in_(task_ids)).all()
    return {row.task_id: row for row in rows}


def _load_summary(
    db: Session,
    target_date: date,
    user_id: str | None,
) -> DailyConditionSummary | None:
    q = db.query(DailyConditionSummary).filter(DailyConditionSummary.date == target_date)
    if user_id:
        q = q.filter(DailyConditionSummary.user_id == user_id)
    else:
        q = q.filter(DailyConditionSummary.user_id.is_(None))
    row = q.order_by(DailyConditionSummary.summary_id.desc()).first()
    if row is not None:
        return row
    return (
        db.query(DailyConditionSummary)
        .filter(DailyConditionSummary.date == target_date)
        .order_by(DailyConditionSummary.summary_id.desc())
        .first()
    )


def _is_important(item: dict[str, Any], task: Task | None) -> bool:
    if task and (task.priority or 0) >= 4:
        return True
    title = str(item.get("title") or getattr(task, "title", "") or "").lower()
    return any(k.lower() in title for k in IMPORTANT_KEYWORDS)


def _is_decision_item(item: dict[str, Any], task: Task | None) -> bool:
    title = str(item.get("title") or getattr(task, "title", "") or "").lower()
    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    tag_text = " ".join(str(t).lower() for t in tags)
    return any(k.lower() in title or k.lower() in tag_text for k in DECISION_KEYWORDS)


def _build_common_payload(
    target_date: date,
    summary: DailyConditionSummary | None,
) -> dict[str, Any]:
    drivers_raw = list(summary.drivers or []) if summary and isinstance(summary.drivers, list) else []
    drivers_top2 = []
    for d in drivers_raw[:2]:
        if not isinstance(d, dict):
            continue
        drivers_top2.append(
            {
                "driver": str(d.get("driver") or "UNKNOWN"),
                "score": int(d.get("score") or 0),
                "confidence": str(d.get("confidence") or "low"),
            }
        )
    return {
        "date": target_date,
        "confidence": (summary.confidence if summary and summary.confidence else "low"),
        "evidence_snapshot": list(summary.evidence_snapshot or []) if summary else [],
        "drivers": drivers_raw,
        "drivers_top2": drivers_top2,
        "data_quality": (summary.data_quality if summary else None),
    }


def suggest_plan_patch(
    db: Session,
    target_date: date,
    user_id: str | None = None,
    day_id: int | None = None,
) -> dict[str, Any]:
    cfg = _patch_cfg()
    buffer_cfg = cfg.get("buffer") or {}
    split_cfg = cfg.get("split_deep_work") or {}
    gate_cfg = cfg.get("quality_gate") or {}

    before_minutes = int(buffer_cfg.get("before_minutes", 10))
    after_minutes = int(buffer_cfg.get("after_minutes", 15))
    split_min = int(split_cfg.get("min_block_minutes", 90))
    split_segments = list(split_cfg.get("segments") or [45, 15, 45])
    quality_gate_conf = str(gate_cfg.get("disallow_move_or_cancel_when_confidence", "low"))

    plan = _find_day_plan(db, target_date, user_id, day_id)
    summary = _load_summary(db, target_date, user_id)
    payload = _build_common_payload(target_date, summary)

    if plan is None:
        return {**payload, "suggestions": []}

    items = list(plan.items or [])
    tasks = _load_task_map(db, items)
    confidence = str(payload["confidence"] or "low")
    suggestions: list[dict[str, Any]] = []

    important_item = None
    for it in items:
        task = tasks.get(it.get("task_id")) if isinstance(it.get("task_id"), int) else None
        if _is_important(it, task):
            important_item = it
            break
    if important_item is None and items:
        important_item = items[0]

    if important_item is not None:
        suggestions.append(
            {
                "patch_type": "BUFFER_BLOCK",
                "reason": "嶺??욕퐲?????뜯뫀?ｈ굜??嶺?瑗룟퐲???嶺??욘?彛??嶺???????嶺뚯쉸?욤굜?쇈뀋?嶺??욱씇嶺???嶺뚯쉸?앲굜????嶺?嶺?瑗룡?勇싲８?녻굜?嶺??욕퐲???嶺?瑗룟퐲?",
                "allowed": True,
                "blocked_reason": None,
                "preview": {
                    "target_task_id": important_item.get("task_id"),
                    "buffer_before_minutes": before_minutes,
                    "buffer_after_minutes": after_minutes,
                },
            }
        )

    deep_item = next((it for it in items if int(it.get("planned_block_minutes") or 0) >= split_min), None)
    if deep_item is not None:
        suggestions.append(
            {
                "patch_type": "SPLIT_DEEP_WORK",
                "reason": "嶺?????嶺??욕퐲????? 嶺?瑗룡↔낀??瑜곸톭??嶺?瑗룡?????嶺뚯쉸?앲굜?嶺?????嶺뚯쉸裕뉓굜?쎌?獄??꾩엺????嶺?瑗?勇??嶺???嶺?瑗룟퐲??嶺??꾩엺???嶺?瑗?勇?嶺뚯쉧?됭굜??",
                "allowed": True,
                "blocked_reason": None,
                "preview": {"target_task_id": deep_item.get("task_id"), "from": split_min, "to": split_segments},
            }
        )

    decision_item = None
    for it in items:
        task = tasks.get(it.get("task_id")) if isinstance(it.get("task_id"), int) else None
        if _is_decision_item(it, task):
            decision_item = it
            break
    if decision_item is not None:
        blocked = confidence == quality_gate_conf
        suggestions.append(
            {
                "patch_type": "DECISION_DELAY",
                "reason": "嶺?????춯?瑗???嶺????됥럷??猷됬춯?뚯굣????뜯뫀?ｈ굜? ?勇싲８?녻굜?쇈렎??嶺뚯쉸?앲굜??뜯뫀?ｈ굜醫묒??嶺?瑗??뚣뀋??고맰嶺뚯쉸??戮녈럷??猷믥춯?뚯굣??嶺?瑗룡〓쨪??瑜곹맯勇싲８??瑜끹럷?瑜곸톭 ?嶺?嶺뚯쉧?됭굜??",
                "allowed": not blocked,
                "blocked_reason": "confidence=low?嶺???勇싲８?녻굜?嶺??욘?彛???嶺???嶺??욘?嶺??욕퐲醫묒?筌뤾쑴??툣猷몃뾼?꾩쥜彛??嶺????嶺? ?嶺??욘?嶺?瑗룟퐲?" if blocked else None,
                "preview": {
                    "target_task_id": decision_item.get("task_id"),
                    "defer_to": (target_date + timedelta(days=1)).isoformat(),
                    "fallback_template": "?嶺뚯쉸?앲굜? ?嶺??꾟댙彛??뱁맯勇싲８?녻굜?뚣뀋?嶺?瑗룟퐲?嶺???勇싲８留⑵굜?嶺??? 嶺???猷됬춯?뚯굣?? ?勇싲８?녻굜?쇈렎??嶺뚯쉸?앲굜???嶺?嶺???猷?勇싲８留⑵굜??",
                },
            }
        )

    return {**payload, "suggestions": suggestions}


def _find_latest_mapping_by_task(db: Session, user_id: str, task_id: int | None) -> GoogleEventMapping | None:
    if task_id is None:
        return None
    return (
        db.query(GoogleEventMapping)
        .filter(GoogleEventMapping.user_id == user_id, GoogleEventMapping.task_id == task_id)
        .order_by(GoogleEventMapping.updated_at.desc())
        .first()
    )


def _find_mapping_by_event_id(db: Session, user_id: str, event_id: str | None) -> GoogleEventMapping | None:
    if not event_id:
        return None
    return (
        db.query(GoogleEventMapping)
        .filter(GoogleEventMapping.user_id == user_id, GoogleEventMapping.google_event_id == event_id)
        .order_by(GoogleEventMapping.updated_at.desc())
        .first()
    )


def _parse_event_datetime(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        if len(raw) == 10:
            dt = datetime.fromisoformat(f"{raw}T09:00:00+00:00")
        else:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _deep_work_score(event: dict[str, Any]) -> int:
    title = str(event.get("title") or "").lower()
    score = 0
    for keyword in DEEP_WORK_KEYWORDS:
        if keyword in title:
            score += 1
    return score


def _select_google_event(
    db: Session,
    user_id: str,
    target_date: date,
    *,
    explicit_event_id: str | None = None,
    target_task_id: int | None = None,
) -> tuple[dict[str, Any] | None, GoogleEventMapping | None]:
    events = fetch_google_events(db, user_id, target_date)
    if not events:
        return None, None

    if explicit_event_id:
        matched = next((ev for ev in events if str(ev.get("id")) == explicit_event_id), None)
        if matched is not None:
            mapping = _find_mapping_by_event_id(db, user_id, explicit_event_id)
            return matched, mapping

    mapping = _find_latest_mapping_by_task(db, user_id, target_task_id)
    if mapping is not None:
        matched = next((ev for ev in events if str(ev.get("id")) == mapping.google_event_id), None)
        if matched is not None:
            return matched, mapping

    now_utc = datetime.now(timezone.utc)
    deep_candidates = [ev for ev in events if _deep_work_score(ev) > 0]
    if deep_candidates:
        deep_candidates.sort(
            key=lambda ev: (
                -_deep_work_score(ev),
                abs(((_parse_event_datetime(ev.get("start")) or now_utc) - now_utc).total_seconds()),
            )
        )
        chosen = deep_candidates[0]
        return chosen, _find_mapping_by_event_id(db, user_id, str(chosen.get("id")))

    events.sort(
        key=lambda ev: abs(((_parse_event_datetime(ev.get("start")) or now_utc) - now_utc).total_seconds())
    )
    chosen = events[0]
    return chosen, _find_mapping_by_event_id(db, user_id, str(chosen.get("id")))


def _safe_summary_for_privacy(normal_text: str, mapping: GoogleEventMapping | None) -> str:
    privacy_mode = str(getattr(mapping, "privacy_mode", "NORMAL") or "NORMAL").upper()
    if privacy_mode == "MASKED":
        return "[MASKED] Private schedule"
    return normal_text


def _apply_buffer_block(
    plan: DayPlan,
    items: list[dict[str, Any]],
    tasks: dict[int, Task],
) -> tuple[bool, str, int | None]:
    cfg = _patch_cfg()
    buffer_cfg = cfg.get("buffer") or {}
    before_minutes = int(buffer_cfg.get("before_minutes", 10))
    after_minutes = int(buffer_cfg.get("after_minutes", 15))

    if not items:
        return False, "?嶺????嶺?????嶺뚯쉸裕뉓굜???뜯뫀?ｈ굜???嶺??욘?嶺?瑗룟퐲?", None

    target = None
    for it in items:
        task = tasks.get(it.get("task_id")) if isinstance(it.get("task_id"), int) else None
        if _is_important(it, task):
            target = it
            break
    if target is None:
        target = items[0]

    target["buffer_before_minutes"] = before_minutes
    target["buffer_after_minutes"] = after_minutes
    target["patch_tag"] = "BUFFER_BLOCK"
    plan.items = items
    plan.protected_block_minutes = max(int(plan.protected_block_minutes or 0), after_minutes)
    task_id = target.get("task_id") if isinstance(target.get("task_id"), int) else None
    return True, f"嶺??욕퐲?????뜯뫀?ｈ굜??嶺?瑗룟퐲???嶺??욘?彛?嶺?瑗룡↔낀??瑜곸톭({before_minutes}/{after_minutes}嶺?瑗룡????嶺????嶺??욘?嶺?瑗룟퐲?", task_id


def _apply_split_deep_work(plan: DayPlan, items: list[dict[str, Any]]) -> tuple[bool, str, int | None]:
    cfg = _patch_cfg()
    split_cfg = cfg.get("split_deep_work") or {}
    split_min = int(split_cfg.get("min_block_minutes", 90))
    seg = list(split_cfg.get("segments") or [45, 15, 45])
    if len(seg) != 3:
        seg = [45, 15, 45]
    a, r, b = int(seg[0]), int(seg[1]), int(seg[2])

    for idx, it in enumerate(items):
        block = int(it.get("planned_block_minutes") or 0)
        if block < split_min:
            continue
        first = {**it, "planned_block_minutes": a, "patch_tag": "SPLIT_DEEP_WORK_A"}
        recovery = {
            "item_id": uuid4().hex,
            "task_id": None,
            "title": f"?댁떇 {r}遺??뚮났 釉붾줉",
            "planned_block_minutes": r,
            "micro_steps": ["媛踰쇱슫 ?명씉怨??뺣━濡?由ъ뀑?⑸땲??"],
            "patch_tag": "SPLIT_DEEP_WORK_RECOVERY",
        }
        second = {**it, "item_id": uuid4().hex, "planned_block_minutes": b, "patch_tag": "SPLIT_DEEP_WORK_B"}
        items[idx : idx + 1] = [first, recovery, second]
        plan.items = items
        task_id = it.get("task_id") if isinstance(it.get("task_id"), int) else None
        return True, f"Split deep-work task into {a}+{r}+{b} minutes for total {split_min} minutes.", task_id
        return False, f"Deep-work split requires at least {split_min} minutes to apply.", None


def _apply_decision_delay(
    plan: DayPlan,
    items: list[dict[str, Any]],
    tasks: dict[int, Task],
    target_date: date,
) -> tuple[bool, str, int | None, int]:
    for idx, it in enumerate(items):
        task = tasks.get(it.get("task_id")) if isinstance(it.get("task_id"), int) else None
        if not _is_decision_item(it, task):
            continue
        removed = items.pop(idx)
        plan.items = items
        delay_to = (target_date + timedelta(days=1)).isoformat()
        task_id = removed.get("task_id") if isinstance(removed.get("task_id"), int) else None
        planned_minutes = int(removed.get("planned_block_minutes") or 30)
        return True, f"?嶺????됥럷??猷됬춯?뚯굣????嶺??{delay_to} ?嶺뚯쉸?앲굜??뜯뫀?ｈ굜醫묒???勇싲８?녻굜??嶺?嶺??욘?嶺?瑗룟퐲?", task_id, max(15, planned_minutes)
    return False, "?勇싲８?녻굜???嶺????됥럷??猷됬춯?뚯굣?????뜯뫀?ｈ굜???嶺??욘?嶺?瑗룟퐲?", None, 30


def _apply_google_buffer(
    db: Session,
    user_id: str,
    target_date: date,
    *,
    target_task_id: int | None,
    event_id: str | None,
) -> str:
    cfg = _patch_cfg()
    buffer_cfg = cfg.get("buffer") or {}
    before_minutes = int(buffer_cfg.get("before_minutes", 10))
    after_minutes = int(buffer_cfg.get("after_minutes", 15))

    selected, mapping = _select_google_event(
        db,
        user_id,
        target_date,
        explicit_event_id=event_id,
        target_task_id=target_task_id,
    )
    if selected is None:
        return "嶺??욘≪눦??瑜?嶺??嶺?瑗??뚣뀋??곗댅嶺??????勇싲８?녻굜醫묒??源????嶺? DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"

    start_at = _parse_event_datetime(selected.get("start"))
    end_at = _parse_event_datetime(selected.get("end"))
    if start_at is None or end_at is None:
        return "嶺??욘≪눦??瑜?嶺???勇싲８?녻굜醫묒??源????嶺??????嶺?????嶺뚯쉸?앲굜?彛? DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"

    before_start = start_at - timedelta(minutes=before_minutes)
    before_summary = _safe_summary_for_privacy("Buffer before important event", mapping)
    after_summary = _safe_summary_for_privacy("Buffer after important event", mapping)

    create_google_event(
        db=db,
        user_id=user_id,
        start=before_start,
        duration_minutes=before_minutes,
        summary=before_summary,
        calendar_id=(mapping.calendar_id if mapping else "primary"),
    )
    create_google_event(
        db=db,
        user_id=user_id,
        start=end_at,
        duration_minutes=after_minutes,
        summary=after_summary,
        calendar_id=(mapping.calendar_id if mapping else "primary"),
    )
    return "Google Calendar???嶺??욘?彛??勇싲８?녻굜醫묒??源???2嶺?????춯? 嶺??욘????嶺??욘?嶺?瑗룟퐲?"


def _apply_google_split(
    db: Session,
    user_id: str,
    target_date: date,
    *,
    target_task_id: int | None,
    event_id: str | None,
) -> str:
    cfg = _patch_cfg()
    seg = list((cfg.get("split_deep_work") or {}).get("segments") or [45, 15, 45])
    if len(seg) != 3:
        seg = [45, 15, 45]
    a, r, b = int(seg[0]), int(seg[1]), int(seg[2])

    selected, mapping = _select_google_event(
        db,
        user_id,
        target_date,
        explicit_event_id=event_id,
        target_task_id=target_task_id,
    )
    if selected is None:
        return "嶺??욘≪눦??瑜?嶺??嶺?瑗??뚣뀋??곗댅嶺??????勇싲８?녻굜醫묒??源????嶺? DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"

    event_start = _parse_event_datetime(selected.get("start"))
    if event_start is None:
        return "嶺??욘≪눦??瑜?嶺???勇싲８?녻굜醫묒??源????嶺??????嶺?????嶺뚯쉸?앲굜?彛? DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"

    selected_event_id = str(selected.get("id") or "")
    if not selected_event_id:
        return "嶺??욘≪눦??瑜?嶺???勇싲８?녻굜醫묒??源???ID嶺?瑗룟퐲?嶺???琉룔렎???? 嶺?瑗?節끹뀋?諭?ч툣?DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"

    calendar_id = mapping.calendar_id if mapping else "primary"
    split_a_end = event_start + timedelta(minutes=a)
    recovery_start = split_a_end
    recovery_end = recovery_start + timedelta(minutes=r)
    split_b_start = recovery_end

    update_google_event(
        db=db,
        user_id=user_id,
        event_id=selected_event_id,
        start=event_start,
        end=split_a_end,
        summary=None,
        calendar_id=calendar_id,
    )
    create_google_event(
        db=db,
        user_id=user_id,
        start=recovery_start,
        duration_minutes=r,
        summary=_safe_summary_for_privacy("Recovery block", mapping),
        calendar_id=calendar_id,
    )
    create_google_event(
        db=db,
        user_id=user_id,
        start=split_b_start,
        duration_minutes=b,
        summary=_safe_summary_for_privacy("Deep work (part 2)", mapping),
        calendar_id=calendar_id,
    )
    return "Google Calendar ?勇싲８?녻굜醫묒??源??勇싲８??굜? 嶺?瑗룡???45+?嶺?瑗?勇?45) 嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"


def _apply_google_decision_delay(
    db: Session,
    user_id: str,
    target_date: date,
    *,
    target_task_id: int | None,
    event_id: str | None,
    planned_minutes: int,
) -> str:
    cfg = _patch_cfg()
    delay_cfg = cfg.get("decision_delay") or {}
    defer_hour = int(delay_cfg.get("defer_hour_utc", 9))
    defer_min = int(delay_cfg.get("defer_minute_utc", 30))

    chosen_event_id = event_id
    mapping = _find_mapping_by_event_id(db, user_id, event_id) if event_id else None
    if not chosen_event_id:
        mapping = _find_latest_mapping_by_task(db, user_id, target_task_id)
        if mapping is not None:
            chosen_event_id = mapping.google_event_id

    duration_minutes = planned_minutes
    if not chosen_event_id:
        selected, selected_mapping = _select_google_event(
            db,
            user_id,
            target_date,
            explicit_event_id=None,
            target_task_id=target_task_id,
        )
        if selected is None:
            return "嶺??욘≪눦??瑜?嶺??嶺?瑗??뚣뀋??곗댅嶺??????勇싲８?녻굜醫묒??源????嶺? DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"
        chosen_event_id = str(selected.get("id") or "")
        mapping = selected_mapping
        event_start = _parse_event_datetime(selected.get("start"))
        event_end = _parse_event_datetime(selected.get("end"))
        if event_start and event_end:
            duration_minutes = max(15, int((event_end - event_start).total_seconds() // 60))

    if not chosen_event_id:
        return "嶺??욘≪눦??瑜?嶺???勇싲８?녻굜醫묒??源???ID嶺?瑗룟퐲?嶺???琉룔렎???? 嶺?瑗?節끹뀋?諭?ч툣?DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"

    start_at = datetime.combine(target_date + timedelta(days=1), time(defer_hour, defer_min)).replace(
        tzinfo=timezone.utc
    )
    end_at = start_at + timedelta(minutes=max(15, duration_minutes))
    update_google_event(
        db=db,
        user_id=user_id,
        event_id=chosen_event_id,
        start=start_at,
        end=end_at,
        summary=None,
        calendar_id=(mapping.calendar_id if mapping else "primary"),
    )
    return "Google Calendar ?勇싲８?녻굜醫묒??源??勇싲８??굜? ?勇싲８?녻굜?쇈렎??嶺뚯쉸?앲굜??뜯뫀?ｈ굜醫묒???勇싲８?녻굜?嶺??욘?嶺?瑗룟퐲?"


def apply_plan_patch(
    db: Session,
    target_date: date,
    patch_type: PatchType,
    user_id: str | None = None,
    day_id: int | None = None,
    event_id: str | None = None,
) -> dict[str, Any]:
    plan = _find_day_plan(db, target_date, user_id, day_id)
    if plan is None:
        return {
            "applied": False,
            "patch_type": patch_type,
            "message": "?勇싲８?녻굜議얇뀋??嶺??욕퐲?DayPlan??嶺???琉룔렎???? 嶺?瑗?節끹뀋?諭??勇싲８留⑵굜??",
            "blocked_reason": None,
            "updated_plan": None,
            "calendar_synced": False,
            "calendar_message": None,
        }

    cfg = _patch_cfg()
    gate_cfg = cfg.get("quality_gate") or {}
    blocked_confidence = str(gate_cfg.get("disallow_move_or_cancel_when_confidence", "low"))
    summary = _load_summary(db, target_date, user_id)
    confidence = summary.confidence if summary and summary.confidence else "low"

    if patch_type == "DECISION_DELAY" and confidence == blocked_confidence:
        return {
            "applied": False,
            "patch_type": patch_type,
            "message": "?嶺??욕퐲?嶺???猷됬춯??욘?勇싲８??굜醫묒???嶺????嶺? ?嶺?勇싲８留⑵굜??",
            "blocked_reason": "confidence=low?嶺???勇싲８?녻굜?嶺??욘?彛???嶺???嶺??욘?嶺??욕퐲醫묒?筌뤾쑴??툣猷몃뾼?꾩쥜彛?嶺????嶺??嶺뚯쉧?됭굜??",
            "updated_plan": None,
            "calendar_synced": False,
            "calendar_message": None,
        }

    items = list(plan.items or [])
    tasks = _load_task_map(db, items)
    applied = False
    message = "?嶺?????嶺?瑗?嶺???猷됧넼?ㅼ뵰?꾟뼹???嶺??욘?嶺?瑗룟퐲?"
    target_task_id: int | None = None
    planned_minutes = 30

    if patch_type == "BUFFER_BLOCK":
        applied, message, target_task_id = _apply_buffer_block(plan, items, tasks)
    elif patch_type == "SPLIT_DEEP_WORK":
        applied, message, target_task_id = _apply_split_deep_work(plan, items)
    elif patch_type == "DECISION_DELAY":
        applied, message, target_task_id, planned_minutes = _apply_decision_delay(plan, items, tasks, target_date)

    updated_plan = None
    if applied:
        db.commit()
        db.refresh(plan)
        updated_plan = {
            "day_id": plan.day_id,
            "date": plan.date.isoformat(),
            "mode": plan.mode,
            "items": plan.items or [],
            "protected_block_minutes": plan.protected_block_minutes,
        }

    calendar_synced = False
    calendar_message: str | None = None
    if applied:
        if not user_id:
            calendar_message = "嶺??욘≪눦??瑜?嶺??嶺?瑗??뚣뀋??곗댅嶺?? DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"
        else:
            try:
                if patch_type == "BUFFER_BLOCK":
                    calendar_message = _apply_google_buffer(
                        db,
                        user_id,
                        target_date,
                        target_task_id=target_task_id,
                        event_id=event_id,
                    )
                elif patch_type == "SPLIT_DEEP_WORK":
                    calendar_message = _apply_google_split(
                        db,
                        user_id,
                        target_date,
                        target_task_id=target_task_id,
                        event_id=event_id,
                    )
                elif patch_type == "DECISION_DELAY":
                    calendar_message = _apply_google_decision_delay(
                        db,
                        user_id,
                        target_date,
                        target_task_id=target_task_id,
                        event_id=event_id,
                        planned_minutes=planned_minutes,
                    )
                calendar_synced = bool(calendar_message and "DayPlan" not in calendar_message)
            except Exception as exc:
                calendar_synced = False
                calendar_message = f"嶺??욘≪눦??瑜?嶺???嶺?????嶺뚯쉸?앲굜?彛?{exc}): DayPlan嶺?瑗룟퐲?嶺?瑗?瑜끹럷?嶺??욘?嶺?瑗룟퐲?"

    full_message = message
    if calendar_message:
        full_message = f"{message} {calendar_message}"

    return {
        "applied": applied,
        "patch_type": patch_type,
        "message": full_message,
        "blocked_reason": None,
        "updated_plan": updated_plan,
        "calendar_synced": calendar_synced,
        "calendar_message": calendar_message,
    }







