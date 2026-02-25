from __future__ import annotations

from backend.database import SessionLocal
from backend.spec_loop.reminder.worker import process_due_reminders


def main() -> None:
    db = SessionLocal()
    try:
        metrics = process_due_reminders(db, worker_id="script-tick")
    finally:
        db.close()
    print(metrics)


if __name__ == "__main__":
    main()


