import json
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List

from fastapi import HTTPException
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from sqlalchemy.orm import Session

from backend.spec_loop.google_calendar.models import GoogleEventMapping, GoogleToken


def _get_user_token(db: Session, user_id: str) -> GoogleToken:
    row = db.query(GoogleToken).filter(GoogleToken.user_id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Google ?°ë ?ë³´ê° ?ìµ?ë¤.")
    return row


def _build_credentials(row: GoogleToken) -> Credentials:
    data = json.loads(row.token_json)
    return Credentials.from_authorized_user_info(data)


def fetch_google_events(db: Session, user_id: str, target_date: date) -> List[Dict[str, Any]]:
    """ì£¼ì´ì§??ì§??Google Calendar ?´ë²¤??ëª©ë¡??ê°?¸ì¨??(ë¡ì»¬ ?ê°? ê¸°ì? ?ë£¨)."""
    row = _get_user_token(db, user_id)
    creds = _build_credentials(row)

    try:
        service = build("calendar", "v3", credentials=creds)
    except Exception as e:  # pragma: no cover - ?¤í¸?í¬ ?ì¡´
        raise HTTPException(status_code=500, detail=f"Google Calendar ?´ë¼?´ì¸???ì± ?¤í¨: {e}")

    # ?ë£¨ ë²ì (UTC ê¸°ì?, ?´ë¹ ?ì§ 00:00:00 ~ 23:59:59)
    # Google API??timeMax??exclusive(<)?´ë?ë¡??¤ì???ì???¬ì©?ë©´
    # ?ì???ì?ë ?´ë²¤?¸ê? ?ì¸?? ?°ë¼??23:59:59 ?¬ì©
    time_min = datetime.combine(target_date, time(0, 0, 0)).replace(tzinfo=timezone.utc).isoformat()
    time_max = datetime.combine(target_date, time(23, 59, 59)).replace(tzinfo=timezone.utc).isoformat()

    try:
        events_result = (
            service.events()
            .list(
                calendarId="primary",
                timeMin=time_min,
                timeMax=time_max,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
        )
    except Exception as e:  # pragma: no cover - ?¤í¸?í¬ ?ì¡´
        raise HTTPException(status_code=502, detail=f"Google Calendar ì¡°í ?¤í¨: {e}")

    items = events_result.get("items", [])
    event_ids = [str(ev.get("id")) for ev in items if ev.get("id")]
    mapping_by_event_id: dict[str, GoogleEventMapping] = {}
    if event_ids:
        mapping_rows = (
            db.query(GoogleEventMapping)
            .filter(
                GoogleEventMapping.user_id == user_id,
                GoogleEventMapping.google_event_id.in_(event_ids),
            )
            .all()
        )
        mapping_by_event_id = {str(row.google_event_id): row for row in mapping_rows}

    normalized: List[Dict[str, Any]] = []
    for ev in items:
        start = ev.get("start", {})
        end = ev.get("end", {})
        ev_id = str(ev.get("id") or "")
        mapping = mapping_by_event_id.get(ev_id)
        normalized.append(
            {
                "id": ev.get("id"),
                "title": ev.get("summary") or "(?ëª© ?ì)",
                "description": ev.get("description"),
                "start": start.get("dateTime") or start.get("date"),
                "end": end.get("dateTime") or end.get("date"),
                "source": "google",
                "editable": True,  # ?¸ì§ ê°?¥í?ë¡ ë³ê²?
                "privacy_mode": (mapping.privacy_mode if mapping else "NORMAL"),
                "display_title": (mapping.display_title if mapping else None),
                "privacy_key": (mapping.privacy_key if mapping else None),
            }
        )
    return normalized


def create_google_event(
    db: Session,
    user_id: str,
    start: datetime,
    duration_minutes: int,
    summary: str,
    description: str | None = None,
    calendar_id: str = "primary",
) -> Dict[str, Any]:
    """?¨ì¼ Google Calendar ?´ë²¤?¸ë? ?ì±?ê³ ë§¤í?????"""
    if duration_minutes < 1:
        raise HTTPException(status_code=400, detail="duration_minutes??1ë¶??´ì?´ì´???©ë??")

    row = _get_user_token(db, user_id)
    creds = _build_credentials(row)
    try:
        service = build("calendar", "v3", credentials=creds)
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Google Calendar ?´ë¼?´ì¸???ì± ?¤í¨: {e}")

    # ?ê°? ì²ë¦¬: naive?´ë©´ UTCë¡?ê°??
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = start + timedelta(minutes=duration_minutes)

    body = {
        "summary": summary,
        "start": {"dateTime": start.isoformat()},
        "end": {"dateTime": end.isoformat()},
        # Google-side reminder at event start (manual dismiss flow for non-mission events).
        "reminders": {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": 0}],
        },
    }
    if description:
        body["description"] = description

    try:
        created = (
            service.events()
            .insert(calendarId=calendar_id, body=body)
            .execute()
        )
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Google Calendar ?´ë²¤???ì± ?¤í¨: {e}")

    event_id = created.get("id")
    if not event_id:
        raise HTTPException(status_code=502, detail="Google ?´ë²¤??IDê° ë¹ì´ ?ìµ?ë¤.")

    mapping = GoogleEventMapping(
        user_id=user_id,
        task_id=0,  # ?¤ì task_id???¸ì¶?ë ìª½ì???¤ì
        calendar_id=calendar_id,
        google_event_id=event_id,
        privacy_mode="NORMAL",
    )
    # task_id???¸ì¶ë¶?ì ?¤ì ??add/commit
    return {
        "google_event_id": event_id,
        "calendar_id": calendar_id,
        "raw": created,
        "mapping": mapping,
    }


def update_google_event(
    db: Session,
    user_id: str,
    event_id: str,
    start: datetime,
    end: datetime,
    summary: str | None = None,
    calendar_id: str = "primary",
) -> Dict[str, Any]:
    """ê¸°ì¡´ Google Calendar ?´ë²¤?¸ì ?ê° ë°??ëª© ?ì."""
    row = _get_user_token(db, user_id)
    creds = _build_credentials(row)
    
    try:
        service = build("calendar", "v3", credentials=creds)
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Google Calendar ?´ë¼?´ì¸???ì± ?¤í¨: {e}")
    
    # ?ê°? ì²ë¦¬: naive?´ë©´ UTCë¡?ê°??
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    
    # ìµì ?´ë²¤???ë³´ ê°?¸ì¤ê¸?(sequence number ?¬í¨)
    try:
        event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=404, detail=f"?´ë²¤?¸ë? ì°¾ì ???ìµ?ë¤: {e}")
    
    # ?ê° ?ë°?´í¸
    event["start"] = {"dateTime": start.isoformat()}
    event["end"] = {"dateTime": end.isoformat()}
    
    # ?ëª© ?ë°?´í¸ (?ê³µ??ê²½ì°ë§?
    if summary is not None:
        event["summary"] = summary
    
    # sequence ?ë ?ë ì¦ê? (?ì???ì´)
    if "sequence" in event:
        event["sequence"] = int(event["sequence"]) + 1
    
    # Google Calendar???ë°?´í¸
    try:
        updated = (
            service.events()
            .update(calendarId=calendar_id, eventId=event_id, body=event)
            .execute()
        )
    except Exception as e:  # pragma: no cover
        # sequence ?¤ë¥ ???¬ì??
        error_msg = str(e)
        if "sequence" in error_msg.lower():
            raise HTTPException(
                status_code=409, 
                detail="?¼ì???¤ë¥¸ ê³³ì???ì?ì?µë?? ?ë¡ê³ì¹¨ ???¤ì ?ë?ì¸??"
            )
        raise HTTPException(status_code=502, detail=f"Google Calendar ?´ë²¤???ì ?¤í¨: {e}")
    
    return {
        "google_event_id": updated.get("id"),
        "calendar_id": calendar_id,
        "raw": updated,
    }


