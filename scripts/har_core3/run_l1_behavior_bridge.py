from __future__ import annotations

import argparse
import ast
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib import parse as urlparse
from urllib import request as urlrequest

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
    payload = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON file must contain an object: {p}")
    return payload


def _load_json_text(text: str | None) -> dict[str, Any]:
    if not text:
        return {}
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = ast.literal_eval(text)
    if not isinstance(payload, dict):
        raise ValueError("Inline JSON must decode to an object/dict.")
    return payload


def _parse_iso_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _join_url(base: str, path: str) -> str:
    return base.rstrip("/") + "/" + path.lstrip("/")


def _parse_response_body(text: str) -> Any:
    txt = text.strip()
    if not txt:
        return None
    try:
        return json.loads(txt)
    except Exception:
        return {"raw_text": txt}


def _post_json(
    *,
    url: str,
    payload: dict[str, Any],
    timeout_sec: float,
    access_token: str | None = None,
) -> tuple[int, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if access_token:
        headers["Cookie"] = f"access_token={access_token}"

    req = urlrequest.Request(url=url, data=body, headers=headers, method="POST")
    try:
        with urlrequest.urlopen(req, timeout=timeout_sec) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return int(resp.status), _parse_response_body(text)
    except urlerror.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        return int(exc.code), _parse_response_body(text)
    except urlerror.URLError as exc:
        raise RuntimeError(f"HTTP connection failed: {url} ({exc.reason})") from exc


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Bridge: L1 inference -> Behavior API candidates/questions")
    p.add_argument("--input-file", default=None, help="Optional JSON input file.")
    p.add_argument("--l0-probs-json", default=None, help="Inline JSON object for L0 probabilities.")
    p.add_argument("--l0-top1", default=None)
    p.add_argument("--l0-confidence", type=float, default=None)
    p.add_argument("--context-json", default=None, help="Inline JSON object for context hints.")
    p.add_argument("--topk", type=int, default=5)
    p.add_argument("--min-confidence", type=float, default=0.62)
    p.add_argument("--min-margin", type=float, default=0.12)
    p.add_argument("--user-id", default=None)
    p.add_argument("--day-id", type=int, default=None)
    p.add_argument("--ts-start", default=None, help="ISO8601 UTC")
    p.add_argument("--ts-end", default=None, help="ISO8601 UTC")

    p.add_argument("--api-base", default="http://127.0.0.1:8000")
    p.add_argument("--plan-path", default="/api/spec/plan/day")
    p.add_argument("--candidates-path", default="/api/spec/behavior/candidates")
    p.add_argument("--questions-path", default="/api/spec/behavior/questions")
    p.add_argument("--timeout-sec", type=float, default=20.0)
    p.add_argument("--access-token", default=None, help="Optional access_token cookie value.")
    p.add_argument(
        "--auto-day-plan",
        dest="auto_day_plan",
        action="store_true",
        default=True,
        help="Auto-create/upsert day plan when --day-id is missing and --user-id is provided (default: on).",
    )
    p.add_argument(
        "--no-auto-day-plan",
        dest="auto_day_plan",
        action="store_false",
        help="Disable auto day plan upsert.",
    )
    p.add_argument("--plan-date", default=None, help="Plan date (YYYY-MM-DD). Default: ts_start date (UTC).")
    p.add_argument("--plan-mode", type=int, default=70, help="Mode used for auto plan upsert (default: 70).")

    p.add_argument("--server-auto-ask", action="store_true", help="Use behavior API auto_ask=true.")
    p.add_argument("--skip-question-post", action="store_true", help="Do not post /questions even if gate opens.")
    p.add_argument("--question-expires-minutes", type=int, default=None)
    p.add_argument("--question-cooldown-minutes", type=int, default=None)
    p.add_argument("--max-daily-questions", type=int, default=8)

    p.add_argument("--dry-run", action="store_true", help="Only compute payloads, do not call API.")
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

    user_id = args.user_id or base.get("user_id")
    day_id = args.day_id if args.day_id is not None else base.get("day_id")

    plan_response: dict[str, Any] | None = None
    if day_id is None and bool(args.auto_day_plan) and user_id:
        if args.plan_date:
            plan_date = str(args.plan_date)
        else:
            plan_date = ts_start.date().isoformat()
        plan_payload = {
            "user_id": str(user_id),
            "date": plan_date,
            "mode": int(args.plan_mode),
            "items": [],
        }
        plan_url = _join_url(args.api_base, args.plan_path)
        try:
            p_status, p_body = _post_json(
                url=plan_url,
                payload=plan_payload,
                timeout_sec=float(args.timeout_sec),
                access_token=args.access_token,
            )
            p_error: str | None = None
        except RuntimeError as exc:
            p_error = str(exc)
            p_status = 0
            p_body = {"error": p_error}
        if p_status >= 200 and p_status < 300 and isinstance(p_body, dict) and p_body.get("day_id") is not None:
            day_id = int(p_body["day_id"])
        plan_response = {"status_code": p_status, "body": p_body, "request": plan_payload}
    candidate_payload = to_behavior_candidate_payload(
        inference=inference,
        ts_start=ts_start,
        ts_end=ts_end,
        user_id=user_id,
        day_id=day_id,
        screen_state=context.get("screen_state"),
        orientation=context.get("orientation"),
        pickup_flag=context.get("pickup_flag"),
    )

    result: dict[str, Any] = {
        "inference": inference,
        "plan_response": plan_response,
        "candidate_request": candidate_payload,
        "question_request": None,
        "candidate_response": None,
        "question_response": None,
    }

    if args.dry_run:
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.out_file:
            Path(args.out_file).write_text(text + "\n", encoding="utf-8")
        print(text)
        return result

    candidate_url = _join_url(args.api_base, args.candidates_path)
    q_params: dict[str, str] = {"auto_ask": "true" if args.server_auto_ask else "false"}
    if user_id:
        q_params["user_id"] = str(user_id)
    candidate_url = candidate_url + "?" + urlparse.urlencode(q_params)

    try:
        status, payload = _post_json(
            url=candidate_url,
            payload=candidate_payload,
            timeout_sec=float(args.timeout_sec),
            access_token=args.access_token,
        )
    except RuntimeError as exc:
        result["candidate_response"] = {"status_code": 0, "body": {"error": str(exc)}}
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.out_file:
            Path(args.out_file).write_text(text + "\n", encoding="utf-8")
        print(text)
        return result
    result["candidate_response"] = {"status_code": status, "body": payload}
    if status < 200 or status >= 300:
        result["error"] = f"candidate_post_failed:{status}"
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.out_file:
            Path(args.out_file).write_text(text + "\n", encoding="utf-8")
        print(text)
        return result

    if isinstance(payload, dict):
        candidate_id = payload.get("candidate_id")
    else:
        candidate_id = None

    should_post_question = (
        (not args.skip_question_post)
        and (not args.server_auto_ask)
        and bool(inference.get("ask_question"))
        and (candidate_id is not None)
    )
    if should_post_question:
        question_payload = to_behavior_question_payload(
            candidate_id=int(candidate_id),
            inference=inference,
            user_id=user_id,
        )
        if question_payload:
            if args.question_expires_minutes is not None:
                question_payload["expires_minutes"] = int(args.question_expires_minutes)
            if args.question_cooldown_minutes is not None:
                question_payload["cooldown_minutes"] = int(args.question_cooldown_minutes)
            if args.max_daily_questions is not None:
                question_payload["max_daily_questions"] = int(args.max_daily_questions)

            result["question_request"] = question_payload

            question_url = _join_url(args.api_base, args.questions_path)
            qq: dict[str, str] = {}
            if user_id:
                qq["user_id"] = str(user_id)
            if qq:
                question_url = question_url + "?" + urlparse.urlencode(qq)

            try:
                q_status, q_payload = _post_json(
                    url=question_url,
                    payload=question_payload,
                    timeout_sec=float(args.timeout_sec),
                    access_token=args.access_token,
                )
            except RuntimeError as exc:
                result["question_response"] = {"status_code": 0, "body": {"error": str(exc)}}
                text = json.dumps(result, ensure_ascii=False, indent=2)
                if args.out_file:
                    Path(args.out_file).write_text(text + "\n", encoding="utf-8")
                print(text)
                return result
            result["question_response"] = {"status_code": q_status, "body": q_payload}
            if q_status < 200 or q_status >= 300:
                result["error"] = f"question_post_failed:{q_status}"
                text = json.dumps(result, ensure_ascii=False, indent=2)
                if args.out_file:
                    Path(args.out_file).write_text(text + "\n", encoding="utf-8")
                print(text)
                return result

    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out_file:
        Path(args.out_file).write_text(text + "\n", encoding="utf-8")
    print(text)
    return result


if __name__ == "__main__":
    run(parse_args())
