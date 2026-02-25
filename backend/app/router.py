from __future__ import annotations

from typing import Optional


VALID_MODES = {"omni", "eft", "calendar", "doc_rag", "db_rag"}

CALENDAR_HINTS = (
    "calendar",
    "일정",
    "스케줄",
    "미팅",
    "약속",
    "event",
)
EFT_HINTS = (
    "eft",
    "태핑",
    "tapping",
    "불안",
    "감정",
    "호흡",
)
DOC_RAG_HINTS = (
    "문서",
    "pdf",
    "자료",
    "규정",
    "정책",
    "검색",
    "출처",
    "citation",
)
DB_RAG_HINTS = (
    "db",
    "database",
    "기록",
    "히스토리",
    "통계",
    "rows",
    "postgres",
    "데이터베이스",
)


def decide(message: str, mode: Optional[str] = None) -> str:
    requested = (mode or "").strip().lower()
    if requested in VALID_MODES:
        return requested

    text = (message or "").lower()

    if any(token in text for token in DOC_RAG_HINTS):
        return "doc_rag"
    if any(token in text for token in DB_RAG_HINTS):
        return "db_rag"
    if any(token in text for token in CALENDAR_HINTS):
        return "calendar"
    if any(token in text for token in EFT_HINTS):
        return "eft"
    return "omni"

