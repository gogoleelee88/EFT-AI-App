import os
import socket
from datetime import datetime

from fastapi import APIRouter

APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
STARTED_AT = datetime.utcnow()

router = APIRouter(tags=["health"])


@router.get("/health")
@router.head("/health")
@router.get("/api/health")
@router.head("/api/health")
@router.get("/v1/health")
@router.head("/v1/health")
def health():
    return {
        "ok": True,
        "ts": datetime.utcnow().isoformat() + "Z",
        "service": "eft-ai",
        "versioned": ["/health", "/api/health", "/v1/health"],
    }


@router.get("/healthz")
def healthz():
    return {"status": "ok"}


@router.get("/version")
@router.get("/api/version")
@router.get("/v1/version")
def version():
    return {
        "ok": True,
        "service": "eft-ai",
        "version": APP_VERSION,
        "ts": datetime.utcnow().isoformat() + "Z",
    }


# ---- extra health endpoints ----
def _can_connect(host: str, port: int, timeout: float = 0.8) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


@router.get("/health/engines")
def health_engines():
    # vLLM smoke
    a = {"name": "engineA", "host": "127.0.0.1", "port": 8001}
    b = {"name": "engineB", "host": "127.0.0.1", "port": 8002}
    for e in (a, b):
        e["ok"] = _can_connect(e["host"], e["port"])
    return {"ok": all(e["ok"] for e in (a, b)), "engines": [a, b]}


@router.get("/health/upstreams")
def health_upstreams():
    return health_engines()


@router.get("/api/stats")
def api_stats():
    pid = os.getpid()
    try:
        import psutil  # optional

        p = psutil.Process(pid)
        mem = p.memory_info().rss
        cpu = p.cpu_percent(interval=0.05)
    except Exception:
        mem = None
        cpu = None
    now = datetime.utcnow()
    return {
        "service": "eft-ai",
        "pid": pid,
        "uptime_sec": (now - STARTED_AT).total_seconds(),
        "started_at": STARTED_AT.isoformat() + "Z",
        "now": now.isoformat() + "Z",
        "resources": {"rss_bytes": mem, "cpu_percent_sample": cpu},
    }
