"""
Guidance Feedback Loop - ?¨ê³¼??ì¶ì (Time-Sync Mechanism).
suds_logger ?¨í´: JSONL append only. Lite: ë¡ê·¸ë§? Pro: ì¶í ê°ì¤ì¹ ë°ì.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

if TYPE_CHECKING:
    from backend.types.guidance_schema import GuidanceFeedbackRequest

_ROOT = Path(__file__).resolve().parents[1]
_DATA_DIR = _ROOT / "data"
FEEDBACK_FILE = _DATA_DIR / "guidance_feedback.jsonl"


def _ensure_dir() -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


def append_feedback(req: "GuidanceFeedbackRequest") -> tuple[str, str]:
    """
    Feedback 1ê±´ì JSONL??append.
    Returns: (trace_id, saved_at ISO8601)
    """
    _ensure_dir()
    trace_id = uuid4().hex
    saved_at = datetime.now(timezone.utc).isoformat()

    best_detail = None
    if req.best_moments_detail:
        best_detail = [d.model_dump() for d in req.best_moments_detail]
    worst_detail = None
    if req.worst_moments_detail:
        worst_detail = [d.model_dump() for d in req.worst_moments_detail]
    coaching_events = None
    if getattr(req, "coaching_events", None):
        coaching_events = [e.model_dump() for e in req.coaching_events]

    entry = {
        "trace_id": trace_id,
        "guidance_id": req.guidance_id,
        "best_moments": req.best_moments,
        "best_moments_detail": best_detail,
        "worst_moments": req.worst_moments or [],
        "worst_moments_detail": worst_detail,
        "user_rating": req.user_rating,
        "session_id": req.session_id,
        "user_id": req.user_id,
        "scenario_id": req.scenario_id,
        "theme_id": req.theme_id,
        "selected_video_id": getattr(req, "selected_video_id", None),
        "coaching_events": coaching_events or [],
        "saved_at": saved_at,
        "timestamp": saved_at,
    }

    with FEEDBACK_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    return trace_id, saved_at

