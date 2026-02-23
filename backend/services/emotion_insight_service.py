from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from utils.logger import get_logger
from services.chatgpt_service import get_openai_client


logger = get_logger(__name__)


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_iso_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _normalize_record(row: Dict[str, Any]) -> Dict[str, Any]:
    return row if isinstance(row, dict) else {}


def _collect_intensity(rows: List[Dict[str, Any]]) -> List[int]:
    values: List[int] = []
    for row in rows:
        intensity = _to_int(row.get("intensity_before"), 0)
        if intensity == 0 and row.get("intensity") is not None:
            intensity = _to_int(row.get("intensity"), 0)
        intensity = max(0, min(10, intensity))
        values.append(intensity)
    return values


def _collect_emotion_distribution(rows: List[Dict[str, Any]]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for row in rows:
        emotion = str(row.get("core_emotion") or row.get("emotion") or "").strip().lower()
        if not emotion:
            continue
        counter[emotion] += 1
    return counter


def _split_by_half(values: List[int]) -> Tuple[float, float]:
    if not values:
        return 0.0, 0.0
    if len(values) == 1:
        value = float(values[0])
        return value, value

    half = max(1, len(values) // 2)
    old_half = values[half:]
    new_half = values[:half]
    old_avg = sum(old_half) / len(old_half)
    new_avg = sum(new_half) / len(new_half)
    return old_avg, new_avg


def _trend_label(old_avg: float, new_avg: float) -> str:
    delta = new_avg - old_avg
    if delta >= 1.5:
        return "improving"
    if delta <= -1.5:
        return "worsening"
    return "stable"


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value)
        except (TypeError, ValueError, OSError):
            return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _safe_text(value: Any, *, max_len: int | None = None) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if max_len is not None and len(text) > max_len:
        text = text[:max_len]
    return text


def _safe_str(value: Any) -> str:
    value_text = _safe_text(value)
    return value_text.lower().strip() if value_text else ""


def _weekday_label(dt: datetime) -> str:
    return ["월", "화", "수", "목", "금", "토", "일"][dt.weekday()]


def _hour_bucket(dt: datetime) -> str:
    return f"{dt.hour:02d}:00-{(dt.hour + 1) % 24:02d}:00"


def _method_label(method: str) -> str:
    m = method.strip().lower()
    if not m:
        return "기타"
    if m in {"eft", "eftar"}:
        return "EFT"
    if m in {"meditation", "breath", "breathing", "video", "youtube"}:
        return "명상/호흡"
    if "water" in m:
        return "물"
    return m


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _percent(part: int, total: int) -> float:
    return (part / total * 100.0) if total > 0 else 0.0


def _weekday_label_en(dt: datetime) -> str:
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dt.weekday()]


def _method_label_en(method: str) -> str:
    m = (method or "").strip().lower()
    if not m:
        return "Other"
    if m in {"eft", "eftar"}:
        return "EFT"
    if m in {"meditation", "breath", "breathing", "video", "youtube"}:
        return "Meditation"
    if "water" in m:
        return "Water"
    return m


async def _weekly_report_llm_summary(metrics: Dict[str, Any]) -> Dict[str, Any]:
    client = get_openai_client()
    if client is None:
        return {}

    model = (
        (os.getenv("OPENAI_REASONING_MODEL") or "").strip()
        or (os.getenv("OPENAI_MODEL") or "").strip()
        or "gpt-5.2"
    )
    system_prompt = (
        "You are a concise emotional analytics assistant. "
        "Given weekly analytics metrics, output JSON only."
    )
    user_prompt = json.dumps(
        {
            "task": "Create 2-4 short Korean insight bullets and a 1-line recommendation set.",
            "metrics": metrics,
            "output_schema": {
                "summary_text": "string (2-4 Korean sentences)",
                "recommendations": "array of 2-4 strings",
                "template_title": "string",
            },
        },
        ensure_ascii=False,
    )

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=700,
        )
        raw = response.choices[0].message.content or "{}"
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            return {}
        return payload
    except Exception:
        logger.exception("failed to build weekly report llm summary")
        return {}


def _pair_interventions(checkins: List[Dict[str, Any]], suds_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    pairs: List[Dict[str, Any]] = []
    if not checkins:
        return pairs

    suds_by_session: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in suds_rows:
        sid = _safe_text(row.get("session_id"))
        if not sid:
            continue
        created = _parse_dt(row.get("created_at")) or _parse_dt(row.get("timestamp")) or _parse_dt(row.get("saved_at"))
        method = _safe_str(row.get("session_type") or row.get("type"))
        suds_by_session[sid].append({
            "session_id": sid,
            "created_at": created,
            "score": _to_int(row.get("score"), 0),
            "method": _method_label_en(method),
        })

    for sid, rows in suds_by_session.items():
        rows.sort(key=lambda item: item["created_at"] or datetime.min)

    for checkin in checkins:
        sid = _safe_text(checkin.get("session_id"))
        if not sid:
            continue
        candidates = suds_by_session.get(sid, [])
        if not candidates:
            continue
        base_intensity = _to_int(checkin.get("intensity_before"), 0)
        created = _parse_dt(checkin.get("created_at")) or _parse_dt(checkin.get("inserted_at"))

        if created is None:
            best = candidates[0]
        else:
            future = [item for item in candidates if item["created_at"] and item["created_at"] >= created]
            pool = future or candidates
            best = min(
                pool,
                key=lambda item: abs((item["created_at"] or datetime.min) - created).total_seconds(),
            )

        after = best["score"]
        drop = max(0, base_intensity - after)
        delay_min = None
        if created and best["created_at"]:
            delay_min = (best["created_at"] - created).total_seconds() / 60.0
            if delay_min < 0:
                delay_min = None

        pairs.append({
            "session_id": sid,
            "checkin_created_at": created,
            "suds_created_at": best["created_at"],
            "base_intensity": base_intensity,
            "after_intensity": after,
            "intensity_drop": drop,
            "method": best["method"],
            "resume_minutes": delay_min,
            "checkin": checkin,
        })
    return pairs


def _build_weekly_fields_from_metrics(
    checkin_count: int,
    distinct_suds: int,
    emotion_distribution: Dict[str, int],
    checkin_records: List[Dict[str, Any]],
    intervention_pairs: List[Dict[str, Any]],
    window_start: datetime,
    window_end: datetime,
) -> Tuple[Dict[str, Any], str, str]:
    if checkin_count == 0:
        return {}, "warming_up", "데이터가 충분하지 않습니다"

    total = checkin_count
    intensities = [_to_int(r.get("intensity_before"), 0) for r in checkin_records]
    average_intensity = _mean(intensities) if intensities else 0.0

    dominant_emotion, dominant_count = emotion_distribution.most_common(1)[0]
    dominant_ratio = _percent(dominant_count, total)

    by_block: Dict[str, int] = defaultdict(int)
    by_block_high: Dict[str, int] = defaultdict(int)
    by_block_count: Dict[str, int] = defaultdict(int)
    for checkin in checkin_records:
        created = _parse_dt(checkin.get("created_at")) or _parse_dt(checkin.get("inserted_at"))
        if not created:
            continue
        block = f"{_weekday_label_en(created)} {_hour_bucket(created)}"
        by_block[block] += 1
        by_block_count[block] += 1
        if _to_int(checkin.get("intensity_before"), 0) >= 7:
            by_block_high[block] += 1

    if by_block_high:
        top_block, top_high_count = max(
            by_block_high.items(),
            key=lambda item: (item[1], by_block_count.get(item[0], 0)),
        )
    else:
        top_block, top_high_count = (max(by_block.items(), key=lambda item: item[1], default=(None, 0)))
    top_block = top_block or "-"

    hour_window_dist: Dict[str, List[int]] = defaultdict(list)
    for checkin in checkin_records:
        created = _parse_dt(checkin.get("created_at")) or _parse_dt(checkin.get("inserted_at"))
        if not created:
            continue
        hour_key = f"{created.hour:02d}:00-{((created.hour + 3) % 24):02d}:00(3h)"
        hour_window_dist[hour_key].append(_to_int(checkin.get("intensity_before"), 0))

    fatigue_block = "-"
    fatigue_intensity = 0.0
    if hour_window_dist:
        for hour_key, values in hour_window_dist.items():
            avg = _mean(values)
            if avg > fatigue_intensity:
                fatigue_intensity = avg
                fatigue_block = hour_key

    thought_counter = Counter()
    for checkin in checkin_records:
        thought = _safe_text(checkin.get("automatic_thought"), max_len=60)
        if thought:
            thought_counter[thought] += 1
    trigger_thought, trigger_count = thought_counter.most_common(1)[0] if thought_counter else ("-", 0)

    deferral_keywords = ("미루", "나중", "잠깐", "회피", "보류", "나중에")
    deferral_count = 0
    for checkin in checkin_records:
        goal = _safe_text(checkin.get("immediate_goal") or checkin.get("coping_attempt"), max_len=80) or ""
        if any(keyword in goal for keyword in deferral_keywords):
            deferral_count += 1
    deferral_ratio = _percent(deferral_count, total)

    method_summary: Dict[str, Dict[str, float]] = {}
    method_buckets: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for pair in intervention_pairs:
        method_buckets[pair["method"]].append(pair)

    for method, buckets in method_buckets.items():
        drops = [_to_float(item["intensity_drop"]) for item in buckets]
        success = [1 for item in buckets if item["intensity_drop"] > 0]
        fast = [1 for item in buckets if (item["resume_minutes"] is not None and item["resume_minutes"] <= 10)]
        delays = [_to_float(item["resume_minutes"]) for item in buckets if item["resume_minutes"] is not None]
        method_summary[method] = {
            "count": float(len(buckets)),
            "avg_drop": round(_mean(drops), 2),
            "success_rate": round(_percent(len(success), len(buckets)), 1),
            "fast_recovery_rate": round(_percent(len(fast), len(buckets)), 1),
            "avg_resume_minutes": round(_mean(delays), 1),
        }

    all_pair_count = len(intervention_pairs)
    coverage_ratio = _percent(all_pair_count, total)
    avg_delay = 0.0
    delay_values = [_to_float(pair["resume_minutes"]) for pair in intervention_pairs if pair["resume_minutes"] is not None]
    if delay_values:
        avg_delay = _mean(delay_values)

    recovery_rates = [
        payload["success_rate"] for payload in method_summary.values()
    ]
    best_method = "-"
    best_avg_drop = 0.0
    best_success_rate = 0.0
    for method, payload in method_summary.items():
        if payload["success_rate"] > best_success_rate or (
            payload["success_rate"] == best_success_rate
            and payload["avg_drop"] >= best_avg_drop
        ):
            best_method = method
            best_success_rate = payload["success_rate"]
            best_avg_drop = payload["avg_drop"]

    if method_summary:
        best_payload = method_summary.get(best_method, {})
    else:
        best_payload = {"avg_drop": 0.0, "success_rate": 0.0, "fast_recovery_rate": 0.0, "avg_resume_minutes": 0.0}

    positive_examples = []
    for pair in intervention_pairs:
        if pair["intensity_drop"] >= 2 and _safe_str(pair["checkin"].get("core_emotion")):
            positive_examples.append(pair)
    positive_pattern = "-"
    positive_rate = 0.0
    if positive_examples:
        positive_context_counter = Counter()
        for item in positive_examples:
            emotion = _safe_text(item["checkin"].get("core_emotion"), max_len=24) or "-"
            positive_context = _safe_text(item["checkin"].get("situation_context"), max_len=40) or "-"
            if emotion and positive_context:
                positive_context_counter[f"{emotion} / {positive_context}"] += 1
        if positive_context_counter:
            positive_pattern = positive_context_counter.most_common(1)[0][0]
            positive_rate = _percent(len(positive_examples), max(1, total))

    trend_old, trend_new = _split_by_half(intensities)
    trend = _trend_label(trend_old, trend_new)

    template_type = "weekly_pattern"
    template_title = "주간 감정 패턴 요약"
    if total < 5:
        template_type = "weekly_minimal"
        template_title = "주간 데이터 부족"
    elif all_pair_count < 1:
        template_type = "weekly_no_intervention"
        template_title = "개입 기록이 적은 주간"
    elif all_pair_count / max(1, total) >= 0.6 and recovery_rates:
        template_type = "weekly_intervention"
        template_title = "개입 효과 확인 주간"
    else:
        template_type = "weekly_pattern"
        template_title = "주간 감정 패턴 요약"

    fields = {
        "window_start": window_start.replace(microsecond=0).isoformat(),
        "window_end": window_end.replace(microsecond=0).isoformat(),
        "dominant_emotion": dominant_emotion,
        "dominant_emotion_ratio": round(dominant_ratio, 1),
        "average_intensity": round(average_intensity, 2),
        "trend": trend,
        "total_pairs": all_pair_count,
        "suds_coverage_ratio": round(coverage_ratio, 1),
        "hour_block_top_high_intensity": top_block,
        "top_block_high_count": top_high_count,
        "time_window_fatigue": fatigue_block,
        "time_window_fatigue_intensity": round(fatigue_intensity, 2),
        "trigger_thought": trigger_thought,
        "trigger_count": trigger_count,
        "trigger_recurrence_level": "high" if trigger_count >= 5 else ("medium" if trigger_count >= 3 else "low"),
        "deferral_ratio": round(deferral_ratio, 1),
        "best_intervention_method": best_method,
        "best_method_avg_drop": round(best_payload.get("avg_drop", 0.0), 2),
        "best_method_success_rate": round(best_payload.get("success_rate", 0.0), 1),
        "best_method_fast_recovery_rate": round(best_payload.get("fast_recovery_rate", 0.0), 1),
        "avg_delay_minutes": round(avg_delay, 1),
        "positive_pattern_anchor": positive_pattern,
        "positive_pattern_ratio": round(positive_rate, 1),
        "emotion_distribution": dict(emotion_distribution),
        "method_summary": method_summary,
        "trend_tags": [],
    }
    if all_pair_count and best_method != "-" and best_payload.get("avg_drop", 0.0) >= 0:
        fields["trend_tags"].append("intervention_data_enough")
    if trigger_count >= 3:
        fields["trend_tags"].append("repeat_trigger")
    if coverage_ratio >= 60:
        fields["trend_tags"].append("high_intervention_coverage")

    return fields, template_type, template_title


async def generate_emotion_insight_bundle(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    records = [_normalize_record(row) for row in (rows or [])]
    total = len(records)

    if total == 0:
        return {
            "total_records": 0,
            "dominant_emotions": [],
            "average_intensity": 0.0,
            "trend": "stable",
            "insight_summary": "기록이 충분하지 않아 기본 안내만 제공합니다.",
            "pattern_cards": [
                {
                    "title": "기록 준비",
                    "detail": "감정 기록이 부족해 정확한 패턴을 만들기 어렵습니다.",
                    "confidence": 1.0,
                }
            ],
            "recommended_actions": [
                "매일 한 번 이상 감정 강도와 이유를 기록해 주세요.",
                "감정 강도가 높을 때는 5~10분 호흡, 물 마시기, 스트레칭 같은 완화 루틴을 실행하세요.",
                "한 주에 적어도 한 번은 반복되는 패턴과 대응이 필요한 상황을 확인하세요.",
            ],
            "source": "fallback",
            "model": "rule_based",
            "generated_at": _to_iso_now(),
        }

    intensities = _collect_intensity(records)
    if not intensities:
        intensities = [0 for _ in range(total)]

    distribution = _collect_emotion_distribution(records)
    avg_intensity = sum(intensities) / len(intensities) if intensities else 0.0
    old_avg, new_avg = _split_by_half(intensities)
    trend = _trend_label(old_avg, new_avg)
    dominant_emotions = [name for name, _ in distribution.most_common(3)]
    top_emotion = distribution.most_common(1)[0][0] if distribution else "unknown"

    pattern_cards = [
        {
            "title": "주요 감정",
            "detail": f"{top_emotion}가 가장 많이 나타난 감정입니다. (총 {total}건)",
            "confidence": 0.95,
        },
        {
            "title": "강도 추이",
            "detail": f"초반 강도 {old_avg:.1f}, 최근 강도 {new_avg:.1f}로 최근 추세는 {trend}입니다.",
            "confidence": 0.8,
        },
        {
            "title": "권장 대응",
            "detail": (
                "강도가 높게 유지되는 구간이 있어 이완 루틴이 필요해 보입니다." if avg_intensity >= 6.5

                else "현재는 특별한 위험 신호가 적고 안정 구간이 더 강합니다.",
            ),
            "confidence": 0.7,
        },
    ]

    summary_parts = [
        f"총 {total}건의 기록으로 계산한 평균 감정 강도는 {avg_intensity:.1f}/10입니다.",
        f"현재 추세는 {trend}입니다.",
        f"지배 감정은 {dominant_emotions[0]}입니다."
    ]
    if distribution:
        summary_parts.append(f"지배 감정 비율은 약 {dominant_ratio:.1f}%입니다.")

    recommended = [
        "매일 1회 이상 감정 일지를 남기고 추세를 확인하세요.",
        "고강도 구간에서 3·5·10분 호흡 루틴을 실행해 즉시 안정을 먼저 확보하세요.",
        "반복되는 자극/상황을 기록하고 다음 주에는 대응 계획을 미리 준비하세요.",
    ]

    return {
        "total_records": total,
        "dominant_emotions": dominant_emotions,
        "average_intensity": round(avg_intensity, 2),
        "trend": trend,
        "insight_summary": " ".join(summary_parts),
        "pattern_cards": pattern_cards,
        "recommended_actions": recommended,
        "source": "fallback",
        "model": "rule_based",
        "generated_at": _to_iso_now(),
    }


async def generate_emotion_adaptive_report_bundle(
    checkin_rows: List[Dict[str, Any]],
    suds_rows: List[Dict[str, Any]],
    total_records: int | None = None,
) -> Dict[str, Any]:
    checkins = [_normalize_record(row) for row in (checkin_rows or [])]
    suds = [_normalize_record(row) for row in (suds_rows or [])]

    if total_records is None:
        total_records = len(checkins)

    if not checkins:
        now_iso = _to_iso_now()
        return {
            "template_type": "warming_up",
            "template_title": "적응형 분석 준비 중",
            "total_records": int(total_records or 0),
            "confidence": 0.0,
            "source": "fallback",
            "model": "rule_based",
            "generated_at": now_iso,
            "summary": "현재 감정 기록이 부족해 적응형 리포트를 만들 수 없습니다. 기록을 더 쌓아 주세요.",
            "fields": {
                "dominant_emotion": None,
                "dominant_emotion_ratio": 0.0,
                "average_intensity": 0.0,
                "trend": "stable",
                "total_checkins": 0,
                "suds_events": 0,
            },
        }

    intensities = _collect_intensity(checkins)
    if not intensities:
        intensities = [0 for _ in checkins]

    distribution = _collect_emotion_distribution(checkins)
    average_intensity = sum(intensities) / len(intensities) if intensities else 0.0
    old_avg, new_avg = _split_by_half(intensities)
    trend = _trend_label(old_avg, new_avg)

    top = distribution.most_common(1)
    dominant = top[0][0] if top else None
    dominant_count = top[0][1] if top else 0
    ratio = (dominant_count / len(checkins)) if checkins else 0.0

    unique_suds = len(suds)
    quality_score = min(1.0, max(0.0, (len(checkins) / max(1, total_records or len(checkins))) * 0.7 + min(1.0, unique_suds / 80.0) * 0.3))

    if average_intensity >= 7.5 and trend == "worsening":
        template_type = "high_support_needed"
        template_title = "강한 지원 필요"
        summary = (
            "현재 강도가 높고 완화 추세가 악화되어 추가 개입이 필요할 수 있습니다. "
            "가벼운 호흡, 수면, 수분 섭취 같은 3단계 안정 루틴을 먼저 권장합니다."
        )
        confidence = min(1.0, quality_score + 0.15)
    elif trend == "improving":
        template_type = "progress_path"
        template_title = "회복 경로"
        summary = (
            "최근 데이터는 완만한 개선 신호를 보여 성장 경로를 확인할 수 있습니다. "
            "지속 가능한 루틴이 유지되는 한 회복 추세를 지켜보세요."
        )
        confidence = quality_score
    else:
        template_type = "maintenance"
        template_title = "안정 유지"
        summary = (
            "현재 추세는 급격한 악화 없이 안정적으로 유지됩니다. "
            "기록 주기를 늘리면 더 정확한 개선 포인트를 찾을 수 있습니다."
        )

    fields = {
        "dominant_emotion": dominant,
        "dominant_emotion_ratio": round(float(ratio), 3),
        "average_intensity": round(float(average_intensity), 2),
        "trend": trend,
        "emotion_distribution": dict(distribution),
        "suds_events": unique_suds,
        "total_checkins": len(checkins),
        "quality_score": round(float(quality_score), 3),
    }

    return {
        "template_type": template_type,
        "template_title": template_title,
        "total_records": int(total_records or len(checkins)),
        "confidence": round(float(confidence), 3),
        "source": "fallback",
        "model": "rule_based",
        "generated_at": _to_iso_now(),
        "summary": summary,
        "fields": fields,
    }


async def generate_emotion_weekly_report_bundle(
    checkin_rows: List[Dict[str, Any]],
    suds_rows: List[Dict[str, Any]],
    week_start: datetime,
    week_end: datetime,
) -> Dict[str, Any]:
    checkins = [_normalize_record(row) for row in (checkin_rows or [])]
    suds = [_normalize_record(row) for row in (suds_rows or [])]

    total_records = len(checkins)
    if total_records == 0:
        now_iso = _to_iso_now()
        return {
            "template_type": "weekly_warmup",
            "template_title": "주간 데이터 부족",
            "total_records": 0,
            "confidence": 0.0,
            "source": "fallback",
            "model": "rule_based",
            "generated_at": now_iso,
            "summary_text": "7일치 기록이 충분하지 않아 주간 요약을 제공할 수 없습니다.",
            "recommendations": ["매일 감정 기록을 남기고, 주 2회 이상 추세를 점검하세요."],
            "fields": {
                "window_start": week_start.replace(microsecond=0).isoformat(),
                "window_end": week_end.replace(microsecond=0).isoformat(),
                "total_records": 0,
                "suds_pairs": 0,
                "intervention_coverage": 0.0,
                "dominant_emotion": "",
                "dominant_emotion_ratio": 0.0,
            },
        }

    distribution = _collect_emotion_distribution(checkins)
    intensities = _collect_intensity(checkins)
    if not intensities:
        intensities = [0 for _ in checkins]
    average_intensity = sum(intensities) / len(intensities) if intensities else 0.0
    if average_intensity >= 7.5:
        strength = "high_intensity"
    elif average_intensity >= 5.5:
        strength = "moderate_intensity"
    else:
        strength = "low_intensity"

    intervention_pairs = _pair_interventions(checkins, suds)
    fields, template_type, template_title = _build_weekly_fields_from_metrics(
        total_records,
        len(intervention_pairs),
        distribution,
        checkins,
        intervention_pairs,
        week_start,
        week_end,
    )

    fallback_summary = (
        f"지난 7일({fields.get('window_start', '') }~{fields.get('window_end', '')} 동안 "
        f"총 {total_records}건을 바탕으로 평균 강도는 {average_intensity:.1f}/10, "
        f"주요 감정은 {fields.get('dominant_emotion', '-')}입니다. "
        f"현재 추세는 {fields.get('trend', 'stable')}으로 계산했습니다."
    )
    fallback_recommendations = [
        "감정 기록을 하루 단위로 남기고, 연속 고강도 패턴은 즉시 체크하세요.",
        "수면, 수분, 신체 활동을 함께 점검하는 루틴을 1일 3회 실행하세요.",
        "이번 주 SUDS 변화가 큰 구간을 다음 주 개입 계획에 반영하세요.",
    ]

    llm_payload = {
        "window": {
            "start": fields.get("window_start"),
            "end": fields.get("window_end"),
        },
        "stats": {
            "total_records": total_records,
            "average_intensity": average_intensity,
            "dominant_emotion": fields.get("dominant_emotion"),
            "dominant_ratio": fields.get("dominant_emotion_ratio"),
            "trend": fields.get("trend", ""),
            "intervention_pairs": len(intervention_pairs),
            "intervention_coverage": fields.get("suds_coverage_ratio"),
            "top_block": fields.get("hour_block_top_high_intensity"),
            "fatigue_block": fields.get("time_window_fatigue"),
        },
        "method_summary": fields.get("method_summary", {}),
        "thought_summary": {
            "trigger_thought": fields.get("trigger_thought"),
            "trigger_count": fields.get("trigger_count"),
        },
    }
    llm_result = await _weekly_report_llm_summary(llm_payload)
    summary_text = fallback_summary
    recommendations = fallback_recommendations
    if isinstance(llm_result, dict) and llm_result:
        candidate_summary = llm_result.get("summary_text")
        if isinstance(candidate_summary, str) and candidate_summary.strip():
            summary_text = candidate_summary.strip()
        candidate_recs = llm_result.get("recommendations")
        if isinstance(candidate_recs, list) and candidate_recs:
            recommendations = [str(item) for item in candidate_recs[:4] if str(item).strip()]
        title_override = llm_result.get("template_title")
        if isinstance(title_override, str) and title_override.strip():
            template_title = title_override.strip()

    if total_records > 0:
        confidence = min(
            1.0,
            0.25
            + 0.35 * min(1.0, total_records / 10.0)
            + 0.15 * min(1.0, len(intervention_pairs) / max(1, total_records))
            + 0.15 * (1.0 if strength == "high_intensity" else 0.7 if strength == "moderate_intensity" else 0.5)
            + 0.1 * (1.0 if fields.get("suds_coverage_ratio", 0) > 40 else 0.0),
        )
    else:
        confidence = 0.0

    source = "llm" if llm_result else "rule"
    model = (
        (os.getenv("OPENAI_REASONING_MODEL") or "").strip()
        or (os.getenv("OPENAI_MODEL") or "").strip()
        or "gpt-5.2"
    )

    return {
        "template_type": template_type,
        "template_title": template_title,
        "total_records": total_records,
        "confidence": round(confidence, 3),
        "source": "llm" if source == "llm" else "fallback",
        "model": model,
        "generated_at": _to_iso_now(),
        "summary_text": summary_text,
        "recommendations": recommendations,
        "fields": fields,
    }


