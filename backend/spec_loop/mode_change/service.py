# PM 寃곗젙 1: 湲곕낯 2?뚯㎏ 409 (MODE_CHANGE_LIMIT). ?덉쇅=蹂댄샇 紐⑹쟻 ?섑뼢留? ?곹뼢 2?뚯㎏ ?뱀씪 ?덈? 湲덉?.
from sqlalchemy.orm import Session

from backend.spec_loop.models import ModeChange
from backend.spec_loop.execution_log_service import log_execution
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType

MODE_CHANGE_LIMIT = "MODE_CHANGE_LIMIT"


def count_for_day(db: Session, day_id: int) -> int:
    """?뱀씪(day_id) 紐⑤뱶 ?꾪솚 ?잛닔."""
    return db.query(ModeChange).filter(ModeChange.day_id == day_id).count()


def is_protection_down(from_mode: int, to_mode: int) -> bool:
    """蹂댄샇 紐⑹쟻 ?섑뼢: to_mode < from_mode (100??0, 100??0, 70??0)."""
    return to_mode < from_mode


def is_upward(from_mode: int, to_mode: int) -> bool:
    return to_mode > from_mode


def can_change(db: Session, day_id: int, from_mode: int, to_mode: int) -> None:
    """
    ?꾪솚 ?덉슜 ?щ?. ?덉슜 ??return. 遺덊뿀 ??HTTPException 409 (MODE_CHANGE_LIMIT) 諛쒖깮.
    - 0?? ?덉슜.
    - 1?뚯㎏: ?덉슜.
    - 2?뚯㎏: 蹂댄샇 紐⑹쟻 ?섑뼢留??덉슜; ?곹뼢 2?뚯㎏ ?뱀씪 ?덈? 湲덉? ??409.
    """
    count = count_for_day(db, day_id)
    if count == 0:
        return
    if count >= 1:
        if is_protection_down(from_mode, to_mode):
            return
        if is_upward(from_mode, to_mode):
            from fastapi import HTTPException
            raise HTTPException(status_code=409, detail=MODE_CHANGE_LIMIT)
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=MODE_CHANGE_LIMIT)


def record(db: Session, day_id: int, from_mode: int, to_mode: int, reason: str | None = None) -> None:
    """紐⑤뱶 ?꾪솚 1嫄?湲곕줉."""
    row = ModeChange(day_id=day_id, from_mode=from_mode, to_mode=to_mode, reason=reason)
    db.add(row)
    db.commit()

    # Slice 7: MODE_CHANGE ExecutionLog 湲곕줉
    log_execution(
        db,
        day_id=day_id,
        event_type=ExecutionLogEventType.MODE_CHANGE,
        mode=to_mode,
        metrics={"reason": reason, "from_mode": from_mode, "to_mode": to_mode},
    )


