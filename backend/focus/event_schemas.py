from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

EVENT_TYPES = {
    "activity",
    "camera_presence",
    "geofence",
    "wifi",
    "ble",
    "calendar",
    "timer",
    "interruption_label",
    "reentry",
}

EVENT_ENVELOPE_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["event_id", "ts", "user_id", "device_id", "session_id", "source", "type", "payload"],
    "additionalProperties": False,
    "properties": {
        "event_id": {"type": "string", "minLength": 8, "maxLength": 64},
        "ts": {"type": "integer", "minimum": 0},
        "user_id": {"type": "string", "minLength": 1, "maxLength": 64},
        "device_id": {"type": "string", "minLength": 1, "maxLength": 64},
        "session_id": {"type": "string", "minLength": 1, "maxLength": 64},
        "source": {"type": "string", "enum": ["web", "extension", "mobile", "watch"]},
        "type": {"type": "string", "enum": sorted(EVENT_TYPES)},
        "payload": {"type": "object"},
    },
}

EVENT_PAYLOAD_SCHEMAS: dict[str, dict[str, Any]] = {
    "activity": {
        "type": "object",
        "required": ["idle_seconds", "tab_visible", "window_focused"],
        "additionalProperties": True,
        "properties": {
            "idle_seconds": {"type": "integer", "minimum": 0},
            "key_rate": {"type": "number", "minimum": 0},
            "mouse_rate": {"type": "number", "minimum": 0},
            "scroll_rate": {"type": "number", "minimum": 0},
            "tab_visible": {"type": "boolean"},
            "window_focused": {"type": "boolean"},
        },
    },
    "camera_presence": {
        "type": "object",
        "required": ["present", "confidence", "face_count"],
        "additionalProperties": True,
        "properties": {
            "present": {"type": "boolean"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "face_count": {"type": "integer", "minimum": 0},
        },
    },
    "timer": {
        "type": "object",
        "required": ["mode", "status", "remaining_seconds"],
        "additionalProperties": True,
        "properties": {
            "mode": {"type": "string", "enum": ["pomodoro", "free"]},
            "status": {"type": "string", "enum": ["running", "paused", "stopped"]},
            "remaining_seconds": {"type": "integer", "minimum": 0},
        },
    },
    "interruption_label": {
        "type": "object",
        "required": ["interruption_type", "user_initiated"],
        "additionalProperties": True,
        "properties": {
            "interruption_type": {"type": "string", "enum": ["break", "meeting", "stuck"]},
            "user_initiated": {"type": "boolean"},
        },
    },
    "reentry": {
        "type": "object",
        "required": ["detected_by", "latency_seconds"],
        "additionalProperties": True,
        "properties": {
            "detected_by": {"type": "array", "items": {"type": "string"}, "minItems": 1},
            "latency_seconds": {"type": "integer", "minimum": 0},
        },
    },
    "geofence": {
        "type": "object",
        "required": ["location_id", "action"],
        "additionalProperties": True,
        "properties": {
            "location_id": {"type": "string", "minLength": 1},
            "action": {"type": "string", "enum": ["enter", "exit"]},
        },
    },
    "wifi": {
        "type": "object",
        "required": ["label", "action"],
        "additionalProperties": True,
        "properties": {
            "label": {"type": "string", "minLength": 1},
            "action": {"type": "string", "enum": ["seen", "lost"]},
        },
    },
    "ble": {
        "type": "object",
        "required": ["label", "action"],
        "additionalProperties": True,
        "properties": {
            "label": {"type": "string", "minLength": 1},
            "action": {"type": "string", "enum": ["seen", "lost"]},
        },
    },
    "calendar": {
        "type": "object",
        "required": ["meeting_started"],
        "additionalProperties": True,
        "properties": {
            "meeting_started": {"type": "boolean"},
            "event_title": {"type": "string"},
        },
    },
}


def _validate_required_fields(data: dict[str, Any], required: list[str]) -> None:
    missing = [key for key in required if key not in data]
    if missing:
        raise ValueError(f"missing required fields: {', '.join(missing)}")


def _validate_payload_by_type(event_type: str, payload: dict[str, Any]) -> None:
    if event_type == "activity":
        if not isinstance(payload.get("idle_seconds"), int) or payload["idle_seconds"] < 0:
            raise ValueError("activity.idle_seconds must be >= 0 integer")
        if not isinstance(payload.get("tab_visible"), bool):
            raise ValueError("activity.tab_visible must be boolean")
        if not isinstance(payload.get("window_focused"), bool):
            raise ValueError("activity.window_focused must be boolean")
        return

    if event_type == "camera_presence":
        confidence = payload.get("confidence")
        if not isinstance(payload.get("present"), bool):
            raise ValueError("camera_presence.present must be boolean")
        if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
            raise ValueError("camera_presence.confidence must be 0..1")
        if not isinstance(payload.get("face_count"), int) or payload["face_count"] < 0:
            raise ValueError("camera_presence.face_count must be >= 0 integer")
        return

    if event_type == "timer":
        if payload.get("mode") not in {"pomodoro", "free"}:
            raise ValueError("timer.mode must be pomodoro|free")
        if payload.get("status") not in {"running", "paused", "stopped"}:
            raise ValueError("timer.status must be running|paused|stopped")
        if not isinstance(payload.get("remaining_seconds"), int) or payload["remaining_seconds"] < 0:
            raise ValueError("timer.remaining_seconds must be >= 0 integer")
        return

    if event_type == "interruption_label":
        if payload.get("interruption_type") not in {"break", "meeting", "stuck"}:
            raise ValueError("interruption_label.interruption_type invalid")
        if not isinstance(payload.get("user_initiated"), bool):
            raise ValueError("interruption_label.user_initiated must be boolean")
        return

    if event_type == "reentry":
        detected_by = payload.get("detected_by")
        if not isinstance(detected_by, list) or not detected_by:
            raise ValueError("reentry.detected_by must be non-empty array")
        if not isinstance(payload.get("latency_seconds"), int) or payload["latency_seconds"] < 0:
            raise ValueError("reentry.latency_seconds must be >= 0 integer")
        return

    if event_type in {"wifi", "ble"}:
        if not payload.get("label"):
            raise ValueError(f"{event_type}.label required")
        if payload.get("action") not in {"seen", "lost"}:
            raise ValueError(f"{event_type}.action must be seen|lost")
        return

    if event_type == "geofence":
        if not payload.get("location_id"):
            raise ValueError("geofence.location_id required")
        if payload.get("action") not in {"enter", "exit"}:
            raise ValueError("geofence.action must be enter|exit")
        return

    if event_type == "calendar":
        if not isinstance(payload.get("meeting_started"), bool):
            raise ValueError("calendar.meeting_started must be boolean")
        return


def validate_event_envelope(event: dict[str, Any]) -> None:
    _validate_required_fields(
        event,
        ["event_id", "ts", "user_id", "device_id", "session_id", "source", "type", "payload"],
    )
    if event["type"] not in EVENT_TYPES:
        raise ValueError(f"unsupported event type: {event['type']}")
    if event["source"] not in {"web", "extension", "mobile", "watch"}:
        raise ValueError("unsupported source")
    if not isinstance(event["ts"], int) or event["ts"] < 0:
        raise ValueError("ts must be unix ms integer")
    if not isinstance(event["payload"], dict):
        raise ValueError("payload must be object")

    # Optional strict validation when jsonschema is available.
    try:
        from jsonschema import validate as jsonschema_validate  # type: ignore

        jsonschema_validate(instance=event, schema=EVENT_ENVELOPE_SCHEMA)
        payload_schema = EVENT_PAYLOAD_SCHEMAS.get(event["type"])
        if payload_schema:
            jsonschema_validate(instance=event["payload"], schema=payload_schema)
    except Exception:
        # Fallback: keep strict minimum validation even without jsonschema package.
        _validate_payload_by_type(event["type"], event["payload"])


def parse_event_ts_ms(ts_ms: int) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)
