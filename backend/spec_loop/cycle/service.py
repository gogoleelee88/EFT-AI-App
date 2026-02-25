from __future__ import annotations

from datetime import date, timedelta
from math import exp
from statistics import mean, pstdev
from typing import Optional

from sqlalchemy.orm import Session

from backend.spec_loop.cycle.policy import CyclePolicy, get_cycle_policy
from backend.spec_loop.cycle.schemas import CycleStateResponse
from backend.spec_loop.models import CycleModelState


def _user_scoped_query(db: Session, user_id: str | None):
    q = db.query(CycleModelState)
    if user_id:
        return q.filter(CycleModelState.user_id == user_id)
    return q.filter(CycleModelState.user_id.is_(None))


def _collect_period_starts(db: Session, user_id: str | None) -> list[date]:
    rows = (
        _user_scoped_query(db, user_id)
        .filter(CycleModelState.last_period_start_date.isnot(None))
        .order_by(CycleModelState.last_period_start_date.asc())
        .all()
    )
    starts: list[date] = []
    for row in rows:
        if row.last_period_start_date and row.last_period_start_date not in starts:
            starts.append(row.last_period_start_date)
    return starts


def _derive_cycle_lengths(starts: list[date], policy: CyclePolicy) -> list[int]:
    lengths: list[int] = []
    for i in range(1, len(starts)):
        d = (starts[i] - starts[i - 1]).days
        if policy.min_cycle_len_days <= d <= policy.max_cycle_len_days:
            lengths.append(d)
    return lengths


def _gaussian(distance: float, sigma: float) -> float:
    if sigma <= 0:
        return 0.0
    return exp(-(distance**2) / (2 * sigma**2))


def _phase_probability(
    reference_date: date,
    last_start: date,
    cycle_len: int,
    policy: CyclePolicy,
) -> dict[str, float]:
    day_offset = max(0, (reference_date - last_start).days)
    day_in_cycle = day_offset % max(1, cycle_len)
    ovulation_day = max(8, cycle_len - policy.luteal_len_days)
    centers = {
        "MENSTRUATION": 2.0,
        "FOLLICULAR": max(4.0, (ovulation_day - 3.0) / 2.0),
        "OVULATION": float(ovulation_day),
        "LUTEAL": min(float(cycle_len - 1), ovulation_day + max(3.0, policy.luteal_len_days / 2.0)),
    }
    sigmas = {
        "MENSTRUATION": policy.sigma_menstruation_days,
        "FOLLICULAR": policy.sigma_follicular_days,
        "OVULATION": policy.sigma_ovulation_days,
        "LUTEAL": policy.sigma_luteal_days,
    }

    raw = {}
    for phase, center in centers.items():
        cyclic_distance = min(
            abs(day_in_cycle - center),
            abs(day_in_cycle - center + cycle_len),
            abs(day_in_cycle - center - cycle_len),
        )
        raw[phase] = _gaussian(cyclic_distance, sigmas[phase])

    total = sum(raw.values()) or 1.0
    return {k: round(v / total, 4) for k, v in raw.items()}


def _irregularity_level(std_days: Optional[float], avg_days: Optional[float], policy: CyclePolicy) -> str:
    if std_days is None or avg_days is None or avg_days <= 0:
        return "MED"
    cv = std_days / avg_days
    if std_days <= policy.low_std_threshold_days and cv <= policy.low_cv_threshold:
        return "LOW"
    if std_days >= policy.high_std_threshold_days or cv >= policy.high_cv_threshold:
        return "HIGH"
    return "MED"


def _state_confidence(lengths: list[int], irregularity_level: str, policy: CyclePolicy) -> str:
    if len(lengths) >= policy.high_confidence_min_cycles and irregularity_level == "LOW":
        return "high"
    if len(lengths) >= policy.med_confidence_min_cycles:
        return "med"
    return "low"


def _next_period_window(
    last_start: date | None,
    avg_cycle_len_days: int | None,
    irregularity_level: str,
    policy: CyclePolicy,
):
    if last_start is None:
        return None
    cycle_len = avg_cycle_len_days or policy.default_cycle_len_days
    center = last_start + timedelta(days=cycle_len)
    margin = {
        "LOW": policy.window_margin_low_days,
        "MED": policy.window_margin_med_days,
        "HIGH": policy.window_margin_high_days,
    }.get(irregularity_level, policy.window_margin_med_days)
    return {
        "start": (center - timedelta(days=margin)).isoformat(),
        "end": (center + timedelta(days=margin)).isoformat(),
    }


def _build_evidence_snapshot(
    starts: list[date],
    lengths: list[int],
    avg_cycle_len_days: int | None,
    cycle_len_std_days: int | None,
    irregularity_level: str,
    confidence: str,
) -> list[str]:
    recent_window_days = 30 if len(starts) >= 2 else 7
    line1 = f"최근 {recent_window_days}일 동안 수집된 월경 시작 데이터는 총 {len(starts)}건입니다."
    if lengths and avg_cycle_len_days is not None:
        std_line = cycle_len_std_days if cycle_len_std_days is not None else "n/a"
        line2 = (
            f"주기 길이 평균은 {avg_cycle_len_days}일, 표준편차는 {std_line}입니다. "
            f"(irregularity {irregularity_level})"
        )
    else:
        line2 = "현재는 주기 길이 계산에 충분한 데이터가 없어 추정이 제한적입니다."
    if irregularity_level == "HIGH" or confidence == "low":
        line2 = f"{line2} 변동이 크므로 경고 윈도우와 함께 제시합니다."
    return [line1, line2]
def _to_response(row: CycleModelState) -> CycleStateResponse:
    return CycleStateResponse(
        date=row.date,
        last_period_start_date=row.last_period_start_date,
        avg_cycle_len_days=row.avg_cycle_len_days,
        cycle_len_std_days=row.cycle_len_std_days,
        irregularity_level=row.irregularity_level or "MED",
        phase_prob=row.phase_prob or {},
        next_period_window=row.next_period_window,
        confidence=row.confidence or "low",
        evidence_snapshot=list(row.evidence_snapshot or []),
    )


def upsert_cycle_state(
    db: Session,
    reference_date: date,
    user_id: str | None,
    last_period_start_date: date | None = None,
) -> CycleModelState:
    policy = get_cycle_policy()
    starts = _collect_period_starts(db, user_id)
    if last_period_start_date is not None and last_period_start_date not in starts:
        starts.append(last_period_start_date)
        starts.sort()

    if last_period_start_date is None:
        last_period_start_date = starts[-1] if starts else None

    lengths = _derive_cycle_lengths(starts, policy)
    avg_cycle_len_days = int(round(mean(lengths))) if lengths else None
    std_float = float(pstdev(lengths)) if len(lengths) >= 2 else (0.0 if lengths else None)
    cycle_len_std_days = int(round(std_float)) if std_float is not None else None
    irregularity_level = _irregularity_level(std_float, float(avg_cycle_len_days) if avg_cycle_len_days else None, policy)
    cycle_len_for_phase = avg_cycle_len_days or policy.default_cycle_len_days
    phase_prob = (
        _phase_probability(reference_date, last_period_start_date, cycle_len_for_phase, policy)
        if last_period_start_date
        else {}
    )
    confidence = _state_confidence(lengths, irregularity_level, policy)
    evidence_snapshot = _build_evidence_snapshot(
        starts,
        lengths,
        avg_cycle_len_days,
        cycle_len_std_days,
        irregularity_level,
        confidence,
    )
    next_period_window = _next_period_window(last_period_start_date, avg_cycle_len_days, irregularity_level, policy)

    q = _user_scoped_query(db, user_id).filter(CycleModelState.date == reference_date)
    row = q.first()
    if row is None:
        row = CycleModelState(user_id=user_id, date=reference_date)
        db.add(row)

    row.last_period_start_date = last_period_start_date
    row.avg_cycle_len_days = avg_cycle_len_days
    row.cycle_len_std_days = cycle_len_std_days
    row.irregularity_level = irregularity_level
    row.phase_prob = phase_prob
    row.next_period_window = next_period_window
    row.confidence = confidence
    row.evidence_snapshot = evidence_snapshot
    db.commit()
    db.refresh(row)
    return row


def get_cycle_state(db: Session, reference_date: date, user_id: str | None) -> CycleStateResponse:
    existing = _user_scoped_query(db, user_id).filter(CycleModelState.date == reference_date).first()
    if existing is not None:
        return _to_response(existing)

    row = upsert_cycle_state(db, reference_date=reference_date, user_id=user_id, last_period_start_date=None)
    return _to_response(row)


