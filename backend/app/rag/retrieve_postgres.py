from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from sqlalchemy import MetaData, Table, cast, inspect, select, String
from sqlalchemy.sql.sqltypes import String as SQLString, Text, Unicode, UnicodeText

from backend.database import engine
from utils.logger import get_logger

logger = get_logger(__name__)

SENSITIVE_HINTS = (
    "email",
    "mail",
    "phone",
    "mobile",
    "addr",
    "address",
    "resident",
    "passport",
    "ssn",
)

PREFERRED_TABLES = (
    "emotion_checkins",
    "suds_records",
    "day_plans",
    "tasks",
    "mission_results",
    "conditions",
)

WRITE_VERBS = ("update", "delete", "insert", "drop", "alter", "truncate")


def _mask_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    text = value
    text = re.sub(r"([A-Za-z0-9._%+-]{2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})", r"\1***@\2", text)
    text = re.sub(r"\b(\d{2,3})[- ]?(\d{3,4})[- ]?(\d{4})\b", r"\1-****-\3", text)
    if len(text) > 120:
        return text[:117] + "..."
    return text


def _mask_sensitive_row(row: Dict[str, Any]) -> Dict[str, Any]:
    masked: Dict[str, Any] = {}
    for key, value in row.items():
        lower_key = str(key).lower()
        if any(hint in lower_key for hint in SENSITIVE_HINTS):
            masked[key] = "***"
            continue
        masked[key] = _mask_value(value)
    return masked


def _table_candidates() -> List[str]:
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    ordered = [t for t in PREFERRED_TABLES if t in tables]
    for table in tables:
        if table not in ordered:
            ordered.append(table)
    return ordered[:10]


def _text_columns(table: Table) -> List[str]:
    cols: List[str] = []
    for col in table.columns:
        if isinstance(col.type, (SQLString, Text, Unicode, UnicodeText)):
            cols.append(col.name)
    return cols


def _score_row(row: Dict[str, Any], text_cols: List[str], tokens: List[str]) -> int:
    if not tokens:
        return 1
    haystack = " ".join(str(row.get(col, "")) for col in text_cols).lower()
    return sum(1 for token in tokens if token in haystack)


def _order_columns(table: Table):
    if "created_at" in table.c:
        return table.c["created_at"].desc()
    if "id" in table.c:
        return table.c["id"].desc()
    return None


def retrieve_db(query: str, user_id: str) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Safe DB retrieval for chat hub.
    - SELECT only
    - Optional user_id filter when table has user_id column
    - Basic sensitive-field masking
    """
    lowered = (query or "").lower()
    if any(verb in lowered for verb in WRITE_VERBS):
        logger.warning("chat_hub db_rag: write-like query detected, forcing read-only retrieval.")

    tokens = [token for token in re.findall(r"[A-Za-z0-9가-??]{2,}", lowered)[:12]]
    metadata = MetaData()

    all_rows: List[Dict[str, Any]] = []
    try:
        with engine.connect() as conn:
            for table_name in _table_candidates():
                try:
                    table = Table(table_name, metadata, autoload_with=engine)
                except Exception:
                    continue

                stmt = select(table)
                if user_id and "user_id" in table.c:
                    stmt = stmt.where(cast(table.c["user_id"], String) == str(user_id))

                order_col = _order_columns(table)
                if order_col is not None:
                    stmt = stmt.order_by(order_col)
                stmt = stmt.limit(50)

                try:
                    result = conn.execute(stmt).mappings().all()
                except Exception as exc:
                    logger.warning("chat_hub db_rag: select failed for %s: %s", table_name, exc)
                    continue

                text_cols = _text_columns(table)
                if not text_cols:
                    continue

                for row in result:
                    row_dict = dict(row)
                    score = _score_row(row_dict, text_cols, tokens)
                    if score <= 0:
                        continue
                    masked = _mask_sensitive_row(row_dict)
                    masked["__table"] = table_name
                    masked["__score"] = score
                    all_rows.append(masked)
    except Exception as exc:
        logger.error("chat_hub db_rag: unexpected retrieval error: %s", exc)
        return "", []

    all_rows.sort(key=lambda item: int(item.get("__score", 0)), reverse=True)
    top_rows = all_rows[:8]

    context_lines: List[str] = []
    for row in top_rows:
        table_name = row.get("__table", "unknown")
        compact = []
        for key, value in row.items():
            if key.startswith("__"):
                continue
            if value in (None, "", []):
                continue
            compact.append(f"{key}={value}")
            if len(compact) >= 5:
                break
        if compact:
            context_lines.append(f"[{table_name}] " + "; ".join(compact))

    return "\n".join(context_lines), top_rows


