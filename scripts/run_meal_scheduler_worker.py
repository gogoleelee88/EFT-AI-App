from __future__ import annotations

import argparse
import time

from backend.database import SessionLocal
from backend.meal_coach.service import process_due_scheduler_jobs_global


def run_once(limit: int, quiet_policy: str, channel: str) -> None:
    db = SessionLocal()
    try:
        result = process_due_scheduler_jobs_global(
            db,
            limit=limit,
            quiet_policy=quiet_policy,
            channel=channel,
        )
        print(f"run_once result={result}")
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Meal scheduler due-job worker")
    parser.add_argument("--interval-sec", type=int, default=60)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--quiet-policy", choices=["skip", "next_window"], default="next_window")
    parser.add_argument("--channel", choices=["push", "webpush", "email", "apns"], default="push")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    if args.once:
        run_once(args.limit, args.quiet_policy, args.channel)
        return 0

    print(
        f"meal scheduler worker started interval={args.interval_sec}s limit={args.limit} "
        f"quiet_policy={args.quiet_policy} channel={args.channel}"
    )
    while True:
        run_once(args.limit, args.quiet_policy, args.channel)
        time.sleep(max(5, args.interval_sec))


if __name__ == "__main__":
    raise SystemExit(main())

