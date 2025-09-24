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
