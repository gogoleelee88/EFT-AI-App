from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from scripts.har_core3.config import L0_LABELS, L1_LABELS


DEFAULT_L1_CONFIDENCE_THRESHOLD = 0.62
DEFAULT_L1_MARGIN_THRESHOLD = 0.12
DEFAULT_QUESTION_EXPIRES_MINUTES = 30

_L1_LABEL_SET = set(L1_LABELS)
_L0_LABEL_SET = set(L0_LABELS)


_BASE_PRIORS_BY_L0: dict[str, dict[str, float]] = {
    "walk": {
        "commute": 0.48,
        "workout": 0.25,
        "chores": 0.12,
        "social": 0.05,
        "relax": 0.05,
        "unknown_event": 0.05,
    },
    "upstairs": {
        "commute": 0.34,
        "workout": 0.40,
        "chores": 0.10,
        "social": 0.03,
        "unknown_event": 0.13,
    },
    "downstairs": {
        "commute": 0.39,
        "workout": 0.31,
        "chores": 0.12,
        "social": 0.03,
        "unknown_event": 0.15,
    },
    "sit": {
        "work_focus": 0.35,
        "meeting": 0.22,
        "meal": 0.13,
        "relax": 0.12,
        "social": 0.10,
        "sleep": 0.03,
        "unknown_event": 0.05,
    },
    "stand": {
        "work_focus": 0.25,
        "meeting": 0.20,
        "commute": 0.12,
        "chores": 0.18,
        "social": 0.12,
        "meal": 0.06,
        "unknown_event": 0.07,
    },
    "lay": {
        "sleep": 0.60,
        "relax": 0.28,
        "social": 0.03,
        "meal": 0.01,
        "unknown_event": 0.08,
    },
    "unknown": {
        "unknown_event": 0.65,
        "relax": 0.10,
        "social": 0.08,
        "work_focus": 0.06,
        "commute": 0.04,
        "sleep": 0.04,
        "chores": 0.03,
    },
}


_PAIR_QUESTION_TEXT: dict[tuple[str, str], str] = {
    ("meeting", "work_focus"): "지금 회의 중인가요, 집중 업무 중인가요?",
    ("commute", "workout"): "지금 이동 중인가요, 운동 중인가요?",
    ("meal", "social"): "지금 식사 중인가요, 사람과 교류 중인가요?",
    ("relax", "sleep"): "지금 휴식 중인가요, 잠들기/수면 상태인가요?",
    ("chores", "relax"): "지금 집안일 중인가요, 휴식 중인가요?",
}


def _clip01(value: Any, default: float = 0.0) -> float:
    try:
        v = float(value)
    except Exception:
        return default
    if v < 0.0:
        return 0.0
    if v > 1.0:
        return 1.0
    return v


def _safe_float(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except Exception:
        return default


def _safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        return int(value)
    except Exception:
        return default


def _safe_bool(value: Any, default: bool | None = None) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "y", "on"}:
            return True
        if lowered in {"0", "false", "no", "n", "off"}:
            return False
    return default


def _normalize_calendar_hint(value: Any) -> str | None:
    if value is None:
        return None
    txt = str(value).strip().lower()
    if not txt:
        return None
    if txt in {"focus", "work", "work_focus"}:
        return "work_focus"
    if txt in {"meeting", "mtg"}:
        return "meeting"
    if txt in {"commute", "travel", "transit"}:
        return "commute"
    if txt in {"workout", "exercise"}:
        return "workout"
    if txt in {"meal", "lunch", "dinner", "breakfast"}:
        return "meal"
    if txt in {"rest", "break", "relax"}:
        return "relax"
    if txt in {"sleep", "bedtime"}:
        return "sleep"
    if txt in {"social", "hangout"}:
        return "social"
    if txt in {"chores", "housework"}:
        return "chores"
    return None


def _normalize_location_hint(value: Any) -> str | None:
    if value is None:
        return None
    txt = str(value).strip().lower()
    if txt in {"home", "house"}:
        return "home"
    if txt in {"office", "workplace"}:
        return "office"
    if txt in {"transit", "bus", "subway", "train", "car"}:
        return "transit"
    if txt in {"gym", "fitness"}:
        return "gym"
    if txt in {"restaurant", "cafe"}:
        return "restaurant"
    if txt in {"store", "market"}:
        return "store"
    return None


def _context_hour(context: dict[str, Any]) -> int | None:
    hour = _safe_int(context.get("hour"), None)
    if hour is not None and 0 <= hour <= 23:
        return hour
    ts = context.get("timestamp")
    if isinstance(ts, str):
        try:
            parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return parsed.hour
        except Exception:
            return None
    return None


def _normalize_l0_probs(
    l0_probs: dict[str, Any] | None = None,
    l0_top1: str | None = None,
    l0_confidence: float | None = None,
) -> dict[str, float]:
    probs = {label: 0.0 for label in L0_LABELS}

    if isinstance(l0_probs, dict) and l0_probs:
        for key, val in l0_probs.items():
            label = str(key).strip().lower()
            if label in _L0_LABEL_SET:
                probs[label] = _clip01(val, 0.0)
        total = sum(probs.values())
        if total > 0.0:
            return {k: v / total for k, v in probs.items()}

    top1 = str(l0_top1 or "").strip().lower()
    conf = _clip01(l0_confidence, 0.55) if l0_confidence is not None else 0.55
    if top1 in _L0_LABEL_SET:
        probs[top1] = conf
        probs["unknown"] += 1.0 - conf
    else:
        probs["unknown"] = 1.0
    return probs


def _add_score(
    scores: dict[str, float],
    reasons: dict[str, list[str]],
    label: str,
    delta: float,
    reason: str,
) -> None:
    if label not in _L1_LABEL_SET:
        return
    if delta <= 0.0:
        return
    scores[label] += float(delta)
    reasons[label].append(reason)


def _apply_base_priors(
    l0_probs: dict[str, float],
    scores: dict[str, float],
    reasons: dict[str, list[str]],
) -> None:
    for l0, prob in l0_probs.items():
        mapping = _BASE_PRIORS_BY_L0.get(l0, {})
        for l1, weight in mapping.items():
            delta = prob * weight
            _add_score(scores, reasons, l1, delta, f"from_l0:{l0}")


def _apply_context_rules(
    l0_probs: dict[str, float],
    context: dict[str, Any],
    scores: dict[str, float],
    reasons: dict[str, list[str]],
) -> None:
    moving_prob = l0_probs["walk"] + l0_probs["upstairs"] + l0_probs["downstairs"]
    still_prob = l0_probs["sit"] + l0_probs["stand"]
    lay_prob = l0_probs["lay"]

    hour = _context_hour(context)
    day_of_week = _safe_int(context.get("day_of_week"), None)
    is_weekend = _safe_bool(context.get("is_weekend"), None)
    if is_weekend is None and day_of_week is not None:
        is_weekend = day_of_week in {5, 6}
    if is_weekend is None:
        is_weekend = False

    calendar_hint = _normalize_calendar_hint(context.get("calendar_hint"))
    location_hint = _normalize_location_hint(context.get("location_hint"))
    speed_kmh = _safe_float(context.get("speed_kmh"), None)
    steps_per_min = _safe_float(context.get("steps_per_min"), None)
    screen_on_ratio = _clip01(context.get("screen_on_ratio"), 0.0) if "screen_on_ratio" in context else None
    call_active = _safe_bool(context.get("call_active"), None)

    if calendar_hint:
        _add_score(scores, reasons, calendar_hint, 0.55, f"calendar:{calendar_hint}")
        if calendar_hint == "meeting":
            _add_score(scores, reasons, "work_focus", 0.15, "calendar:meeting_context")
        if calendar_hint == "work_focus":
            _add_score(scores, reasons, "meeting", 0.08, "calendar:focus_block")

    if speed_kmh is not None:
        if speed_kmh >= 8.0:
            _add_score(scores, reasons, "commute", 0.45, "speed:high")
        elif speed_kmh >= 3.0 and moving_prob >= 0.30:
            _add_score(scores, reasons, "commute", 0.25, "speed:moderate")

    if steps_per_min is not None:
        if steps_per_min >= 120.0:
            _add_score(scores, reasons, "workout", 0.55, "steps:very_high")
        elif steps_per_min >= 80.0:
            _add_score(scores, reasons, "workout", 0.28, "steps:high")
        elif steps_per_min >= 40.0 and moving_prob >= 0.45:
            _add_score(scores, reasons, "commute", 0.10, "steps:moderate")

    if hour is not None:
        if ((7 <= hour < 10) or (17 <= hour < 21)) and moving_prob >= 0.25:
            _add_score(scores, reasons, "commute", 0.18, "hour:commute_window")
        if ((11 <= hour < 14) or (18 <= hour < 21)) and still_prob >= 0.35:
            _add_score(scores, reasons, "meal", 0.16, "hour:meal_window")
        if (9 <= hour < 18) and (not is_weekend) and still_prob >= 0.40:
            _add_score(scores, reasons, "work_focus", 0.15, "hour:work_window")
        if (hour >= 22 or hour < 6) and (lay_prob >= 0.20 or still_prob >= 0.55):
            _add_score(scores, reasons, "sleep", 0.28, "hour:night_window")
            _add_score(scores, reasons, "relax", 0.10, "hour:night_wind_down")

    if screen_on_ratio is not None:
        if screen_on_ratio >= 0.75 and still_prob >= 0.45 and hour is not None and 8 <= hour < 19:
            _add_score(scores, reasons, "work_focus", 0.18, "screen:high_on")
        if screen_on_ratio <= 0.20 and lay_prob >= 0.25:
            _add_score(scores, reasons, "sleep", 0.18, "screen:low_on")

    if location_hint == "home":
        _add_score(scores, reasons, "relax", 0.12, "location:home")
        _add_score(scores, reasons, "chores", 0.10, "location:home")
        _add_score(scores, reasons, "meal", 0.06, "location:home")
    elif location_hint == "office":
        _add_score(scores, reasons, "work_focus", 0.22, "location:office")
        _add_score(scores, reasons, "meeting", 0.10, "location:office")
    elif location_hint == "transit":
        _add_score(scores, reasons, "commute", 0.35, "location:transit")
    elif location_hint == "gym":
        _add_score(scores, reasons, "workout", 0.45, "location:gym")
    elif location_hint == "restaurant":
        _add_score(scores, reasons, "meal", 0.30, "location:restaurant")
        _add_score(scores, reasons, "social", 0.15, "location:restaurant")
    elif location_hint == "store":
        _add_score(scores, reasons, "chores", 0.28, "location:store")

    if call_active:
        _add_score(scores, reasons, "social", 0.22, "call:active")
        if calendar_hint == "meeting":
            _add_score(scores, reasons, "meeting", 0.12, "call:meeting_context")

    if l0_probs.get("unknown", 0.0) >= 0.45:
        _add_score(scores, reasons, "unknown_event", 0.30, "l0:unknown_high")
    if max(l0_probs.values()) < 0.42:
        _add_score(scores, reasons, "unknown_event", 0.20, "l0:flat_distribution")


def _normalize_scores(scores: dict[str, float]) -> dict[str, float]:
    positive = {label: (val if val > 0.0 else 0.0) for label, val in scores.items()}
    total = sum(positive.values())
    if total <= 0.0:
        return {label: (1.0 if label == "unknown_event" else 0.0) for label in L1_LABELS}
    return {label: positive[label] / total for label in L1_LABELS}


def _question_text(label_a: str, label_b: str) -> str:
    pair = tuple(sorted((label_a, label_b)))
    return _PAIR_QUESTION_TEXT.get(pair, "지금 상태를 하나만 고르면 무엇에 가장 가까운가요?")


def _build_question_gate(
    topk: list[dict[str, Any]],
    l0_probs: dict[str, float],
    confidence_threshold: float,
    margin_threshold: float,
) -> dict[str, Any] | None:
    if not topk:
        return {
            "text": "지금 상태를 하나만 고르면 무엇에 가장 가까운가요?",
            "options": ["unknown_event"],
            "reasons": ["empty_prediction"],
            "cooldown_key": "l1:unknown",
            "expires_minutes": DEFAULT_QUESTION_EXPIRES_MINUTES,
        }

    top1 = topk[0]
    top2 = topk[1] if len(topk) > 1 else {"label": "unknown_event", "confidence": 0.0}
    margin = float(top1["confidence"]) - float(top2["confidence"])

    reasons: list[str] = []
    if float(top1["confidence"]) < confidence_threshold:
        reasons.append("low_confidence")
    if margin < margin_threshold:
        reasons.append("small_margin")
    if top1["label"] == "unknown_event":
        reasons.append("top1_unknown_event")
    if l0_probs.get("unknown", 0.0) >= 0.45:
        reasons.append("l0_unknown_high")

    if not reasons:
        return None

    opt_a = str(top1["label"])
    opt_b = str(top2["label"])
    options = [opt_a]
    if opt_b not in options:
        options.append(opt_b)
    if "unknown_event" not in options:
        options.append("unknown_event")

    return {
        "text": _question_text(opt_a, opt_b),
        "options": options,
        "reasons": reasons,
        "cooldown_key": f"l1:{min(opt_a, opt_b)}+{max(opt_a, opt_b)}",
        "expires_minutes": DEFAULT_QUESTION_EXPIRES_MINUTES,
    }


def infer_l1_event(
    *,
    l0_probs: dict[str, Any] | None = None,
    l0_top1: str | None = None,
    l0_confidence: float | None = None,
    context: dict[str, Any] | None = None,
    topk_size: int = 5,
    confidence_threshold: float = DEFAULT_L1_CONFIDENCE_THRESHOLD,
    margin_threshold: float = DEFAULT_L1_MARGIN_THRESHOLD,
) -> dict[str, Any]:
    ctx = dict(context or {})
    l0_norm = _normalize_l0_probs(l0_probs=l0_probs, l0_top1=l0_top1, l0_confidence=l0_confidence)

    scores = {label: 1e-6 for label in L1_LABELS}
    reasons = {label: [] for label in L1_LABELS}
    _apply_base_priors(l0_norm, scores, reasons)
    _apply_context_rules(l0_norm, ctx, scores, reasons)

    l1_probs = _normalize_scores(scores)
    sorted_items = sorted(l1_probs.items(), key=lambda x: x[1], reverse=True)
    topk_items = sorted_items[: max(1, int(topk_size))]
    topk = [{"label": label, "confidence": round(float(prob), 6)} for label, prob in topk_items]

    top1_label, top1_conf = topk_items[0]
    top2_conf = topk_items[1][1] if len(topk_items) > 1 else 0.0
    margin = float(top1_conf - top2_conf)

    question = _build_question_gate(
        topk=topk,
        l0_probs=l0_norm,
        confidence_threshold=float(confidence_threshold),
        margin_threshold=float(margin_threshold),
    )

    compact_reasons = {
        label: reason_list[:3] for label, reason_list in reasons.items() if reason_list and label in {x["label"] for x in topk}
    }

    return {
        "l0_probs": {k: round(v, 6) for k, v in l0_norm.items()},
        "l1_top1": top1_label,
        "l1_confidence": round(float(top1_conf), 6),
        "margin_top1_top2": round(margin, 6),
        "l1_topk": topk,
        "l1_probs": {k: round(v, 6) for k, v in l1_probs.items()},
        "score_reasons": compact_reasons,
        "ask_question": question is not None,
        "question": question,
    }


def to_behavior_candidate_payload(
    *,
    inference: dict[str, Any],
    ts_start: datetime,
    ts_end: datetime,
    user_id: str | None = None,
    day_id: int | None = None,
    screen_state: str | None = None,
    orientation: str | None = None,
    pickup_flag: bool | None = None,
) -> dict[str, Any]:
    topk = list(inference.get("l1_topk") or [])
    top1 = topk[0] if topk else {"label": "unknown_event", "confidence": 0.0}
    margin = float(inference.get("margin_top1_top2") or 0.0)
    confidence = float(top1.get("confidence") or 0.0)
    mismatch_score = round(max(0.0, min(1.0, 1.0 - confidence)), 6)

    payload: dict[str, Any] = {
        "user_id": user_id,
        "day_id": day_id,
        "ts_start": ts_start.astimezone(timezone.utc).isoformat(),
        "ts_end": ts_end.astimezone(timezone.utc).isoformat(),
        "top1": str(top1["label"]),
        "activity_topk": topk,
        "confidence": round(confidence, 6),
        "margin_top1_top2": round(margin, 6),
        "screen_state": screen_state,
        "orientation": orientation,
        "pickup_flag": pickup_flag,
        "mismatch_score": mismatch_score,
        "trigger_reasons": list((inference.get("question") or {}).get("reasons") or []),
    }
    return payload


def to_behavior_question_payload(
    *,
    candidate_id: int,
    inference: dict[str, Any],
    user_id: str | None = None,
) -> dict[str, Any] | None:
    question = inference.get("question")
    if not question:
        return None
    return {
        "user_id": user_id,
        "candidate_id": int(candidate_id),
        "question_text": question.get("text"),
        "trigger_reasons": list(question.get("reasons") or []),
        "cooldown_key": question.get("cooldown_key"),
        "expires_minutes": int(question.get("expires_minutes") or DEFAULT_QUESTION_EXPIRES_MINUTES),
    }


def default_window_bounds(now_utc: datetime | None = None, window_sec: float = 2.56) -> tuple[datetime, datetime]:
    start = now_utc or datetime.now(timezone.utc)
    end = start + timedelta(seconds=float(window_sec))
    return start, end
