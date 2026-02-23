from __future__ import annotations



from datetime import date, datetime, timedelta

from typing import Any, Dict, List



from backend.app.state.redis_store import acquire_tool_idempotency

from backend.database import SessionLocal

from backend.models.chat_models import StrictIntakeInput

from routers.emotion_candidates import EmotionCheckinRequest, save_emotion_checkin

from services.eft_mapper import build_eft_script_from_strict6

from backend.spec_loop.google_calendar.sync import fetch_google_events

from utils.logger import get_logger



logger = get_logger(__name__)





TOOL_SCHEMAS: List[Dict[str, Any]] = [

    {

        "name": "calendar.search_events",

        "description": "Search user's calendar events by date or date range.",

        "parameters": {

            "type": "object",

            "properties": {

                "date": {"type": "string", "description": "YYYY-MM-DD"},

                "date_range": {

                    "type": "object",

                    "properties": {

                        "start": {"type": "string", "description": "YYYY-MM-DD"},

                        "end": {"type": "string", "description": "YYYY-MM-DD"},

                    },

                },

            },

        },

    },

    {

        "name": "emotion.log_checkin",

        "description": "Store emotion check-in record for user.",

        "parameters": {

            "type": "object",

            "properties": {

                "mood": {"type": "string"},

                "intensity": {"type": "integer"},

                "notes": {"type": "string"},

                "session_type": {

                    "type": "string",

                    "enum": ["eftar", "meditation"],

                },

            },

            "required": ["mood", "intensity"],

        },

    },

    {

        "name": "eft.start_session",

        "description": "Start EFT session and build EFT script from intake-like fields.",

        "parameters": {

            "type": "object",

            "properties": {

                "core_emotion": {"type": "string"},

                "intensity": {"type": "integer"},

                "situation_context": {"type": "string"},

                "automatic_thought": {"type": "string"},

                "notes": {"type": "string"},

            },

        },

    },

]





def get_tool_schemas() -> List[Dict[str, Any]]:

    return TOOL_SCHEMAS

"summary": f"Emotion check-in saved. mood={mood}, intensity={intensity}, status={'success' if ok else 'failed'}",



def _safe_date(value: str) -> date:

    return datetime.strptime(value, "%Y-%m-%d").date()





def _calendar_search_events(args: Dict[str, Any], user_id: str) -> Dict[str, Any]:

    if not user_id:

        raise ValueError("calendar.search_events requires user_id.")



    target_dates: List[date] = []

    raw_date = args.get("date")

    raw_range = args.get("date_range")

    if isinstance(raw_date, str):

        target_dates = [_safe_date(raw_date)]

    elif isinstance(raw_range, dict):

        start = _safe_date(str(raw_range.get("start")))

        end = _safe_date(str(raw_range.get("end")))

        if end < start:

            start, end = end, start

        cursor = start

        while cursor <= end and len(target_dates) < 7:

            target_dates.append(cursor)

            cursor += timedelta(days=1)

    else:

        target_dates = [date.today()]



    events: List[Dict[str, Any]] = []

    db = SessionLocal()

    try:

        for d in target_dates:

            day_events = fetch_google_events(db, user_id, d)

            if isinstance(day_events, list):

                events.extend(day_events)

    finally:

        db.close()



    event_titles = [str(e.get("title") or "(?챘짧짤 ?챙)") for e in events[:5]]

    summary = (

        f"{len(target_dates)}??챘짼챙?챙 {len(events)}챗째??쩌챙??챙째쩐챙?쨉챘?? "

        + (" / ".join(event_titles) if event_titles else "?짹챘징???쩌챙???챙쨉?챘짚.")

    )

    return {"summary": summary, "count": len(events), "events": events[:20]}





def _emotion_log_checkin(args: Dict[str, Any], session_id: str, user_id: str) -> Dict[str, Any]:

    mood = str(args.get("mood") or "챙짚챘짝쩍")

    intensity = int(args.get("intensity") or 5)

    intensity = max(0, min(10, intensity))

    notes = (args.get("notes") or "").strip()

    session_type = args.get("session_type")

    if session_type not in ("eftar", "meditation"):

        session_type = None



    payload = EmotionCheckinRequest(

        session_id=session_id,

        user_id=user_id or None,

        core_emotion=mood,

        situation_context=notes or "chat_hub_tool",

        automatic_thought=notes or f"{mood} - emotion check-in note",

        physical_sensation=None,

        coping_attempt=None,

        immediate_goal="챗째챙 챗쨍째챘징",

        session_type=session_type,

        intensity_before=intensity,

        available_time=None,

    )

    result = save_emotion_checkin(payload)

    ok = bool(isinstance(result, dict) and result.get("ok"))

    return {

        "summary": f"Emotion check-in saved. mood={mood}, intensity={intensity}, status={"success" if ok else "failed"}",

        "saved": ok,

        "raw": result,

    }





def _eft_start_session(args: Dict[str, Any]) -> Dict[str, Any]:

    intensity = int(args.get("intensity") or 5)

    intensity = max(0, min(10, intensity))

    notes = (args.get("notes") or "").strip()



    intake = StrictIntakeInput(

        core_emotion=str(args.get("core_emotion") or args.get("emotion") or "챘쨋챙"),

        situation_context=str(args.get("situation_context") or notes or "General check-in context"),

        automatic_thought=str(args.get("automatic_thought") or notes or "챗쨈챙째짰?챙?챗쨀??쨋챘짚"),

        physical_sensation=args.get("physical_sensation"),

        behavioral_reaction=args.get("behavioral_reaction"),

        intensity=intensity,

        available_time=args.get("available_time"),

        immediate_goal=args.get("immediate_goal"),

    )

    script = build_eft_script_from_strict6(intake)

    summary = f"EFT ?쨍챙 ?챙 ?짚챠짭챘짝쩍챠쨍챘짜??챙짹?챙쨉?챘짚. target={script.get('target_emotion')}, intensity={intensity}/10"

    return {"summary": summary, "eft_script": script}





def run_tool(name: str, args: Dict[str, Any], session_id: str, user_id: str) -> Dict[str, Any]:

    if name == "calendar.search_events":

        return _calendar_search_events(args, user_id)

    if name == "emotion.log_checkin":

        return _emotion_log_checkin(args, session_id, user_id)

    if name in {"eft.start_session", "eft.next_round"}:

        return _eft_start_session(args)

    raise ValueError(f"Unsupported tool: {name}")





def execute_tool_calls(tool_calls: List[Dict[str, Any]], session_id: str, user_id: str) -> List[Dict[str, Any]]:

    results: List[Dict[str, Any]] = []

    for call in tool_calls or []:

        name = str(call.get("name") or "").strip()

        args = call.get("args") if isinstance(call.get("args"), dict) else {}

        if not name:

            continue



        if not acquire_tool_idempotency(session_id=session_id, tool_name=name, args=args):

            results.append(

                {

                    "name": name,

                    "args": args,

                    "status": "skipped",

                    "result": {"summary": "챙짚챘쨀쨉 ?쨍챙쨋챘징??쨍챠쨈 ?짚챠??챗짹쨈챘?째챙?쨉챘??"},

                }

            )

            continue



        try:

            result = run_tool(name=name, args=args, session_id=session_id, user_id=user_id)

            results.append({"name": name, "args": args, "status": "ok", "result": result})

        except Exception as exc:

            logger.exception("chat_hub: tool execution failed name=%s", name)

            results.append(

                {

                    "name": name,

                    "args": args,

                    "status": "error",

                    "result": {"summary": "???짚챠 챙짚??짚챘짜챗째 챘째챙?챙쨉?챘짚.", "error": str(exc)},

                }

            )

    return results





