from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class FusionParams:
    idle_threshold_seconds: int = 180
    camera_weight: float = 3.0
    window_size_seconds: int = 600


def compute_exit_score(
    snapshot: dict[str, Any],
    *,
    planned_break: bool,
    params: FusionParams,
) -> tuple[float, str, dict[str, Any]]:
    score = 0.0
    evidence: dict[str, Any] = {}

    activity = snapshot.get("activity") or {}
    camera = snapshot.get("camera_presence") or {}
    geofence = snapshot.get("geofence") or {}
    ble = snapshot.get("ble") or {}
    calendar = snapshot.get("calendar") or {}

    idle_seconds = int(activity.get("idle_seconds") or 0)
    tab_hidden_seconds = int(activity.get("tab_hidden_seconds") or 0)
    window_blur_seconds = int(activity.get("window_blur_seconds") or 0)

    if idle_seconds > params.idle_threshold_seconds:
        score += 1
        evidence["idle_over_threshold"] = idle_seconds
    if tab_hidden_seconds > 60:
        score += 1
        evidence["tab_hidden_seconds"] = tab_hidden_seconds
    if window_blur_seconds > 60:
        score += 1
        evidence["window_blur_seconds"] = window_blur_seconds

    camera_present = camera.get("present")
    camera_absent_seconds = int(camera.get("absent_seconds") or 0)
    if camera_present is False and camera_absent_seconds > 30:
        score += params.camera_weight
        evidence["camera_absent_seconds"] = camera_absent_seconds

    if geofence.get("action") == "exit":
        score += 4
        evidence["geofence_exit"] = True
    if ble.get("action") == "lost":
        score += 3
        evidence["ble_lost"] = True

    # Override rule: active meeting is considered context switch.
    if calendar.get("meeting_started") is True:
        evidence["override"] = "calendar_meeting_started"
        return score, "context_switch", evidence

    if score <= 2:
        state = "working"
    elif score <= 5:
        state = "micro_drift"
    elif score <= 8:
        state = "physical_exit"
    else:
        state = "physical_exit"
        evidence["physical_exit_confidence"] = "high"

    if planned_break and state == "physical_exit":
        evidence["planned_break_softened"] = True
        state = "paused"

    return score, state, evidence

