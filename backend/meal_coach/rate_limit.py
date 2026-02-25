from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock

from fastapi import HTTPException

_LOCK = Lock()
_BUCKETS: dict[str, deque[datetime]] = defaultdict(deque)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def enforce_rate_limit(key: str, limit_per_minute: int) -> None:
    now = _utcnow()
    window_start = now - timedelta(minutes=1)
    with _LOCK:
        bucket = _BUCKETS[key]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= limit_per_minute:
            raise HTTPException(status_code=429, detail="RATE_LIMIT_EXCEEDED")
        bucket.append(now)

