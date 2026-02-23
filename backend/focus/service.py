from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session as DBSession

from backend.focus.event_schemas import parse_event_ts_ms, validate_event_envelope
from backend.focus.fusion_engine import FusionParams, compute_exit_score
from backend.focus.models import Device, Event, Interruption, Session, SessionState, StuckCase, UserSetting
from backend.focus.schemas import EventEnvelopeIn, SessionCreateIn, SessionPatchIn, SettingsPatchIn, StuckIn
from backend.focus.stuck_catalog import STUCK_CATEGORIES, choose_category


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_dict_bool(payload: Optional[dict[str, Any]]) -> dict[str, bool]:
    result: dict[str, bool] = {}
    for key, value in (payload or {}).items():
        result[str(key)] = bool(value)
    return result


def _safe_prompt_format(template: str, values: dict[str, Any]) -> str:
    class _SafeDict(dict):
        def __missing__(self, key: str) -> str:
            return f"{{{key}}}"

    return template.format_map(_SafeDict(values))


def _get_or_create_device(db: DBSession, device_id: str, user_id: str, device_type: str) -> Device:
    row = db.query(Device).filter(Device.id == device_id).first()
    if row:
        row.last_seen_at = _utc_now()
        if row.user_id != user_id:
            row.user_id = user_id
        db.add(row)
        return row
    row = Device(id=device_id, user_id=user_id, type=device_type, last_seen_at=_utc_now())
    db.add(row)
    return row


def get_or_create_user_settings(db: DBSession, user_id: str) -> UserSetting:
    row = db.query(UserSetting).filter(UserSetting.user_id == user_id).first()
    if row:
        return row
    row = UserSetting(
        user_id=user_id,
        idle_threshold_seconds=180,
        camera_enabled=False,
        camera_weight=3.0,
        window_size_seconds=600,
        notification_prefs={"cooldown_seconds": 180},
        data_retention_days=60,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def create_session(db: DBSession, body: SessionCreateIn) -> Session:
    session_id = uuid4().hex
    if body.device_id:
        _get_or_create_device(
            db,
            device_id=body.device_id,
            user_id=body.user_id,
            device_type=body.device_type or "web",
        )
    row = Session(
        id=session_id,
        user_id=body.user_id,
        task_title=body.task_title,
        goal=body.goal,
        timer_mode=body.timer_mode,
        duration=body.duration,
        status="working",
        next_step=body.next_step,
        sensors_enabled=_to_dict_bool(body.sensors_enabled),
        planned_break=body.planned_break,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    get_or_create_user_settings(db, body.user_id)
    return row


def patch_session(db: DBSession, session_id: str, body: SessionPatchIn) -> Session:
    row = db.query(Session).filter(Session.id == session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="session not found")
    if body.status is not None:
        row.status = body.status
        if body.status in {"paused", "completed", "ended"}:
            row.ended_at = _utc_now()
    if body.next_step is not None:
        row.next_step = body.next_step
    if body.planned_break is not None:
        row.planned_break = body.planned_break
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _build_signal_snapshot(events: list[Event]) -> dict[str, Any]:
    latest_by_type: dict[str, Event] = {}
    for event in events:
        prev = latest_by_type.get(event.type)
        if prev is None or event.ts > prev.ts:
            latest_by_type[event.type] = event

    snapshot: dict[str, Any] = {}
    if "activity" in latest_by_type:
        payload = dict(latest_by_type["activity"].payload or {})
        if "tab_hidden_seconds" not in payload and isinstance(payload.get("tab_visible"), bool):
            payload["tab_hidden_seconds"] = 0 if payload.get("tab_visible") else int(payload.get("idle_seconds") or 0)
        if "window_blur_seconds" not in payload and isinstance(payload.get("window_focused"), bool):
            payload["window_blur_seconds"] = 0 if payload.get("window_focused") else int(payload.get("idle_seconds") or 0)
        snapshot["activity"] = payload

    if "camera_presence" in latest_by_type:
        payload = dict(latest_by_type["camera_presence"].payload or {})
        if "absent_seconds" not in payload:
            payload["absent_seconds"] = 0 if payload.get("present") else 31
        snapshot["camera_presence"] = payload

    for key in ("calendar", "geofence", "ble"):
        if key in latest_by_type:
            snapshot[key] = dict(latest_by_type[key].payload or {})

    return snapshot


def _save_state(
    db: DBSession,
    session_id: str,
    state: str,
    exit_score: float,
    evidence: dict[str, Any],
) -> SessionState:
    row = SessionState(
        session_id=session_id,
        state=state,
        exit_score=exit_score,
        evidence=evidence,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _maybe_emit_reentry(
    db: DBSession,
    *,
    session_row: Session,
    previous_state: Optional[str],
    next_state: str,
    snapshot: dict[str, Any],
) -> None:
    if previous_state not in {"micro_drift", "physical_exit", "paused", "context_switch"}:
        return
    if next_state != "working":
        return

    signals: list[str] = []
    activity = snapshot.get("activity") or {}
    camera = snapshot.get("camera_presence") or {}
    if activity.get("window_focused") is True:
        signals.append("window_focus")
    if activity.get("idle_seconds", 99999) < 30:
        signals.append("activity_resume")
    if camera.get("present") is True:
        signals.append("camera_present")
    if not signals:
        signals.append("activity_resume")

    event = Event(
        id=uuid4().hex,
        session_id=session_row.id,
        user_id=session_row.user_id,
        device_id=None,
        ts=_utc_now(),
        source="web",
        type="reentry",
        payload={"detected_by": signals, "latency_seconds": 0},
    )
    db.add(event)
    db.commit()


def recompute_and_persist_state(db: DBSession, session_id: str) -> tuple[str, float, dict[str, Any]]:
    session_row = db.query(Session).filter(Session.id == session_id).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="session not found")

    settings = get_or_create_user_settings(db, session_row.user_id or "anonymous")
    now = _utc_now()
    window_start = now - timedelta(seconds=max(120, settings.window_size_seconds))

    recent_events = (
        db.query(Event)
        .filter(Event.session_id == session_id, Event.ts >= window_start)
        .order_by(Event.ts.desc())
        .all()
    )
    snapshot = _build_signal_snapshot(recent_events)
    params = FusionParams(
        idle_threshold_seconds=settings.idle_threshold_seconds,
        camera_weight=settings.camera_weight if settings.camera_enabled else 0.0,
        window_size_seconds=settings.window_size_seconds,
    )
    score, state, evidence = compute_exit_score(snapshot, planned_break=session_row.planned_break, params=params)
    evidence["window_size_seconds"] = settings.window_size_seconds

    previous = (
        db.query(SessionState)
        .filter(SessionState.session_id == session_id)
        .order_by(SessionState.ts.desc(), SessionState.id.desc())
        .first()
    )
    previous_state = previous.state if previous else None
    session_row.status = state
    db.add(session_row)
    db.commit()
    _save_state(db, session_id=session_id, state=state, exit_score=score, evidence=evidence)
    _maybe_emit_reentry(db, session_row=session_row, previous_state=previous_state, next_state=state, snapshot=snapshot)
    return state, score, evidence


def ingest_events_batch(db: DBSession, events: list[EventEnvelopeIn]) -> dict[str, Any]:
    if len(events) > 500:
        raise HTTPException(status_code=429, detail="too many events in batch; max=500")

    touched_sessions: set[str] = set()
    inserted = 0
    duplicates = 0
    for event in events:
        payload = event.model_dump()
        validate_event_envelope(payload)

        exists = db.query(Event.id).filter(Event.id == event.event_id).first()
        if exists:
            duplicates += 1
            continue

        _get_or_create_device(
            db,
            device_id=event.device_id,
            user_id=event.user_id,
            device_type=event.source,
        )

        row = Event(
            id=event.event_id,
            session_id=event.session_id,
            user_id=event.user_id,
            device_id=event.device_id,
            ts=parse_event_ts_ms(event.ts),
            source=event.source,
            type=event.type,
            payload=event.payload,
        )
        db.add(row)
        inserted += 1
        touched_sessions.add(event.session_id)

    db.commit()

    latest_states: dict[str, Any] = {}
    for session_id in touched_sessions:
        state, score, evidence = recompute_and_persist_state(db, session_id)
        latest_states[session_id] = {"state": state, "exit_score": score, "evidence": evidence}

    return {"inserted": inserted, "duplicates": duplicates, "sessions_updated": len(touched_sessions), "states": latest_states}


def get_state(db: DBSession, session_id: str) -> dict[str, Any]:
    row = db.query(Session).filter(Session.id == session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="session not found")
    state, score, evidence = recompute_and_persist_state(db, session_id)
    return {
        "state": state,
        "exit_score": score,
        "last_evidence": evidence,
        "last_next_step": row.next_step,
    }


def get_reentry_card(db: DBSession, session_id: str) -> dict[str, Any]:
    row = db.query(Session).filter(Session.id == session_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="session not found")

    interruption = (
        db.query(Interruption)
        .filter(Interruption.session_id == session_id)
        .order_by(Interruption.ts_start.desc(), Interruption.id.desc())
        .first()
    )
    summary = "Current context summary is not available."
    if interruption:
        summary = f"Interruption: {interruption.interruption_type}"
        if interruption.notes:
            summary = f"{summary} - {interruption.notes[:80]}"

    suggested_sprint = 5 if (row.status in {"micro_drift", "paused", "context_switch"}) else 10
    return {
        "last_context_summary": summary,
        "next_step": row.next_step,
        "suggested_sprint": suggested_sprint,
        "stuck_cta": "Tell me where you're stuck.",
    }


def label_interruption(
    db: DBSession,
    session_id: str,
    interruption_type: str,
    user_initiated: bool,
    notes: Optional[str],
) -> Interruption:
    session_row = db.query(Session).filter(Session.id == session_id).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="session not found")

    now = _utc_now()
    row = Interruption(
        session_id=session_id,
        ts_start=now,
        ts_end=None,
        interruption_type=interruption_type,
        detected=not user_initiated,
        user_labeled=user_initiated,
        notes=notes,
    )
    session_row.status = "paused" if interruption_type in {"break", "meeting"} else "micro_drift"
    db.add(row)
    db.add(session_row)
    db.commit()
    db.refresh(row)
    return row


def get_settings(db: DBSession, user_id: str) -> UserSetting:
    return get_or_create_user_settings(db, user_id)


def patch_settings(db: DBSession, user_id: str, body: SettingsPatchIn) -> UserSetting:
    row = get_or_create_user_settings(db, user_id)
    patch = body.model_dump(exclude_none=True)
    for key, value in patch.items():
        setattr(row, key, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _required_questions_for_case(category: dict[str, Any], answers: dict[str, str]) -> list[str]:
    missing: list[str] = []
    for question in category["required_questions"]:
        if not answers.get(question):
            missing.append(question)
    return missing


def _route_model(category: dict[str, Any], desired_output: str, stuck_text: str) -> list[str]:
    profiles = [category["model_profile_primary"], *category["model_profile_alternatives"]]
    haystack = f"{desired_output}\n{stuck_text}".lower()
    latest_keywords = ["latest", "news", "recent", "current", "update", "latest news"]
    if any(keyword in haystack for keyword in latest_keywords):
        profiles = ["WEB_RESEARCH", *[x for x in profiles if x != "WEB_RESEARCH"]]
    return profiles[:3]


def _build_ui_spec(category: dict[str, Any], next_actions: list[dict[str, Any]]) -> dict[str, Any]:
    output_type = category.get("output_format_spec", {}).get("type", "checklist")
    options = []
    if output_type in {"options", "drafts"}:
        options = [
            {
                "id": "A",
                "title": "Option A",
                "summary": "Pick one path and execute it for 5 minutes.",
            },
            {
                "id": "B",
                "title": "Option B",
                "summary": "Try a different framing with less detail for speed.",
            },
            {
                "id": "C",
                "title": "Option C",
                "summary": "Keep current approach and add one concrete next step.",
            },
        ]
    return {
        "type": output_type,
        "options": options,
        "checklist": next_actions,
        "cta_buttons": ["Start 5-minute sprint", "Execute this prompt", "Try fallback model"],
    }


def _next_actions_from_rules(rules: list[str]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    five_min_idx = 0
    for idx, text in enumerate(rules[:3], start=1):
        required = "5 minute" in text.lower()
        if required:
            five_min_idx = idx
        actions.append(
            {
                "id": f"step_{idx}",
                "text": text,
                "eta_minutes": 5 if required else 10,
                "required": required,
            }
        )
    if not any(x["required"] for x in actions):
        if actions:
            actions[-1]["required"] = True
            actions[-1]["eta_minutes"] = 5
        else:
            actions.append(
            {
                "id": "step_1",
                "text": "Fallback action: complete one 5-minute task now.",
                "eta_minutes": 5,
                "required": True,
            }
        )
    return actions


def _tone_rewrite(prompt_text: str, tone_toggle: Optional[str]) -> str:
    if tone_toggle == "shorter":
        return f"{prompt_text}\nRewrite in a shorter, more concise form."
    if tone_toggle == "more_logical":
        return f"{prompt_text}\nRewrite with a more logical and structured tone."
    if tone_toggle == "more_creative":
        return f"{prompt_text}\nRewrite with more creative phrasing and examples."
    return prompt_text


def handle_stuck(db: DBSession, session_id: str, body: StuckIn) -> dict[str, Any]:
    session_row = db.query(Session).filter(Session.id == session_id).first()
    if not session_row:
        raise HTTPException(status_code=404, detail="session not found")

    category = choose_category(body.stuck_text, body.desired_output)
    answers = dict(body.answers or {})
    missing_questions = _required_questions_for_case(category, answers)

    default_values = {
        "goal": session_row.goal,
        "audience": answers.get("audience", "general audience"),
        "core_message": answers.get("core_message", body.desired_output),
        "evidence": answers.get("evidence", "Use available evidence and reasoning."),
        "stuck_text": body.stuck_text,
        "desired_output": body.desired_output,
        "constraints": body.constraints or "",
        "features": body.constraints or "Key requirements and constraints to satisfy.",
        "team": answers.get("team", "collaboration team"),
    }
    prompt_text = _safe_prompt_format(category["prompt_template"], default_values)
    prompt_text = _tone_rewrite(prompt_text, body.tone_toggle)
    recommended_profiles = _route_model(category, body.desired_output, body.stuck_text)
    next_actions = _next_actions_from_rules(category["next_action_rules"])
    ui_output_spec = _build_ui_spec(category, next_actions)

    # Save immediately as retrievable prescription history.
    row = StuckCase(
        session_id=session_id,
        stuck_text=body.stuck_text,
        desired_output=body.desired_output,
        constraints=body.constraints,
        detected_category=category["id"],
        model_profile=recommended_profiles[0],
        prompt_text=prompt_text,
        ai_result={"category_name": category["name"], "tone_toggle": body.tone_toggle},
        next_actions=next_actions,
    )
    db.add(row)

    # Mandatory: convert output into next step.
    required_action = next((x for x in next_actions if x["required"]), next_actions[0] if next_actions else None)
    if required_action:
        session_row.next_step = required_action["text"]
        session_row.status = "working"
        db.add(session_row)

    db.commit()

    return {
        "detected_category": category["id"],
        "confidence": 0.82 if not missing_questions else 0.64,
        "required_questions": missing_questions,
        "recommended_profiles": recommended_profiles,
        "prompt_text": prompt_text,
        "ui_output_spec": ui_output_spec,
        "next_actions": next_actions,
    }


def list_catalog() -> list[dict[str, Any]]:
    return STUCK_CATEGORIES


