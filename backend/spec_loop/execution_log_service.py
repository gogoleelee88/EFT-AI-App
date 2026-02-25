from __future__ import annotations

"""ExecutionLog ????

Slice 7: PLAN_COMMIT / ADAPT_APPLIED / MODE_CHANGE ??ExecutionLog ?リ옇?▽빳?ぢ?
??怨뺤쭢 KPI(START/RESUME 1??戮곕쭊)???熬곥굥由??リ옇???嶺뚮∥??猿녿뎨???뚮벣??먮ご???蹂κ텢??類ｋ펲.
"""

from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.spec_loop.models import ExecutionLog
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType

# ??怨뺤쭢 ???繹??1??戮곕쭊 KPI ????뗥윜?(SPEC Slice 7)
KPI_PRIORITY_BEHAVIOR_FIRST = "behavior_first"


def log_execution(
    db: Session,
    *,
    day_id: int,
    event_type: ExecutionLogEventType,
    task_id: Optional[int] = None,
    duration_sec: Optional[int] = None,
    mode: Optional[int] = None,
    condition_ref: Optional[int] = None,
    resistance_event_ref: Optional[int] = None,
    metrics: Optional[dict[str, Any]] = None,
    context: Optional[dict[str, Any]] = None,
) -> ExecutionLog:
    """ExecutionLog 1濾곌쑬????リ옇?▽빳??類ｋ펲.

    - PLAN_COMMIT, ADAPT_APPLIED, MODE_CHANGE ??Slice 7 ???繹?筌뤾쑴????ㅻ쾹??????
    - KPI ?筌먦끉?? ?リ옇????⑤챷紐드슖?behavior-first ??⑥ろ맖??戮곕쭊??嶺뚮∥??猿녿뎨???????
    """

    metrics_payload: dict[str, Any] = dict(metrics or {})
    if "kpi_priority" not in metrics_payload:
        metrics_payload["kpi_priority"] = KPI_PRIORITY_BEHAVIOR_FIRST

    row = ExecutionLog(
        day_id=day_id,
        task_id=task_id,
        # Enum value ??쒖굣????壤?????(?? "PLAN_COMMIT")
        event_type=event_type.value,
        duration_sec=duration_sec,
        mode=mode,
        condition_ref=condition_ref,
        resistance_event_ref=resistance_event_ref,
        metrics=metrics_payload or None,
        context=context,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


