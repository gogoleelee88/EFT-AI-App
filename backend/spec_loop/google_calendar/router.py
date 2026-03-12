from datetime import date, datetime, time, timezone
from typing import List, Literal, Optional, Tuple

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.authz import get_current_user_id_spec
from services.auth_service import AuthService
from backend.spec_loop.google_calendar.models import GoogleEventMapping, GoogleToken
from backend.spec_loop.google_calendar.oauth import (
    build_auth_url,
    get_auth_url,
    get_connection_state,
    handle_callback,
)
from config.settings import get_settings
from backend.spec_loop.google_calendar.sync import (
    create_google_event,
    fetch_google_events,
    update_google_event,
)



def _resolve_google_callback_url(request: Request) -> str:
    settings = get_settings()
    backend_base = (settings.BACKEND_BASE_URL or "").strip().rstrip("/")
    if backend_base:
        return f"{backend_base}/api/spec/google/callback"
    return str(request.url_for("google_callback"))


def _resolve_frontend_url() -> str:
    settings = get_settings()
    raw = (settings.FRONTEND_URL or "").strip() or "http://localhost:3000"
    return raw.rstrip("/")


def _safe_next_path(value: Optional[str], *, default: str = "/plan/day") -> str:
    path = (value or "").strip()
    if not path.startswith("/"):
        return default
    if path.startswith("//"):
        return default
    return path
router = APIRouter(tags=["google"])

def _get_current_user_id(
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> str:
    """荑좏궎 湲곕컲 ?쒕퉬??JWT?먯꽌 ?꾩옱 ?ъ슜??ID 異붿텧."""
    if not access_token:
        raise HTTPException(status_code=401, detail="濡쒓렇?몄씠 ?꾩슂?⑸땲??")
    try:
        payload = AuthService().decode_jwt(access_token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="?섎せ???좏겙 ?좏삎?낅땲??")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="?좏겙???ъ슜???뺣낫媛 ?놁뒿?덈떎.")
        return str(user_id)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="?좏겙 寃利앹뿉 ?ㅽ뙣?덉뒿?덈떎.")


@router.get('/google/auth')
def google_auth(
    request: Request,
    next: Optional[str] = None,
    current_user_id: str = Depends(get_current_user_id_spec),
):
    """Return Google OAuth URL. Optional `next` controls post-callback frontend redirect."""
    safe_next = (next or "").strip()
    if safe_next and not safe_next.startswith("/"):
        safe_next = ""

    state = current_user_id if not safe_next else f"{current_user_id}|{safe_next}"
    auth_url = get_auth_url(state=state, redirect_uri=_resolve_google_callback_url(request))
    return {"authUrl": auth_url}


@router.get("/google/mobile/auth")
def google_mobile_auth(
    next: str = Query(default="/"),
    redirect_uri: str = Query(..., description="Mobile deep-link callback (e.g. myapp://oauth/google/callback)"),
    user_id: str = Depends(get_current_user_id_spec),
):
    safe_next = _safe_next_path(next, default="/")
    return {
        "authUrl": build_auth_url(
            user_id=user_id,
            next_path=safe_next,
            redirect_uri_override=redirect_uri,
        )
    }


@router.get("/google/callback")
def google_callback(request: Request, code: str, state: Optional[str] = None):
    """OAuth callback: exchange code and redirect to frontend."""
    if not state:
        raise HTTPException(status_code=400, detail="state ?뚮씪誘명꽣媛 ?놁뒿?덈떎.")

    user_id = state
    next_path: Optional[str] = None
    if "|" in state:
        user_id, next_path = state.split("|", 1)

    handle_callback(code, user_id, redirect_uri=_resolve_google_callback_url(request))
    frontend_url = _resolve_frontend_url()
    safe_next = _safe_next_path(next_path, default="/plan/day")
    redirect_target = f"{frontend_url}{safe_next}?google=connected"
    return RedirectResponse(url=redirect_target)


@router.get("/google/mobile/callback")
def google_mobile_callback(
    code: str,
    state: Optional[str] = None,
    redirect_uri: Optional[str] = Query(default=None),
):
    if not state:
        raise HTTPException(status_code=400, detail="state is required")

    user_id = state
    next_path: Optional[str] = None
    if "|" in state:
        user_id, next_path = state.split("|", 1)

    handle_callback(code, user_id, redirect_uri=redirect_uri)
    safe_next = _safe_next_path(next_path, default="/")
    return {"ok": True, "next": safe_next}


@router.get("/google/status")
def google_status(
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id_spec),
):
    """?꾩옱 ?ъ슜??Google ?곕룞 ?щ? ?뺤씤."""
    exists = (
        db.query(GoogleToken)
        .filter(GoogleToken.user_id == current_user_id)
        .first()
        is not None
    )
    return {"connected": bool(exists)}


@router.get("/google/mobile/status")
def google_mobile_status(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id_spec),
):
    state = get_connection_state(db=db, user_id=user_id)
    return {"connected": bool(state.get("connected")), **state}


@router.get("/google/mobile/events")
def google_mobile_events(
    date: date,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id_spec),
):
    """
    Android overlay endpoint.
    Supports Bearer or cookie auth via get_current_user_id_spec.
    """
    events = fetch_google_events(db, user_id, date)
    return {"events": events}


@router.get("/google/events")
def google_events(
    date: date,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id_spec),
):
    """二쇱뼱吏??좎쭨??Google Calendar ?대깽??諛섑솚."""
    events = fetch_google_events(db, current_user_id, date)
    return events


class ExportRequest(BaseModel):
    task_id: int = Field(..., description="?대? Task ID")
    start: datetime = Field(..., description="?대깽???쒖옉 ?쒓컖 (ISO 8601)")
    duration_minutes: int = Field(..., ge=1, description="?대깽??湲몄씠(遺?")
    calendar_id: str = Field(default="primary", description="Google Calendar ID")
    summary: Optional[str] = Field(default=None, description="?대깽???쒕ぉ (?놁쑝硫?Task ?쒕ぉ)")
    description: Optional[str] = Field(default=None, description="?대깽???ㅻ챸")
    privacy_mode: Literal["NORMAL", "MASKED", "APP_ONLY"] = "NORMAL"
    privacy_key: Optional[str] = None
    original_title: Optional[str] = None
    original_description: Optional[str] = None


class ExportResponse(BaseModel):
    google_event_id: str
    calendar_id: str


@router.post("/plan/day/export", response_model=ExportResponse)
def export_task_to_google(
    body: ExportRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id_spec),
):
    """PlanDay/Task瑜?Google Calendar ?대깽?몃줈 ?대낫?닿린."""
    # Task ?쒕ぉ 媛?몄삤湲?(summary媛 鍮꾩뼱 ?덉쓣 ???ъ슜)
    from backend.spec_loop.models.task import Task

    task = db.query(Task).filter(Task.task_id == body.task_id).one_or_none()
    if task is None:
        raise HTTPException(status_code=404, detail="Task瑜?李얠쓣 ???놁뒿?덈떎.")

    summary = body.summary or task.title

    created = create_google_event(
        db=db,
        user_id=current_user_id,
        start=body.start,
        duration_minutes=body.duration_minutes,
        summary=summary,
        description=body.description,
        calendar_id=body.calendar_id,
    )

    mapping: GoogleEventMapping = created["mapping"]
    mapping.task_id = body.task_id
    mapping.privacy_mode = body.privacy_mode
    mapping.privacy_key = body.privacy_key
    mapping.display_title = body.original_title or task.title
    mapping.display_description = body.original_description
    db.add(mapping)
    db.commit()

    return ExportResponse(
        google_event_id=created["google_event_id"],
        calendar_id=created["calendar_id"],
    )


class UpdateEventRequest(BaseModel):
    event_id: str = Field(..., description="Google Calendar ?대깽??ID")
    start: datetime = Field(..., description="?덈줈???쒖옉 ?쒓컖")
    end: datetime = Field(..., description="?덈줈??醫낅즺 ?쒓컖")
    summary: Optional[str] = Field(None, description="?쒕ぉ (蹂寃??쒕쭔)")
    calendar_id: str = Field(default="primary", description="Calendar ID")


class UpdateEventResponse(BaseModel):
    google_event_id: str
    calendar_id: str
    updated: bool = True


@router.patch("/google/events", response_model=UpdateEventResponse)
def update_google_calendar_event(
    body: UpdateEventRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id_spec),
):
    """Google Calendar ?대깽???쒓컙/?쒕ぉ ?섏젙."""
    result = update_google_event(
        db=db,
        user_id=current_user_id,
        event_id=body.event_id,
        start=body.start,
        end=body.end,
        summary=body.summary,
        calendar_id=body.calendar_id,
    )
    
    return UpdateEventResponse(
        google_event_id=result["google_event_id"],
        calendar_id=result["calendar_id"],
    )


class SmartItem(BaseModel):
    task_id: int
    planned_block_minutes: int = Field(..., ge=1)


class SmartSuggestRequest(BaseModel):
    date: date
    items: List[SmartItem]


class SmartSlot(BaseModel):
    task_id: int
    start: datetime
    end: datetime


class SmartSuggestResponse(BaseModel):
    date: date
    slots: List[SmartSlot]
    total_task_minutes: int
    scheduled_minutes: int


def _merge_busy_intervals(
    intervals: List[Tuple[datetime, datetime]]
) -> List[Tuple[datetime, datetime]]:
    if not intervals:
        return []
    intervals = sorted(intervals, key=lambda x: x[0])
    merged: List[Tuple[datetime, datetime]] = [intervals[0]]
    for start, end in intervals[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def _build_free_slots_for_date(
    busy_events: List[dict],
    target_date: date,
    day_start_hour: int = 8,
    day_end_hour: int = 22,
) -> List[Tuple[datetime, datetime]]:
    """?대떦 ?좎쭨?????free ?щ’ 由ъ뒪???앹꽦."""
    base_start = datetime.combine(
        target_date, time(day_start_hour, 0)
    ).replace(tzinfo=timezone.utc)
    base_end = datetime.combine(
        target_date, time(day_end_hour, 0)
    ).replace(tzinfo=timezone.utc)

    busy: List[Tuple[datetime, datetime]] = []

    for ev in busy_events:
        raw_start = ev.get("start")
        raw_end = ev.get("end")
        if not raw_start or not raw_end:
            continue
        try:
            ds = datetime.fromisoformat(
                raw_start.replace("Z", "+00:00")
            ).astimezone(timezone.utc)
            de = datetime.fromisoformat(
                raw_end.replace("Z", "+00:00")
            ).astimezone(timezone.utc)
        except Exception:
            continue

        # ?ㅻⅨ ?좎쭨??嫄몄퀜 ?덉뼱??target_date 踰붿쐞? 援먯쭛?⑸쭔 ?ъ슜
        start = max(ds, base_start)
        end = min(de, base_end)
        if start < end:
            busy.append((start, end))

    merged_busy = _merge_busy_intervals(busy)

    free: List[Tuple[datetime, datetime]] = []
    cursor = base_start
    for b_start, b_end in merged_busy:
        if cursor < b_start:
            free.append((cursor, b_start))
        cursor = max(cursor, b_end)
    if cursor < base_end:
        free.append((cursor, base_end))
    return free


@router.post("/plan/suggest-smart", response_model=SmartSuggestResponse)
def suggest_smart_plan(
    body: SmartSuggestRequest,
    db: Session = Depends(get_db),
    current_user_id: str = Depends(get_current_user_id_spec),
):
    """Google ?쇱젙源뚯? 怨좊젮??異붿쿇 ?ㅼ?以??앹꽦 (?⑥닚 greedy)."""
    # 0) ?대떦 ?좎쭨 DayPlan??mode瑜?李멸퀬???섎（ 踰붿쐞 議곗젙 (?놁쑝硫?100 湲곗?)
    from backend.spec_loop.models.day_plan import DayPlan  # 吏???꾪룷?몃줈 ?쒗솚 諛⑹?

    mode = 100
    plan = (
        db.query(DayPlan)
        .filter(DayPlan.user_id == current_user_id, DayPlan.date == body.date)
        .one_or_none()
    )
    if plan is not None and isinstance(plan.mode, int):
        mode = plan.mode

    if mode >= 100:
        day_start_hour, day_end_hour = 8, 22
    elif mode >= 70:
        day_start_hour, day_end_hour = 9, 21
    else:
        day_start_hour, day_end_hour = 10, 20

    # 1) Google ?대깽??媛?몄삤湲?
    events = fetch_google_events(db, current_user_id, body.date)

    # 2) Free ?щ’ 怨꾩궛 (mode???곕씪 ?섎（ 踰붿쐞 ?щ씪吏?
    free_slots = _build_free_slots_for_date(
        events,
        body.date,
        day_start_hour=day_start_hour,
        day_end_hour=day_end_hour,
    )

    # 3) Task 硫뷀??곗씠???곗꽑?쒖쐞/?먮꼫吏/吏묒쨷?? 濡쒕뱶
    from backend.spec_loop.models.task import Task

    task_ids = {i.task_id for i in body.items}
    if not task_ids:
        return SmartSuggestResponse(
            date=body.date,
            slots=[],
            total_task_minutes=0,
            scheduled_minutes=0,
        )

    task_rows = (
        db.query(Task).filter(Task.task_id.in_(task_ids)).all()
    )
    meta = {
        t.task_id: {
            "priority": t.priority if t.priority is not None else 1,
            "energy_cost": t.energy_cost if t.energy_cost is not None else 3,
            "requires_focus": bool(t.requires_focus),
        }
        for t in task_rows
    }

    # 4) ?곗꽑?쒖쐞/?먮꼫吏/吏묒쨷??湲곗??쇰줈 ?뺣젹
    enriched = []
    for i in body.items:
        m = meta.get(i.task_id, {"priority": 1, "energy_cost": 3, "requires_focus": False})
        enriched.append(
            {
                "item": i,
                "priority": int(m["priority"]),
                "energy_cost": int(m["energy_cost"]),
                "requires_focus": bool(m["requires_focus"]),
            }
        )

    # ?뺣젹 湲곗?:
    # - priority ?믪? 寃?癒쇱?
    # - requires_focus=True 癒쇱?
    # - energy_cost ?믪? 寃?癒쇱? ??泥대젰?????꾩슂/以묒슂???쇱? ?섎（ 珥덈컲 free ?щ’??諛곗튂
    enriched.sort(
        key=lambda x: (
            -x["priority"],
            not x["requires_focus"],
            -x["energy_cost"],
        )
    )

    slots: List[SmartSlot] = []
    total_task_minutes = sum(i.planned_block_minutes for i in body.items)
    scheduled_minutes = 0

    # 5) Greedy?섍쾶 ?욎뿉?쒕???Task 諛곗튂 (?뺣젹???쒖꽌?濡?
    free_idx = 0
    for info in enriched:
        item = info["item"]
        remaining = item.planned_block_minutes
        while remaining > 0 and free_idx < len(free_slots):
            f_start, f_end = free_slots[free_idx]
            free_minutes = int((f_end - f_start).total_seconds() // 60)
            if free_minutes <= 0:
                free_idx += 1
                continue

            use_minutes = min(remaining, free_minutes)
            slot_end = f_start + timedelta(minutes=use_minutes)  # type: ignore[name-defined]

            slots.append(SmartSlot(task_id=item.task_id, start=f_start, end=slot_end))
            scheduled_minutes += use_minutes
            remaining -= use_minutes

            if use_minutes == free_minutes:
                free_idx += 1
            else:
                free_slots[free_idx] = (slot_end, f_end)

            # ??Task???곗냽 釉붾줉 ?섎굹濡쒕쭔 諛곗튂 (?⑥닚?붾? ?꾪빐)
            break

    return SmartSuggestResponse(
        date=body.date,
        slots=slots,
        total_task_minutes=total_task_minutes,
        scheduled_minutes=scheduled_minutes,
    )
