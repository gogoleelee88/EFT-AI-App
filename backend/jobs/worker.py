from __future__ import annotations

import queue
import threading
import uuid
from dataclasses import dataclass
from typing import Any, Callable

from utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class WorkerJob:
    queue_name: str
    payload: dict[str, Any]


class InProcessRQWorker:
    """
    RQ-like lightweight worker.

    If Celery/RQ infra is not configured for this project,
    this worker keeps the same enqueue/handler split in-process.
    """

    def __init__(self) -> None:
        self._queue: queue.Queue[WorkerJob] = queue.Queue()
        self._handlers: dict[str, Callable[[dict[str, Any]], None]] = {}
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

    def register_handler(self, queue_name: str, handler: Callable[[dict[str, Any]], None]) -> None:
        self._handlers[queue_name] = handler

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._thread = threading.Thread(target=self._run, daemon=True, name="proposal-os-worker")
            self._thread.start()
            logger.info("proposal_os_worker_started")

    def enqueue(self, queue_name: str, payload: dict[str, Any]) -> str:
        self.start()
        job_id = str(uuid.uuid4())
        body = dict(payload)
        body["job_id"] = job_id
        self._queue.put(WorkerJob(queue_name=queue_name, payload=body))
        return job_id

    def _run(self) -> None:
        while True:
            job = self._queue.get()
            handler = self._handlers.get(job.queue_name)
            if handler is None:
                logger.warning("proposal_os_worker_missing_handler queue=%s", job.queue_name)
                self._queue.task_done()
                continue
            try:
                handler(job.payload)
            except Exception:
                logger.exception("proposal_os_worker_job_failed queue=%s", job.queue_name)
            finally:
                self._queue.task_done()


worker = InProcessRQWorker()


