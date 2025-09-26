from fastapi import APIRouter
from datetime import datetime

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
        "versioned": ["/health", "/api/health", "/v1/health"]
    }

# ---- extra health endpoints ----
import os, socket, time   # psutil은 함수 내부 try에서만 import 시도
from datetime import datetime

STARTED_AT = datetime.utcnow()

def _can_connect(host: str, port: int, timeout: float = 0.8) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False

@router.get("/health/engines")
def health_engines():
    # 기본 vLLM 프록시 포트
    a = {"name": "engineA", "host": "127.0.0.1", "port": 8001}
    b = {"name": "engineB", "host": "127.0.0.1", "port": 8002}
    for e in (a, b):
        e["ok"] = _can_connect(e["host"], e["port"])
    return {"ok": all(e["ok"] for e in (a,b)), "engines": [a, b]}

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
