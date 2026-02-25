from __future__ import annotations

import argparse
import ast
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from scripts.har_core3.l1_flow import (
    default_window_bounds,
    infer_l1_event,
    to_behavior_candidate_payload,
    to_behavior_question_payload,
)


def _load_json_file(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"JSON file not found: {p}")
    return json.loads(p.read_text(encoding="utf-8"))


def _load_json_text(text: str | None) -> dict[str, Any]:
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # PowerShell often passes single-quoted dict-like text.
        parsed = ast.literal_eval(text)
    if not isinstance(parsed, dict):
        raise ValueError("JSON input must decode to an object/dict.")
    return parsed


def _parse_iso_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="L1 schedule inference flow from L0 HAR prediction.")
    p.add_argument("--input-file", default=None, help="Optional JSON input file.")
    p.add_argument("--l0-probs-json", default=None, help='Inline JSON, e.g. {"walk":0.7,"stand":0.3}')
    p.add_argument("--l0-top1", default=None)
    p.add_argument("--l0-confidence", type=float, default=None)
    p.add_argument("--context-json", default=None, help='Inline context JSON, e.g. {"hour":9,"calendar_hint":"meeting"}')
    p.add_argument("--topk", type=int, default=5)
    p.add_argument("--min-confidence", type=float, default=0.62)
    p.add_argument("--min-margin", type=float, default=0.12)
    p.add_argument("--user-id", default=None)
    p.add_argument("--day-id", type=int, default=None)
    p.add_argument("--candidate-id", type=int, default=None, help="Optional candidate id for question payload draft.")
    p.add_argument("--ts-start", default=None, help="ISO8601 UTC")
    p.add_argument("--ts-end", default=None, help="ISO8601 UTC")
    p.add_argument("--out-file", default=None, help="Optional output file path.")
    return p.parse_args()


def run(args: argparse.Namespace) -> dict[str, Any]:
    base = _load_json_file(args.input_file)
    inline_l0_probs = _load_json_text(args.l0_probs_json)
    inline_context = _load_json_text(args.context_json)

    l0_probs = inline_l0_probs or base.get("l0_probs")
    l0_top1 = args.l0_top1 if args.l0_top1 is not None else base.get("l0_top1")
    l0_conf = args.l0_confidence if args.l0_confidence is not None else base.get("l0_confidence")
    context = dict(base.get("context") or {})
    context.update(inline_context)

    inference = infer_l1_event(
        l0_probs=l0_probs,
        l0_top1=l0_top1,
        l0_confidence=l0_conf,
        context=context,
        topk_size=max(1, int(args.topk)),
        confidence_threshold=float(args.min_confidence),
        margin_threshold=float(args.min_margin),
    )

    ts_start = _parse_iso_utc(args.ts_start) or _parse_iso_utc(base.get("ts_start"))
    ts_end = _parse_iso_utc(args.ts_end) or _parse_iso_utc(base.get("ts_end"))
    if ts_start is None or ts_end is None:
        ts_start, ts_end = default_window_bounds()

    behavior_payload = to_behavior_candidate_payload(
        inference=inference,
        ts_start=ts_start,
        ts_end=ts_end,
        user_id=args.user_id or base.get("user_id"),
        day_id=args.day_id if args.day_id is not None else base.get("day_id"),
        screen_state=context.get("screen_state"),
        orientation=context.get("orientation"),
        pickup_flag=context.get("pickup_flag"),
    )

    result = {
        "inference": inference,
        "behavior_candidate_payload": behavior_payload,
    }
    if args.candidate_id is not None:
        result["behavior_question_payload"] = to_behavior_question_payload(
            candidate_id=int(args.candidate_id),
            inference=inference,
            user_id=args.user_id or base.get("user_id"),
        )

    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out_file:
        Path(args.out_file).write_text(text + "\n", encoding="utf-8")
    print(text)
    return result


if __name__ == "__main__":
    run(parse_args())
