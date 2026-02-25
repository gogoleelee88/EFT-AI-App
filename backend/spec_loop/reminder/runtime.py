from __future__ import annotations

import asyncio
from typing import Optional

from config.settings import get_settings
from backend.database import SessionLocal
from backend.spec_loop.reminder.worker import process_due_reminders
from utils.logger import get_logger

logger = get_logger(__name__)
_ticker_task: Optional[asyncio.Task] = None


async def _run_loop() -> None:
    settings = get_settings()
    interval = max(5, int(settings.REMINDER_TICK_SECONDS))
    while True:
        try:
            db = SessionLocal()
            try:
                metrics = process_due_reminders(db, worker_id="in-process")
            finally:
                db.close()
            if metrics["claimed"] > 0:
                logger.info("reminder.tick metrics=%s", metrics)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("reminder.tick unexpected error")
        await asyncio.sleep(interval)


def reminder_ticker_running() -> bool:
    return _ticker_task is not None and not _ticker_task.done()


async def start_reminder_ticker_if_enabled() -> None:
    global _ticker_task
    settings = get_settings()
    if not settings.REMINDER_IN_PROCESS_ENABLED:
        return
    if reminder_ticker_running():
        return
    _ticker_task = asyncio.create_task(_run_loop(), name="reminder-ticker")
    logger.info("reminder ticker started")


async def stop_reminder_ticker() -> None:
    global _ticker_task
    if _ticker_task is None:
        return
    _ticker_task.cancel()
    try:
        await _ticker_task
    except asyncio.CancelledError:
        pass
    _ticker_task = None
    logger.info("reminder ticker stopped")


