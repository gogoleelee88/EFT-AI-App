from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from backend.database import get_db
from config.settings import get_settings
from services.alarm_service import check_alarm_dismissal, dismiss_alarm_and_update_stats
from services.location_service import verify_location_mission
from services.vision_service import verify_photo_mission
from backend.spec_loop.execution_log_service import log_execution
from backend.spec_loop.models import MissionResult, MissionRun, Place
from backend.spec_loop.reminder import repository as reminder_repository
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType

router = APIRouter(prefix="/spec/missions", tags=["mission-verification"])
_settings = get_settings()


def _load_mission_run(
    db: Session,
    mission_run_id: str,
    user_id: Optional[str] = None,
    expected_day_id: Optional[int] = None,
) -> MissionRun:
    run = db.query(MissionRun).filter(MissionRun.mission_run_id == mission_run_id).one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="mission_run_id not found")
    if user_id and run.user_id and run.user_id != user_id:
        raise HTTPException(status_code=403, detail="mission_run access denied")
    if expected_day_id is not None and run.day_id != expected_day_id:
        raise HTTPException(status_code=409, detail="mission_run day_id mismatch")
    return run


@router.post("/verify/photo")
async def verify_photo(
    day_id: int = Form(...),
    requirement: str = Form(...),
    ocr_keywords: Optional[str] = Form(None),
    objects_required: Optional[str] = Form(None),
    mission_template_id: Optional[int] = Form(None),
    mission_run_id: Optional[str] = Form(None),
    image: UploadFile = File(...),
    user_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    import json

    ocr_list = json.loads(ocr_keywords) if ocr_keywords else []
    objects_list = json.loads(objects_required) if objects_required else []

    verification_result = await verify_photo_mission(
        image_file=image,
        requirement=requirement,
        ocr_keywords=ocr_list,
        objects_required=objects_list,
    )

    mission_result = MissionResult(
        user_id=user_id,
        day_id=day_id,
        mission_template_id=mission_template_id,
        mission_type="photo",
        passed=verification_result["passed"],
        score=verification_result.get("confidence", 0.0),
        evidence={
            "image_url": "uploaded",
            "ocr_result": verification_result.get("detected_text", []),
            "detected_objects": verification_result.get("detected_objects", []),
            "confidence": verification_result.get("confidence", 0.0),
            "reason": verification_result.get("reason", ""),
        },
        verified_at=datetime.utcnow(),
    )
    db.add(mission_result)
    if mission_run_id:
        run = _load_mission_run(db, mission_run_id, user_id=user_id, expected_day_id=day_id)
        run.state = "verified"
        run.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(mission_result)
    if mission_result.passed:
        reminder_repository.resolve_jobs_if_mission_success(db, day_id)

    return {
        "result_id": mission_result.result_id,
        "passed": mission_result.passed,
        "confidence": mission_result.score,
        "reason": verification_result.get("reason", ""),
        "detected_text": verification_result.get("detected_text", []),
        "detected_objects": verification_result.get("detected_objects", []),
    }


@router.post("/verify/location")
def verify_location(
    day_id: int = Query(...),
    place_id: int = Query(...),
    current_lat: float = Query(...),
    current_lng: float = Query(...),
    wifi_ssid: Optional[str] = Query(None),
    bluetooth_beacon_id: Optional[str] = Query(None),
    mission_template_id: Optional[int] = Query(None),
    mission_run_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    place = db.query(Place).filter(Place.place_id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail=f"Place {place_id} not found")

    verification_result = verify_location_mission(
        current_lat=current_lat,
        current_lng=current_lng,
        target_place=place,
        wifi_ssid=wifi_ssid,
        bluetooth_beacon_id=bluetooth_beacon_id,
    )

    mission_result = MissionResult(
        user_id=user_id,
        day_id=day_id,
        mission_template_id=mission_template_id,
        mission_type="location",
        passed=verification_result["passed"],
        score=verification_result.get("confidence", 0.0),
        evidence={
            "place_id": place_id,
            "place_name": place.name,
            "gps": {
                "current_lat": current_lat,
                "current_lng": current_lng,
                "target_lat": place.gps_lat,
                "target_lng": place.gps_lng,
                "distance_m": verification_result.get("gps_distance_m"),
            },
            "wifi_matched": verification_result["wifi_matched"],
            "bluetooth_matched": verification_result["bluetooth_matched"],
            "reason": verification_result["reason"],
        },
        verified_at=datetime.utcnow(),
    )
    db.add(mission_result)
    if mission_run_id:
        run = _load_mission_run(db, mission_run_id, user_id=user_id, expected_day_id=day_id)
        run.state = "verified"
        run.verified_at = datetime.utcnow()
    db.commit()
    db.refresh(mission_result)
    if mission_result.passed:
        reminder_repository.resolve_jobs_if_mission_success(db, day_id)

    return {
        "result_id": mission_result.result_id,
        "passed": mission_result.passed,
        "confidence": mission_result.score,
        "reason": verification_result["reason"],
        "gps_distance_m": verification_result.get("gps_distance_m"),
        "wifi_matched": verification_result["wifi_matched"],
        "bluetooth_matched": verification_result["bluetooth_matched"],
    }


@router.post("/check-alarm")
def check_alarm_can_dismiss(
    day_id: int = Query(...),
    combination_mode: Literal["strict", "basic", "flexible"] = Query("basic"),
    mission_run_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if _settings.SECURITY_STRICT_MISSION_RUN and not mission_run_id:
        raise HTTPException(status_code=422, detail="mission_run_id required")
    if mission_run_id:
        _load_mission_run(db, mission_run_id, user_id=user_id, expected_day_id=day_id)
    result = check_alarm_dismissal(db, day_id, combination_mode)
    return result


@router.post("/dismiss-alarm")
def dismiss_alarm(
    day_id: int = Query(...),
    mission_run_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    run: MissionRun | None = None
    if _settings.SECURITY_STRICT_MISSION_RUN and not mission_run_id:
        raise HTTPException(status_code=422, detail="mission_run_id required")
    if mission_run_id:
        run = _load_mission_run(db, mission_run_id, user_id=user_id, expected_day_id=day_id)
        if run.state not in {"started", "verified"}:
            raise HTTPException(status_code=409, detail=f"invalid mission_run state: {run.state}")

    check_result = check_alarm_dismissal(db, day_id, "basic")
    if not check_result["can_dismiss"]:
        raise HTTPException(
            status_code=403,
            detail=f"?뚮엺???댁젣?????놁뒿?덈떎: {check_result['reason']}",
        )

    update_result = dismiss_alarm_and_update_stats(db, day_id, user_id)
    reminder_repository.resolve_jobs_if_mission_success(db, day_id)
    if run:
        run.state = "dismissed"
        run.dismissed_at = datetime.utcnow()
        db.commit()

    log_execution(
        db,
        day_id=day_id,
        event_type=ExecutionLogEventType.ALARM_DISMISS,
    )
    return {
        "dismissed": True,
        "message": "?뚮엺???댁젣?덉뒿?덈떎.",
        **check_result,
        **update_result,
    }

