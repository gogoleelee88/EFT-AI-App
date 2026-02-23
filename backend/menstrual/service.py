from __future__ import annotations

import base64
import csv
import io
import json
import math
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from statistics import mean, pstdev
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from menstrual.schemas import (
    BleedingLogRequest,
    CalendarResponse,
    ExportJobRequest,
    ExportJobResponse,
    ExportJobStatusResponse,
    InsightsResponse,
    JournalEntry,
    JournalLogRequest,
    JournalSearchResponse,
    MedsLogRequest,
    PMDDLiteLogRequest,
    PMDDLiteScoreResponse,
    PMSSeverityBand,
    PredictionResponse,
    PrivacySettingsResponse,
    PrivacySettingsUpdateRequest,
    RecordResponse,
    SymptomsLogRequest,
    TriggerLogRequest,
    TriggerTimelineItem,
)
from menstrual.drsp_lite import (
    calculate_pmdd_assessment,
    question_ids_for_length,
    question_labels_for_ids,
)
from backend.models.menstrual import (
    MenstrualDaySummary,
    MenstrualEvent,
    MenstrualExportJob,
    MenstrualPrediction,
    MenstrualPrivacySettings,
)


BLEEDING_TYPES = {
    "menstruation_start",
    "menstruation_end",
    "spotting_start",
    "spotting_end",
}
PHASE_POLICY = "phase_only_no_fertility"
FERTILITY_WINDOW_VISIBLE = False
MEDICAL_DISCLAIMER = (
    "Not a medical device and not for diagnosis, contraception, or pregnancy prevention."
)
ON_DEVICE_NOTICE = (
    "On-device only mode is enabled. Sensitive menstrual logs are not accepted by the server."
)
DEFAULT_CYCLE_LEN = 28
MIN_CYCLE_LEN = 15
MAX_CYCLE_LEN = 60
MAX_QUERY_RANGE_DAYS = 366


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _daterange(start: date, end: date):
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    rank = (len(sorted_values) - 1) * (p / 100.0)
    lower = int(math.floor(rank))
    upper = int(math.ceil(rank))
    if lower == upper:
        return float(sorted_values[lower])
    low = sorted_values[lower]
    high = sorted_values[upper]
    return float(low + (high - low) * (rank - lower))


def _validate_date_range(from_date: date, to_date: date) -> None:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from must be <= to")
    if (to_date - from_date).days > MAX_QUERY_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"range must be <= {MAX_QUERY_RANGE_DAYS} days",
        )


def _get_or_create_privacy_settings(db: Session, user_id: str) -> MenstrualPrivacySettings:
    row = (
        db.query(MenstrualPrivacySettings)
        .filter(MenstrualPrivacySettings.user_id == user_id)
        .one_or_none()
    )
    if row is not None:
        return row

    row = MenstrualPrivacySettings(user_id=user_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _assert_server_write_allowed(db: Session, user_id: str) -> None:
    settings = _get_or_create_privacy_settings(db, user_id)
    if settings.on_device_only:
        raise HTTPException(status_code=409, detail=ON_DEVICE_NOTICE)


def _insert_event(
    db: Session,
    user_id: str,
    *,
    event_type: str,
    event_date: date | None = None,
    event_ts: datetime | None = None,
    value_json: dict[str, Any] | None = None,
    is_sensitive: bool = True,
) -> MenstrualEvent:
    row = MenstrualEvent(
        user_id=user_id,
        event_type=event_type,
        event_date=event_date,
        event_ts=event_ts,
        value_json=value_json or {},
        is_sensitive=is_sensitive,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _collect_period_starts(db: Session, user_id: str, until: date | None = None) -> list[date]:
    q = (
        db.query(MenstrualEvent)
        .filter(
            MenstrualEvent.user_id == user_id,
            MenstrualEvent.event_type == "menstruation_start",
            MenstrualEvent.event_date.isnot(None),
        )
        .order_by(MenstrualEvent.event_date.asc(), MenstrualEvent.created_at.asc())
    )
    if until is not None:
        q = q.filter(MenstrualEvent.event_date <= until)
    rows = q.all()
    out: list[date] = []
    for row in rows:
        if row.event_date and (not out or out[-1] != row.event_date):
            out.append(row.event_date)
    return out


def _derive_cycle_lengths(starts: list[date], limit: int = 6) -> list[int]:
    values: list[int] = []
    for idx in range(1, len(starts)):
        delta = (starts[idx] - starts[idx - 1]).days
        if MIN_CYCLE_LEN <= delta <= MAX_CYCLE_LEN:
            values.append(delta)
    return values[-limit:]


def _data_quality(starts: list[date], lengths: list[int], std_days: float | None) -> str:
    if len(starts) < 2 or not lengths:
        return "insufficient"
    if len(lengths) < 3:
        return "fair"
    if std_days is not None and std_days > 6:
        return "fair"
    return "good"


def _prediction_payload(db: Session, user_id: str, reference_day: date) -> dict[str, Any]:
    starts = _collect_period_starts(db, user_id, until=reference_day)
    lengths = _derive_cycle_lengths(starts)
    if not lengths or len(starts) < 2:
        if starts:
            confidence = 20
            why = (
                "Prediction is limited: fewer than 2 full cycle intervals were recorded. "
                "Log more menstruation starts for a reliable range."
            )
        else:
            confidence = 5
            why = "Prediction is unavailable: no menstruation_start history was found yet."
        return {
            "next_period_window_start": None,
            "next_period_window_end": None,
            "confidence_score": confidence,
            "why_this": why,
            "data_quality": "insufficient",
            "avg_cycle_len_days": None,
            "cycle_len_std_days": None,
        }

    avg_cycle = float(mean(lengths))
    std_cycle = float(pstdev(lengths)) if len(lengths) >= 2 else 0.0
    data_quality = _data_quality(starts, lengths, std_cycle)
    last_start = starts[-1]
    center = last_start + timedelta(days=int(round(avg_cycle)))

    margin = max(2, int(round(std_cycle * 1.6)))
    if std_cycle >= 6:
        margin += 2
    if std_cycle >= 9:
        margin += 2

    start_day = center - timedelta(days=margin)
    end_day = center + timedelta(days=margin)

    confidence = 35 + min(30, len(lengths) * 7) - int(round(std_cycle * 5))
    if data_quality == "good":
        confidence += 20
    elif data_quality == "fair":
        confidence += 8
    confidence = int(_clamp(confidence, 5, 95))

    why = (
        f"Based on {len(lengths)} recent cycle(s): avg {avg_cycle:.1f} days, "
        f"variability {std_cycle:.1f} days, range Â±{margin} days."
    )

    return {
        "next_period_window_start": start_day,
        "next_period_window_end": end_day,
        "confidence_score": confidence,
        "why_this": why,
        "data_quality": data_quality,
        "avg_cycle_len_days": avg_cycle,
        "cycle_len_std_days": std_cycle,
    }


def _save_prediction(db: Session, user_id: str, payload: dict[str, Any]) -> None:
    row = MenstrualPrediction(
        user_id=user_id,
        next_period_window_start=payload["next_period_window_start"],
        next_period_window_end=payload["next_period_window_end"],
        confidence_score=payload["confidence_score"],
        why_this=payload["why_this"],
        data_quality=payload["data_quality"],
        phase_policy=PHASE_POLICY,
        fertility_window_visible=FERTILITY_WINDOW_VISIBLE,
    )
    db.add(row)
    db.commit()


def get_prediction(db: Session, user_id: str, reference_day: date | None = None) -> PredictionResponse:
    ref_day = reference_day or date.today()
    payload = _prediction_payload(db, user_id, ref_day)
    _save_prediction(db, user_id, payload)
    return PredictionResponse(
        next_period_window_start=payload["next_period_window_start"],
        next_period_window_end=payload["next_period_window_end"],
        confidence_score=payload["confidence_score"],
        why_this=payload["why_this"],
        data_quality=payload["data_quality"],
        fertility_window_visible=FERTILITY_WINDOW_VISIBLE,
        phase_policy=PHASE_POLICY,
        medical_disclaimer=MEDICAL_DISCLAIMER,
    )


def _phase_probabilities(
    cycle_day_index: int | None,
    cycle_len: int | None,
    data_quality: str,
    std_days: float | None,
) -> tuple[str, dict[str, float]]:
    phase_names = ["menstruation", "follicular", "ovulation_window", "luteal", "unknown"]
    if cycle_day_index is None or cycle_day_index <= 0:
        return "unknown", {name: (1.0 if name == "unknown" else 0.0) for name in phase_names}

    estimated_len = int(_clamp(float(cycle_len or DEFAULT_CYCLE_LEN), 21, 40))
    ovulation_day = int(_clamp(float(estimated_len - 14), 10, estimated_len - 10))

    centers = {
        "menstruation": 2.5,
        "follicular": max(7.0, (ovulation_day - 2) / 2.0),
        "ovulation_window": float(ovulation_day),
        "luteal": float(min(estimated_len - 1, ovulation_day + 6)),
    }
    sigmas = {
        "menstruation": 1.7,
        "follicular": 3.5,
        "ovulation_window": 2.2,
        "luteal": 4.0,
    }

    uncertainty_multiplier = 1.0
    if std_days is not None and std_days > 0:
        uncertainty_multiplier += min(1.0, std_days / 10.0)

    raw: dict[str, float] = {}
    for name in ("menstruation", "follicular", "ovulation_window", "luteal"):
        sigma = sigmas[name] * uncertainty_multiplier
        distance = abs(cycle_day_index - centers[name])
        raw[name] = math.exp(-(distance**2) / (2 * sigma**2))

    unknown_weight = {"insufficient": 1.8, "fair": 0.9, "good": 0.35}.get(data_quality, 1.0)
    if std_days is not None and std_days > 5:
        unknown_weight += min(1.0, std_days / 12.0)
    raw["unknown"] = unknown_weight

    total = sum(raw.values()) or 1.0
    probs = {name: round(raw.get(name, 0.0) / total, 4) for name in phase_names}
    # Keep exact sum=1.0 after rounding for deterministic UI rendering.
    rounded_sum = round(sum(probs.values()), 4)
    if rounded_sum != 1.0:
        probs["unknown"] = round(max(0.0, probs.get("unknown", 0.0) + (1.0 - rounded_sum)), 4)
    phase = max(probs, key=probs.get)
    if phase != "unknown" and probs[phase] < 0.4:
        phase = "unknown"
    return phase, probs


def _extract_flow(value_json: dict[str, Any]) -> int | None:
    flow = value_json.get("flow_level")
    if isinstance(flow, bool):
        return None
    if isinstance(flow, (int, float)):
        flow_i = int(flow)
        if 0 <= flow_i <= 4:
            return flow_i
    return None


def _build_bleeding_state(
    bleeding_events: list[MenstrualEvent],
    from_date: date,
    to_date: date,
) -> dict[date, dict[str, Any]]:
    events = sorted(
        [ev for ev in bleeding_events if ev.event_date is not None],
        key=lambda ev: (ev.event_date, ev.created_at or datetime.min.replace(tzinfo=timezone.utc)),
    )

    menstruation_active = False
    spotting_active = False
    active_flow: int | None = None
    by_date: dict[date, list[MenstrualEvent]] = defaultdict(list)
    for ev in events:
        assert ev.event_date is not None
        by_date[ev.event_date].append(ev)

    for day in sorted(k for k in by_date.keys() if k < from_date):
        for ev in by_date[day]:
            event_type = ev.event_type
            flow = _extract_flow(ev.value_json or {})
            if event_type == "menstruation_start":
                menstruation_active = True
                spotting_active = False
            elif event_type == "menstruation_end":
                menstruation_active = False
            elif event_type == "spotting_start":
                spotting_active = True
                if not menstruation_active:
                    active_flow = flow
            elif event_type == "spotting_end":
                spotting_active = False
            if flow is not None:
                active_flow = flow
        if not menstruation_active and not spotting_active:
            active_flow = None

    out: dict[date, dict[str, Any]] = {}
    for day in _daterange(from_date, to_date):
        day_flow: int | None = None
        for ev in by_date.get(day, []):
            event_type = ev.event_type
            flow = _extract_flow(ev.value_json or {})
            if event_type == "menstruation_start":
                menstruation_active = True
                spotting_active = False
            elif event_type == "menstruation_end":
                menstruation_active = False
            elif event_type == "spotting_start":
                spotting_active = True
            elif event_type == "spotting_end":
                spotting_active = False

            if flow is not None:
                active_flow = flow
                day_flow = flow

        if menstruation_active:
            status = "period"
        elif spotting_active:
            status = "spotting"
        else:
            status = "none"

        if status == "none":
            flow_level = 0
            active_flow = None
        else:
            flow_level = day_flow if day_flow is not None else (active_flow if active_flow is not None else 1)

        out[day] = {"bleeding_status": status, "flow_level": flow_level}
    return out


def _latest_start_before(starts: list[date], day: date) -> date | None:
    latest: date | None = None
    for start in starts:
        if start <= day:
            latest = start
        else:
            break
    return latest


def _day_top_symptoms(events: list[MenstrualEvent]) -> list[dict[str, int | str]]:
    merged: dict[str, int] = {}
    for event in events:
        symptom_map = (event.value_json or {}).get("symptom_severity_map")
        if not isinstance(symptom_map, dict):
            continue
        for raw_key, raw_score in symptom_map.items():
            if not isinstance(raw_key, str):
                continue
            key = raw_key.strip().lower().replace(" ", "_")
            if not key:
                continue
            if isinstance(raw_score, bool) or not isinstance(raw_score, (int, float)):
                continue
            score = int(raw_score)
            if score < 0:
                continue
            merged[key] = max(score, merged.get(key, 0))
    ranked = sorted(merged.items(), key=lambda item: (-item[1], item[0]))
    return [{"symptom": key, "severity": val} for key, val in ranked[:8] if val > 0]


def _day_pmdd_index(events: list[MenstrualEvent]) -> float | None:
    if not events:
        return None
    sorted_events = sorted(
        events,
        key=lambda ev: (ev.created_at or datetime.min.replace(tzinfo=timezone.utc)),
    )
    for event in reversed(sorted_events):
        index = (event.value_json or {}).get("pmdd_symptom_index")
        if isinstance(index, bool):
            continue
        if isinstance(index, (int, float)):
            return round(float(index), 2)
    return None


def _recent_pmdd_indices(
    db: Session,
    user_id: str,
    *,
    until_date: date,
    lookback_days: int = 120,
    limit: int = 24,
) -> list[float]:
    from_date = until_date - timedelta(days=lookback_days)
    rows = (
        db.query(MenstrualEvent)
        .filter(
            MenstrualEvent.user_id == user_id,
            MenstrualEvent.event_type == "pmdd_drsp_lite_entry",
            MenstrualEvent.event_date.isnot(None),
            MenstrualEvent.event_date >= from_date,
            MenstrualEvent.event_date < until_date,
        )
        .order_by(MenstrualEvent.event_date.desc(), MenstrualEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    out: list[float] = []
    for row in rows:
        score = (row.value_json or {}).get("pmdd_symptom_index")
        if isinstance(score, bool):
            continue
        if isinstance(score, (int, float)):
            out.append(float(score))
    return list(reversed(out))


def recompute_day_summaries(
    db: Session,
    user_id: str,
    from_date: date,
    to_date: date,
) -> list[MenstrualDaySummary]:
    _validate_date_range(from_date, to_date)
    buffer_start = from_date - timedelta(days=120)

    events = (
        db.query(MenstrualEvent)
        .filter(
            MenstrualEvent.user_id == user_id,
            MenstrualEvent.event_date.isnot(None),
            MenstrualEvent.event_date >= buffer_start,
            MenstrualEvent.event_date <= to_date,
        )
        .order_by(MenstrualEvent.event_date.asc(), MenstrualEvent.created_at.asc())
        .all()
    )
    bleeding_events = [ev for ev in events if ev.event_type in BLEEDING_TYPES]
    symptom_events = [ev for ev in events if ev.event_type == "symptom_entry" and ev.event_date and ev.event_date >= from_date]
    pmdd_events = [ev for ev in events if ev.event_type == "pmdd_drsp_lite_entry" and ev.event_date and ev.event_date >= from_date]

    symptoms_by_day: dict[date, list[MenstrualEvent]] = defaultdict(list)
    for ev in symptom_events:
        assert ev.event_date is not None
        symptoms_by_day[ev.event_date].append(ev)

    pmdd_by_day: dict[date, list[MenstrualEvent]] = defaultdict(list)
    for ev in pmdd_events:
        assert ev.event_date is not None
        pmdd_by_day[ev.event_date].append(ev)

    starts = _collect_period_starts(db, user_id, until=to_date)
    lengths = _derive_cycle_lengths(starts, limit=10)
    avg_cycle = int(round(mean(lengths))) if lengths else DEFAULT_CYCLE_LEN
    std_days = float(pstdev(lengths)) if len(lengths) >= 2 else (0.0 if lengths else None)
    quality = _data_quality(starts, lengths, std_days)

    bleeding_by_day = _build_bleeding_state(bleeding_events, from_date, to_date)
    existing = {
        row.day_date: row
        for row in (
            db.query(MenstrualDaySummary)
            .filter(
                MenstrualDaySummary.user_id == user_id,
                MenstrualDaySummary.day_date >= from_date,
                MenstrualDaySummary.day_date <= to_date,
            )
            .all()
        )
    }

    rows: list[MenstrualDaySummary] = []
    now = _utc_now()
    for day in _daterange(from_date, to_date):
        base = bleeding_by_day.get(day, {"bleeding_status": "none", "flow_level": 0})
        last_start = _latest_start_before(starts, day)
        cycle_day = (day - last_start).days + 1 if last_start is not None else None
        phase, phase_probs = _phase_probabilities(cycle_day, avg_cycle, quality, std_days)
        pmdd_index = _day_pmdd_index(pmdd_by_day.get(day, []))
        top_symptoms = _day_top_symptoms(symptoms_by_day.get(day, []))

        row = existing.get(day)
        if row is None:
            row = MenstrualDaySummary(user_id=user_id, day_date=day)
            db.add(row)

        row.bleeding_status = str(base["bleeding_status"])
        row.flow_level = int(base["flow_level"]) if base["flow_level"] is not None else None
        row.cycle_day_index = cycle_day
        row.phase = phase
        row.phase_probabilities = phase_probs
        row.pmdd_symptom_index = pmdd_index
        row.top_symptoms = top_symptoms
        row.computed_at = now
        rows.append(row)

    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def get_calendar(db: Session, user_id: str, from_date: date, to_date: date) -> CalendarResponse:
    rows = recompute_day_summaries(db, user_id, from_date, to_date)
    return CalendarResponse(
        day_summaries=[
            {
                "day_date": row.day_date,
                "bleeding_status": row.bleeding_status,
                "flow_level": row.flow_level,
                "cycle_day_index": row.cycle_day_index,
                "phase": row.phase,
                "phase_probabilities": row.phase_probabilities or {},
                "pmdd_symptom_index": row.pmdd_symptom_index,
                "top_symptoms": row.top_symptoms or [],
            }
            for row in sorted(rows, key=lambda item: item.day_date)
        ],
        fertility_window_visible=FERTILITY_WINDOW_VISIBLE,
        phase_policy=PHASE_POLICY,
        medical_disclaimer=MEDICAL_DISCLAIMER,
    )


def _pmdd_band(index: float) -> PMSSeverityBand:
    if index < 34:
        return "mild"
    if index < 67:
        return "moderate"
    return "severe"


def log_bleeding(db: Session, user_id: str, payload: BleedingLogRequest) -> RecordResponse:
    _assert_server_write_allowed(db, user_id)
    row = _insert_event(
        db,
        user_id,
        event_type=payload.type,
        event_date=payload.date,
        value_json={
            "flow_level": payload.flow_level,
            "cramp_level": payload.cramp_level,
            "pain_areas": payload.pain_areas,
            "notes": payload.notes,
            "meds_taken": payload.meds_taken,
        },
        is_sensitive=True,
    )
    recompute_day_summaries(db, user_id, payload.date, payload.date)
    return RecordResponse(event_id=row.id, event_date=payload.date)


def log_symptoms(db: Session, user_id: str, payload: SymptomsLogRequest) -> RecordResponse:
    _assert_server_write_allowed(db, user_id)
    row = _insert_event(
        db,
        user_id,
        event_type="symptom_entry",
        event_date=payload.date,
        value_json={
            "symptom_severity_map": payload.symptom_severity_map,
            "favorite_symptoms": payload.favorite_symptoms,
            "notes": payload.notes,
        },
        is_sensitive=True,
    )
    recompute_day_summaries(db, user_id, payload.date, payload.date)
    return RecordResponse(event_id=row.id, event_date=payload.date)


def log_pmdd_lite(
    db: Session,
    user_id: str,
    payload: PMDDLiteLogRequest,
) -> tuple[RecordResponse, PMDDLiteScoreResponse]:
    _assert_server_write_allowed(db, user_id)
    question_ids = payload.question_ids or question_ids_for_length(len(payload.answers))
    recent_indices = _recent_pmdd_indices(db, user_id, until_date=payload.date)
    assessment = calculate_pmdd_assessment(payload.answers, recent_indices=recent_indices)
    pmdd_index = float(assessment["pmdd_symptom_index"])
    band = str(assessment["pms_severity_band"])
    interpretation = str(assessment["interpretation"])
    severity_thresholds = dict(assessment["severity_thresholds"])
    baseline_index = assessment.get("baseline_index")
    trend_delta = assessment.get("trend_delta")
    confidence = str(assessment["confidence"])
    scoring_version = str(assessment["scoring_version"])
    high_emotional_count = int(assessment["high_emotional_count"])
    caution = (
        "???ì??ì§ë¨???ë???ë´ ì¤ë¹ì© ì¶ì ì§?ì?ë¤. ?íê° ì§?ëë©??ë¬¸ê° ?ë´??ê¶ì¥?©ë??"
    )
    row = _insert_event(
        db,
        user_id,
        event_type="pmdd_drsp_lite_entry",
        event_date=payload.date,
        value_json={
            "answers": payload.answers,
            "question_ids": question_ids,
            "question_labels_ko": question_labels_for_ids(question_ids),
            "scale": "0_to_4",
            "pmdd_symptom_index": pmdd_index,
            "pms_severity_band": band,
            "severity_thresholds": severity_thresholds,
            "baseline_index": baseline_index,
            "trend_delta": trend_delta,
            "confidence": confidence,
            "interpretation": interpretation,
            "scoring_version": scoring_version,
            "high_emotional_count": high_emotional_count,
            "notes": payload.notes,
            "disclaimer": MEDICAL_DISCLAIMER,
        },
        is_sensitive=True,
    )
    recompute_day_summaries(db, user_id, payload.date, payload.date)
    return (
        RecordResponse(event_id=row.id, event_date=payload.date),
        PMDDLiteScoreResponse(
            pmdd_symptom_index=pmdd_index,
            pms_severity_band=band,  # type: ignore[arg-type]
            severity_thresholds=severity_thresholds,
            baseline_index=(float(baseline_index) if isinstance(baseline_index, (int, float)) else None),
            trend_delta=(float(trend_delta) if isinstance(trend_delta, (int, float)) else None),
            confidence=confidence,  # type: ignore[arg-type]
            interpretation=interpretation,
            scoring_version=scoring_version,
            high_emotional_count=high_emotional_count,
            answered_items=len(payload.answers),
            question_labels_ko=question_labels_for_ids(question_ids),
            caution=caution,
            medical_disclaimer=MEDICAL_DISCLAIMER,
        ),
    )


def log_trigger(db: Session, user_id: str, payload: TriggerLogRequest) -> RecordResponse:
    _assert_server_write_allowed(db, user_id)
    row = _insert_event(
        db,
        user_id,
        event_type="trigger_entry",
        event_date=payload.date,
        value_json={
            "tags": payload.tags,
            "stress_level": payload.stress_level,
            "note": payload.note,
        },
        is_sensitive=True,
    )
    return RecordResponse(event_id=row.id, event_date=payload.date)


def log_meds(db: Session, user_id: str, payload: MedsLogRequest) -> RecordResponse:
    _assert_server_write_allowed(db, user_id)
    row = _insert_event(
        db,
        user_id,
        event_type="med_entry",
        event_date=payload.datetime.date(),
        event_ts=payload.datetime,
        value_json={
            "med_name": payload.med_name,
            "dose": payload.dose,
            "type": payload.type,
            "effect_rating": payload.effect_rating,
            "note": payload.note,
        },
        is_sensitive=True,
    )
    return RecordResponse(event_id=row.id, timestamp=payload.datetime, event_date=payload.datetime.date())


def log_journal(db: Session, user_id: str, payload: JournalLogRequest) -> RecordResponse:
    _assert_server_write_allowed(db, user_id)
    row = _insert_event(
        db,
        user_id,
        event_type="journal_entry",
        event_date=payload.datetime.date(),
        event_ts=payload.datetime,
        value_json={
            "text": payload.text,
            "tags": payload.tags,
            "severity": payload.severity,
        },
        is_sensitive=True,
    )
    return RecordResponse(event_id=row.id, timestamp=payload.datetime, event_date=payload.datetime.date())


def search_journal(
    db: Session,
    user_id: str,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    tag: str | None = None,
    min_severity: int | None = None,
    q: str | None = None,
) -> JournalSearchResponse:
    query = db.query(MenstrualEvent).filter(
        MenstrualEvent.user_id == user_id,
        MenstrualEvent.event_type == "journal_entry",
    )
    if from_date is not None:
        query = query.filter(MenstrualEvent.event_date >= from_date)
    if to_date is not None:
        query = query.filter(MenstrualEvent.event_date <= to_date)
    rows = query.order_by(MenstrualEvent.event_ts.desc(), MenstrualEvent.created_at.desc()).all()

    normalized_tag = tag.strip().lower().replace(" ", "_") if tag else None
    normalized_q = q.strip().lower() if q else None
    out: list[JournalEntry] = []
    for row in rows:
        value = row.value_json or {}
        text = str(value.get("text") or "")
        tags = value.get("tags") if isinstance(value.get("tags"), list) else []
        tags = [str(item) for item in tags if isinstance(item, str)]
        severity_raw = value.get("severity")
        severity = int(severity_raw) if isinstance(severity_raw, (int, float)) and not isinstance(severity_raw, bool) else None

        if normalized_tag and normalized_tag not in {t.lower() for t in tags}:
            continue
        if min_severity is not None:
            if severity is None or severity < min_severity:
                continue
        if normalized_q:
            haystack = f"{text} {' '.join(tags)}".lower()
            if normalized_q not in haystack:
                continue

        ts = row.event_ts
        if ts is None:
            if row.event_date is None:
                continue
            ts = datetime.combine(row.event_date, datetime.min.time(), tzinfo=timezone.utc)

        out.append(
            JournalEntry(
                event_id=row.id,
                datetime=ts,
                text=text,
                tags=tags,
                severity=severity,
            )
        )
    return JournalSearchResponse(entries=out)


def get_insights(db: Session, user_id: str, from_date: date, to_date: date) -> InsightsResponse:
    _validate_date_range(from_date, to_date)
    summaries = recompute_day_summaries(db, user_id, from_date, to_date)

    symptom_rows = (
        db.query(MenstrualEvent)
        .filter(
            MenstrualEvent.user_id == user_id,
            MenstrualEvent.event_type == "symptom_entry",
            MenstrualEvent.event_date >= from_date,
            MenstrualEvent.event_date <= to_date,
        )
        .all()
    )

    symptom_scores: dict[str, list[int]] = defaultdict(list)
    for row in symptom_rows:
        mapping = (row.value_json or {}).get("symptom_severity_map")
        if not isinstance(mapping, dict):
            continue
        for key, raw in mapping.items():
            if not isinstance(key, str):
                continue
            if isinstance(raw, bool) or not isinstance(raw, (int, float)):
                continue
            norm = key.strip().lower().replace(" ", "_")
            if not norm:
                continue
            score = int(raw)
            if 0 <= score <= 4:
                symptom_scores[norm].append(score)

    symptom_trends = [
        {
            "symptom": symptom,
            "avg_severity": round(sum(values) / len(values), 3),
            "sample_count": len(values),
        }
        for symptom, values in symptom_scores.items()
        if values
    ]
    symptom_trends.sort(key=lambda item: (-item["avg_severity"], -item["sample_count"], item["symptom"]))
    symptom_trends = symptom_trends[:8]

    pmdd_timeline = [
        {
            "date": row.day_date.isoformat(),
            "pmdd_symptom_index": round(float(row.pmdd_symptom_index), 2),
        }
        for row in sorted(summaries, key=lambda item: item.day_date)
        if row.pmdd_symptom_index is not None
    ]

    recent_start = to_date - timedelta(days=13)
    recent = [row for row in summaries if recent_start <= row.day_date <= to_date and row.pmdd_symptom_index is not None]
    recent_values = [float(row.pmdd_symptom_index) for row in recent if row.pmdd_symptom_index is not None]
    threshold = _percentile(recent_values, 75.0)
    worsening_days = [
        row.day_date
        for row in recent
        if threshold is not None and row.pmdd_symptom_index is not None and row.pmdd_symptom_index >= threshold
    ]
    worsening_day_set = set(worsening_days)

    trigger_rows = (
        db.query(MenstrualEvent)
        .filter(
            MenstrualEvent.user_id == user_id,
            MenstrualEvent.event_type == "trigger_entry",
            MenstrualEvent.event_date >= from_date,
            MenstrualEvent.event_date <= to_date,
        )
        .all()
    )
    trigger_counts: Counter[str] = Counter()
    trigger_by_day: dict[date, list[str]] = defaultdict(list)
    for row in trigger_rows:
        if row.event_date is None:
            continue
        tags = (row.value_json or {}).get("tags")
        if not isinstance(tags, list):
            continue
        valid_tags = [str(tag) for tag in tags if isinstance(tag, str)]
        trigger_by_day[row.event_date].extend(valid_tags)
        if row.event_date in worsening_day_set:
            trigger_counts.update(valid_tags)

    top_triggers = [
        {"tag": tag, "count": count}
        for tag, count in trigger_counts.most_common(3)
    ]

    index_by_day = {
        row.day_date: (round(float(row.pmdd_symptom_index), 2) if row.pmdd_symptom_index is not None else None)
        for row in summaries
    }
    trigger_vs_index_timeline = [
        TriggerTimelineItem(
            date=day,
            pmdd_symptom_index=index_by_day.get(day),
            trigger_tags=sorted(set(trigger_by_day.get(day, []))),
        )
        for day in _daterange(from_date, to_date)
    ]

    if len(recent_values) < 4:
        pattern = "Not enough PMDD-lite records for a 2-week pattern yet."
    else:
        split = len(recent_values) // 2
        first_half = recent_values[:split]
        second_half = recent_values[split:]
        avg_first = sum(first_half) / len(first_half)
        avg_second = sum(second_half) / len(second_half)
        delta = avg_second - avg_first
        if delta > 6:
            pattern = "Recent 2-week PMDD-lite pattern shows worsening in the latter half."
        elif delta < -6:
            pattern = "Recent 2-week PMDD-lite pattern shows easing in the latter half."
        else:
            pattern = "Recent 2-week PMDD-lite pattern appears relatively stable."

    return InsightsResponse(
        symptom_trends=symptom_trends,
        pmdd_index_timeline=pmdd_timeline,
        worsening_days=worsening_days,
        worsening_threshold_p75=round(threshold, 2) if threshold is not None else None,
        top_triggers_in_worsening_days=top_triggers,
        trigger_vs_index_timeline=trigger_vs_index_timeline,
        recent_two_week_pattern=pattern,
        medical_disclaimer=MEDICAL_DISCLAIMER,
    )


def _pdf_escape(text: str) -> str:
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return "".join(ch if 32 <= ord(ch) <= 126 else "?" for ch in safe)


def _build_simple_pdf(lines: list[str]) -> bytes:
    visible_lines = lines[:55]
    stream_lines = ["BT", "/F1 11 Tf", "50 790 Td"]
    for idx, line in enumerate(visible_lines):
        escaped = _pdf_escape(line[:140])
        if idx == 0:
            stream_lines.append(f"({escaped}) Tj")
        else:
            stream_lines.append(f"0 -14 Td ({escaped}) Tj")
    stream_lines.append("ET")
    content = "\n".join(stream_lines).encode("latin-1", errors="replace")

    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        f"5 0 obj << /Length {len(content)} >> stream\n".encode("ascii") + content + b"\nendstream endobj\n",
    ]

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(out.tell())
        out.write(obj)
    xref_pos = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    out.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.write(f"{off:010d} 00000 n \n".encode("ascii"))
    out.write(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "ascii"
        )
    )
    return out.getvalue()


def _events_for_range(db: Session, user_id: str, from_date: date, to_date: date) -> list[MenstrualEvent]:
    return (
        db.query(MenstrualEvent)
        .filter(
            MenstrualEvent.user_id == user_id,
            MenstrualEvent.event_date.isnot(None),
            MenstrualEvent.event_date >= from_date,
            MenstrualEvent.event_date <= to_date,
        )
        .order_by(MenstrualEvent.event_date.asc(), MenstrualEvent.created_at.asc())
        .all()
    )


def _build_csv_payload(events: list[MenstrualEvent]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "event_id",
            "date",
            "timestamp",
            "event_type",
            "is_sensitive",
            "flow_level",
            "cramp_level",
            "pmdd_symptom_index",
            "pms_severity_band",
            "symptom_severity_map",
            "tags",
            "med_name",
            "dose",
            "effect_rating",
            "note_or_text",
        ],
    )
    writer.writeheader()
    for row in events:
        value = row.value_json or {}
        writer.writerow(
            {
                "event_id": row.id,
                "date": row.event_date.isoformat() if row.event_date else "",
                "timestamp": row.event_ts.isoformat() if row.event_ts else "",
                "event_type": row.event_type,
                "is_sensitive": row.is_sensitive,
                "flow_level": value.get("flow_level", ""),
                "cramp_level": value.get("cramp_level", ""),
                "pmdd_symptom_index": value.get("pmdd_symptom_index", ""),
                "pms_severity_band": value.get("pms_severity_band", ""),
                "symptom_severity_map": json.dumps(value.get("symptom_severity_map", {}), ensure_ascii=False),
                "tags": ",".join(value.get("tags", [])) if isinstance(value.get("tags"), list) else "",
                "med_name": value.get("med_name", ""),
                "dose": value.get("dose", ""),
                "effect_rating": value.get("effect_rating", ""),
                "note_or_text": value.get("note", value.get("notes", value.get("text", ""))),
            }
        )
    return output.getvalue()


def _build_pdf_payload(
    db: Session,
    user_id: str,
    from_date: date,
    to_date: date,
    events: list[MenstrualEvent],
) -> bytes:
    prediction = get_prediction(db, user_id, reference_day=to_date)
    insights = get_insights(db, user_id, from_date, to_date)
    starts = _collect_period_starts(db, user_id, until=to_date)
    lengths = _derive_cycle_lengths(starts, limit=12)

    line_items = [
        "Menstrual & PMDD-lite Summary Report",
        f"Range: {from_date.isoformat()} to {to_date.isoformat()}",
        f"Generated at: {_utc_now().isoformat()}",
        "",
        "Prediction (range + confidence):",
        (
            f"- Next period window: "
            f"{prediction.next_period_window_start or 'N/A'} to {prediction.next_period_window_end or 'N/A'}"
        ),
        f"- Confidence: {prediction.confidence_score}%",
        f"- Why: {prediction.why_this}",
        f"- Data quality: {prediction.data_quality}",
        "",
        "Cycle length distribution:",
        f"- Recorded cycle intervals: {len(lengths)}",
        f"- Values(days): {', '.join(str(x) for x in lengths) if lengths else 'N/A'}",
        "",
        "Symptom trend highlights:",
    ]
    if insights.symptom_trends:
        for item in insights.symptom_trends[:8]:
            line_items.append(
                f"- {item.symptom}: avg {item.avg_severity:.2f} (n={item.sample_count})"
            )
    else:
        line_items.append("- No symptom trend data in this range.")

    pmdd_values = [
        float(item["pmdd_symptom_index"])
        for item in insights.pmdd_index_timeline
        if isinstance(item.get("pmdd_symptom_index"), (int, float))
    ]
    line_items.extend(
        [
            "",
            "PMDD-lite index trend:",
            (
                f"- Entries: {len(pmdd_values)}, min={min(pmdd_values):.1f}, "
                f"max={max(pmdd_values):.1f}, avg={(sum(pmdd_values) / len(pmdd_values)):.1f}"
                if pmdd_values
                else "- No PMDD-lite entries in this range."
            ),
            f"- Recent 2-week pattern: {insights.recent_two_week_pattern}",
            "",
            "Meds/treatment observation (non-causal):",
        ]
    )

    med_rows = [row for row in events if row.event_type == "med_entry"]
    if med_rows:
        for row in med_rows[:8]:
            val = row.value_json or {}
            med_name = str(val.get("med_name") or "unknown")
            effect = val.get("effect_rating")
            line_items.append(
                f"- {row.event_date}: {med_name}, perceived effect {effect if effect is not None else 'N/A'}/5"
            )
    else:
        line_items.append("- No meds/treatment logs in this range.")

    line_items.extend(
        [
            "",
            "Disclaimer:",
            f"- {MEDICAL_DISCLAIMER}",
            "- Use this report as a conversation aid with clinicians, not as diagnosis.",
        ]
    )
    return _build_simple_pdf(line_items)


def create_export_job(
    db: Session,
    user_id: str,
    payload: ExportJobRequest,
) -> ExportJobResponse:
    settings = _get_or_create_privacy_settings(db, user_id)
    if settings.on_device_only and not payload.allow_server_export:
        raise HTTPException(
            status_code=409,
            detail=(
                "On-device only mode is enabled. Server-side export is blocked unless "
                "allow_server_export=true is explicitly provided."
            ),
        )

    job = MenstrualExportJob(
        user_id=user_id,
        status="pending",
        from_date=payload.from_date,
        to_date=payload.to_date,
        formats_json=payload.formats,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        events = _events_for_range(db, user_id, payload.from_date, payload.to_date)
        if "csv" in payload.formats:
            job.csv_payload = _build_csv_payload(events)
        if "pdf" in payload.formats:
            pdf_bytes = _build_pdf_payload(db, user_id, payload.from_date, payload.to_date, events)
            job.pdf_payload_b64 = base64.b64encode(pdf_bytes).decode("ascii")
        job.status = "completed"
        job.completed_at = _utc_now()
        job.error_message = None
        db.add(job)
        db.commit()
        db.refresh(job)
    except Exception as exc:
        job.status = "failed"
        job.completed_at = _utc_now()
        job.error_message = str(exc)[:2000]
        db.add(job)
        db.commit()
        db.refresh(job)

    return ExportJobResponse(
        job_id=job.job_id,
        status=job.status,  # type: ignore[arg-type]
        created_at=job.created_at or _utc_now(),
        formats=payload.formats,
        medical_disclaimer=MEDICAL_DISCLAIMER,
    )


def get_export_job_status(db: Session, user_id: str, job_id: str) -> ExportJobStatusResponse:
    row = (
        db.query(MenstrualExportJob)
        .filter(MenstrualExportJob.user_id == user_id, MenstrualExportJob.job_id == job_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="export job not found")

    formats = row.formats_json if isinstance(row.formats_json, list) else []
    ready_files: list[str] = []
    if row.status == "completed":
        if "csv" in formats and row.csv_payload is not None:
            ready_files.append("csv")
        if "pdf" in formats and row.pdf_payload_b64 is not None:
            ready_files.append("pdf")

    return ExportJobStatusResponse(
        job_id=row.job_id,
        status=row.status,  # type: ignore[arg-type]
        formats=formats,
        ready_files=ready_files,
        error_message=row.error_message,
    )


def get_export_file(
    db: Session,
    user_id: str,
    job_id: str,
    fmt: str,
) -> tuple[bytes, str, str]:
    row = (
        db.query(MenstrualExportJob)
        .filter(MenstrualExportJob.user_id == user_id, MenstrualExportJob.job_id == job_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="export job not found")
    if row.status != "completed":
        raise HTTPException(status_code=409, detail="export job is not completed")

    fmt_norm = fmt.strip().lower()
    if fmt_norm == "csv":
        if row.csv_payload is None:
            raise HTTPException(status_code=404, detail="csv payload not found")
        name = f"menstrual-report-{row.from_date.isoformat()}-{row.to_date.isoformat()}.csv"
        return row.csv_payload.encode("utf-8"), "text/csv; charset=utf-8", name

    if fmt_norm == "pdf":
        if row.pdf_payload_b64 is None:
            raise HTTPException(status_code=404, detail="pdf payload not found")
        data = base64.b64decode(row.pdf_payload_b64.encode("ascii"))
        name = f"menstrual-report-{row.from_date.isoformat()}-{row.to_date.isoformat()}.pdf"
        return data, "application/pdf", name

    raise HTTPException(status_code=400, detail="format must be csv or pdf")


def get_privacy_settings(db: Session, user_id: str) -> PrivacySettingsResponse:
    row = _get_or_create_privacy_settings(db, user_id)
    return PrivacySettingsResponse(
        on_device_only=bool(row.on_device_only),
        fertility_window_mode=row.fertility_window_mode,  # type: ignore[arg-type]
        app_lock_enabled=bool(row.app_lock_enabled),
        app_lock_method=row.app_lock_method,  # type: ignore[arg-type]
        backup_mode=row.backup_mode,  # type: ignore[arg-type]
        app_lock_recommended=bool(row.on_device_only and not row.app_lock_enabled),
        privacy_notice=(
            "When on-device only is ON, server sync for menstrual events is disabled and "
            "sensitive logs must stay local unless explicit server export consent is given."
        ),
    )


def update_privacy_settings(
    db: Session,
    user_id: str,
    payload: PrivacySettingsUpdateRequest,
) -> PrivacySettingsResponse:
    row = _get_or_create_privacy_settings(db, user_id)
    if payload.on_device_only is not None:
        row.on_device_only = payload.on_device_only
    if payload.fertility_window_mode is not None:
        row.fertility_window_mode = payload.fertility_window_mode
    if payload.app_lock_enabled is not None:
        row.app_lock_enabled = payload.app_lock_enabled
    if payload.app_lock_method is not None:
        row.app_lock_method = payload.app_lock_method
    if payload.backup_mode is not None:
        row.backup_mode = payload.backup_mode

    row.updated_at = _utc_now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return get_privacy_settings(db, user_id)


