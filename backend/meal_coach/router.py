from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, List, Dict, Optional

from fastapi import APIRouter, Cookie, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.meal_coach.authz import Actor, require_owner_or_admin, resolve_actor
from backend.meal_coach.idempotency import get_cached_response, request_hash, save_response
from backend.meal_coach.models import (
    ConsentLog,
    DeviceToken,
    MealAdvice,
    MealLog,
    MealPhoto,
    MealSchedulerJob,
    NutritionEstimate,
    PostMealCheck,
)
from backend.meal_coach.rate_limit import enforce_rate_limit
from backend.meal_coach.schemas import (
    AdviceResponse,
    ConsentResponse,
    ConsentRevokeRequest,
    ConsentUpsertRequest,
    DeviceTokenListResponse,
    DeviceTokenResponse,
    DeviceTokenUpsertRequest,
    MealCreateRequest,
    MealEstimateRequest,
    MealEstimateResponse,
    MealListResponse,
    MealPhotoCreateRequest,
    MealPhotoResponse,
    MealResponse,
    MealUpdateRequest,
    NotificationTriggerRequest,
    NotificationTriggerResponse,
    PostCheckListResponse,
    PostCheckRequest,
    PostCheckResponse,
    SchedulerJobCreateRequest,
    SchedulerJobResponse,
    SchedulerRunRequest,
    SchedulerRunResponse,
    WeeklySummaryResponse,
)
from backend.meal_coach.service import (
    ADVICE_VERSIONS,
    ESTIMATE_VERSIONS,
    build_estimate,
    compute_effect_and_advice,
    confidence_bucket,
    log_audit,
    log_event,
    make_uuid,
    schedule_default_jobs,
    summarize_week,
    process_due_scheduler_jobs,
    upsert_post_check,
    validate_post_check_window,
)
from backend.meal_coach.vision_estimator import MealVisionPhoto, estimate_nutrition_from_meal_photos

router = APIRouter(tags=["meal-coach"])
logger = logging.getLogger(__name__)

PHOTO_STORAGE_ROOT = Path("data") / "meal_photos"
MAX_PHOTO_COUNT_PER_MEAL = 10
MAX_PHOTO_BYTES = 8 * 1024 * 1024


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_filename(name: str | None) -> str:
    base = Path(name or "meal_photo").name
    clean = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    clean = clean.strip("._")
    if not clean:
        clean = "meal_photo"
    if len(clean) > 120:
        clean = clean[-120:]
    return clean


def _get_actor(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> Actor:
    return resolve_actor(
        db,
        authorization=authorization,
        x_tenant_id=x_tenant_id,
        access_token=access_token,
    )


def _require_meal(db: Session, actor: Actor, meal_id: str) -> MealLog:
    row = (
        db.query(MealLog)
        .filter(
            MealLog.meal_id == meal_id,
            MealLog.tenant_id == actor.tenant_id,
            MealLog.user_id == actor.user_id,
            MealLog.deleted_at.is_(None),
        )
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="MEAL_NOT_FOUND")
    return row


def _idempotency_guard(
    db: Session,
    *,
    actor: Actor,
    req: Request,
    payload: dict,
    idempotency_key: Optional[str],
) -> tuple[str, str] | JSONResponse:
    if not idempotency_key:
        raise HTTPException(status_code=400, detail="IDEMPOTENCY_KEY_REQUIRED")
    h = request_hash(payload)
    cached = get_cached_response(
        db,
        tenant_id=actor.tenant_id,
        method=req.method,
        path=req.url.path,
        idem_key=idempotency_key,
        req_hash=h,
    )
    if cached is None:
        return idempotency_key, h
    status_code, body = cached
    return JSONResponse(status_code=status_code, content=body)


def _store_idempotent(
    db: Session,
    *,
    actor: Actor,
    req: Request,
    idempotency_key: str,
    req_hash: str,
    body: dict,
    status_code: int = 200,
) -> None:
    save_response(
        db,
        tenant_id=actor.tenant_id,
        method=req.method,
        path=req.url.path,
        idem_key=idempotency_key,
        req_hash=req_hash,
        status_code=status_code,
        response_body=body,
    )


def _estimate_to_response(row: NutritionEstimate) -> dict:
    conf = float(row.confidence)
    return {
        "estimate_id": row.estimate_id,
        "track_used": row.track,
        "nutrition": {
            "calories": int(row.calories),
            "carbs_g": float(row.carbs_g),
            "protein_g": float(row.protein_g),
            "fat_g": float(row.fat_g),
            "sodium_mg": float(row.sodium_mg),
        },
        "labels": list(row.labels or []),
        "confidence": conf,
        "uncertainty_reason": list(row.uncertainty_reason or []),
        "source_refs": list(row.source_refs or []),
        "confidence_bucket": confidence_bucket(conf),
        "versions": {
            "engine_version": row.engine_version,
            "model_version": row.model_version,
            "prompt_version": row.prompt_version,
            "dataset_version": row.dataset_version,
        },
    }


def _save_estimate_row(
    db: Session,
    *,
    meal: MealLog,
    estimate_payload: dict,
) -> NutritionEstimate | None:
    nutrition = estimate_payload.get("nutrition")
    if not isinstance(nutrition, dict):
        return None
    versions = estimate_payload.get("versions")
    if not isinstance(versions, dict):
        versions = {}

    track_used = str(estimate_payload.get("track_used") or "B").upper()
    if track_used not in {"A", "B"}:
        track_used = "B"

    def _f(value: object, default: float = 0.0) -> float:
        try:
            return float(value)
        except Exception:
            return default

    confidence = max(0.0, min(1.0, _f(estimate_payload.get("confidence"), 0.55)))
    row = NutritionEstimate(
        estimate_id=make_uuid(),
        meal_id=meal.meal_id,
        track=track_used,
        calories=int(round(max(0.0, _f(nutrition.get("calories"), 0.0)))),
        carbs_g=round(max(0.0, _f(nutrition.get("carbs_g"), 0.0)), 1),
        protein_g=round(max(0.0, _f(nutrition.get("protein_g"), 0.0)), 1),
        fat_g=round(max(0.0, _f(nutrition.get("fat_g"), 0.0)), 1),
        sodium_mg=round(max(0.0, _f(nutrition.get("sodium_mg"), 0.0)), 1),
        labels=list(estimate_payload.get("labels") or []),
        confidence=round(confidence, 2),
        uncertainty_reason=list(estimate_payload.get("uncertainty_reason") or []),
        source_refs=list(estimate_payload.get("source_refs") or []),
        engine_version=str(versions.get("engine_version") or ESTIMATE_VERSIONS["engine_version"])[:64],
        model_version=str(versions.get("model_version") or ESTIMATE_VERSIONS["model_version"])[:64],
        prompt_version=str(versions.get("prompt_version") or ESTIMATE_VERSIONS["prompt_version"])[:64],
        dataset_version=str(versions.get("dataset_version") or ESTIMATE_VERSIONS["dataset_version"])[:64],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/meals", response_model=MealResponse)
def create_meal(
    body: MealCreateRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> MealResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:write:/meals", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    meal_time = body.meal_time or _utcnow()
    if meal_time.tzinfo is None:
        meal_time = meal_time.replace(tzinfo=timezone.utc)
    if meal_time > (_utcnow() + timedelta(minutes=5)):
        raise HTTPException(status_code=422, detail="MEAL_TIME_IN_FUTURE")

    meal = MealLog(
        meal_id=make_uuid(),
        tenant_id=actor.tenant_id,
        user_id=actor.user_id,
        meal_state=body.meal_state,
        meal_time=meal_time,
        fasting_hours=body.fasting_hours,
        source=body.source,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    windows = None
    if body.meal_state == "ATE":
        windows = schedule_default_jobs(db, actor=actor, meal=meal)

    log_event(
        db,
        actor=actor,
        event_name="meal_logged",
        meal_id=meal.meal_id,
        payload={
            "meal_state": body.meal_state,
            "source": body.source,
            "zero_input": body.source == "auto",
        },
    )
    log_audit(db, actor=actor, action="meal_create", target_type="meal_logs", target_id=meal.meal_id)

    response = {
        "meal_id": meal.meal_id,
        "meal_state": meal.meal_state,
        "meal_time": meal.meal_time.isoformat(),
        "fasting_hours": meal.fasting_hours,
        "source": meal.source,
        "check_windows": {k: v.isoformat() for k, v in (windows or {}).items()} or None,
        "status": "logged",
    }
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
        status_code=200,
    )
    return response


@router.get("/meals", response_model=MealListResponse)
def list_meals(
    limit: int = Query(default=20, ge=1, le=50),
    meal_state: Optional[str] = Query(default=None),
    since: Optional[datetime] = Query(default=None),
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
) -> MealListResponse:
    enforce_rate_limit(f"{actor.user_id}:read:/meals", 120)
    query = db.query(MealLog).filter(
        MealLog.tenant_id == actor.tenant_id,
        MealLog.user_id == actor.user_id,
        MealLog.deleted_at.is_(None),
    )
    if meal_state is not None:
        state = meal_state.upper().strip()
        if state not in {"FASTING", "ATE"}:
            raise HTTPException(status_code=422, detail="INVALID_MEAL_STATE_FILTER")
        query = query.filter(MealLog.meal_state == state)
    if since is not None:
        since_utc = since if since.tzinfo else since.replace(tzinfo=timezone.utc)
        query = query.filter(MealLog.meal_time >= since_utc)

    meals = query.order_by(MealLog.meal_time.desc()).limit(limit).all()
    meal_ids = [m.meal_id for m in meals]
    photo_counts: dict[str, int] = {}
    estimate_ids: set[str] = set()
    check_ids: set[str] = set()

    if meal_ids:
        photo_rows = (
            db.query(MealPhoto.meal_id, func.count(MealPhoto.photo_id))
            .filter(MealPhoto.meal_id.in_(meal_ids))
            .group_by(MealPhoto.meal_id)
            .all()
        )
        photo_counts = {meal_id: int(count) for meal_id, count in photo_rows}
        estimate_ids = {
            row[0]
            for row in db.query(NutritionEstimate.meal_id).filter(NutritionEstimate.meal_id.in_(meal_ids)).distinct()
        }
        check_ids = {
            row[0] for row in db.query(PostMealCheck.meal_id).filter(PostMealCheck.meal_id.in_(meal_ids)).distinct()
        }

    items = [
        {
            "meal_id": m.meal_id,
            "meal_state": m.meal_state,
            "meal_time": m.meal_time.isoformat(),
            "source": m.source,
            "track_selected": m.track_selected,
            "photo_count": int(photo_counts.get(m.meal_id, 0)),
            "has_estimate": m.meal_id in estimate_ids,
            "has_post_check": m.meal_id in check_ids,
        }
        for m in meals
    ]
    return {"items": items}


@router.get("/meals/{meal_id}")
def get_meal(
    meal_id: str,
    include: list[str] = Query(default=[]),
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
):
    enforce_rate_limit(f"{actor.user_id}:read:/meals/{meal_id}", 120)
    meal = _require_meal(db, actor, meal_id)
    payload = {
        "meal_id": meal.meal_id,
        "meal_state": meal.meal_state,
        "meal_time": meal.meal_time.isoformat(),
        "fasting_hours": meal.fasting_hours,
        "source": meal.source,
        "track_selected": meal.track_selected,
    }
    include_set = set(include)
    if "photos" in include_set:
        photos = db.query(MealPhoto).filter(MealPhoto.meal_id == meal.meal_id).all()
        payload["photos"] = [
            {
                "photo_id": p.photo_id,
                "storage_uri": p.storage_uri,
                "thumbnail_uri": p.thumbnail_uri,
                "raw_store": bool(p.raw_store),
            }
            for p in photos
        ]
    if "estimate" in include_set:
        estimate = (
            db.query(NutritionEstimate)
            .filter(NutritionEstimate.meal_id == meal.meal_id)
            .order_by(NutritionEstimate.created_at.desc())
            .first()
        )
        payload["estimate"] = _estimate_to_response(estimate) if estimate else None
    if "advice" in include_set:
        advice = (
            db.query(MealAdvice)
            .filter(MealAdvice.meal_id == meal.meal_id)
            .order_by(MealAdvice.created_at.desc())
            .first()
        )
        payload["advice"] = (
            {
                "advice_id": advice.advice_id,
                "dip_score": advice.dip_score,
                "decision_mode": advice.decision_mode,
                "task_mode": advice.task_mode,
                "next_action": advice.next_action,
                "confidence": advice.confidence,
            }
            if advice
            else None
        )
    return payload


@router.get("/device-tokens", response_model=DeviceTokenListResponse)
def list_device_tokens(
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
) -> DeviceTokenListResponse:
    enforce_rate_limit(f"{actor.user_id}:read:/device-tokens", 120)
    rows = (
        db.query(DeviceToken)
        .filter(DeviceToken.tenant_id == actor.tenant_id, DeviceToken.user_id == actor.user_id)
        .order_by(DeviceToken.created_at.desc())
        .all()
    )
    items = [
        {
            "token_id": r.token_id,
            "platform": r.platform,
            "is_active": bool(r.is_active),
            "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]
    return {"items": items}


@router.post("/device-tokens", response_model=DeviceTokenResponse)
def upsert_device_token(
    body: DeviceTokenUpsertRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> DeviceTokenResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:write:/device-tokens", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    now = _utcnow()
    row = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.tenant_id == actor.tenant_id,
            DeviceToken.user_id == actor.user_id,
            DeviceToken.push_token == body.push_token,
        )
        .one_or_none()
    )
    if row is None:
        row = DeviceToken(
            token_id=make_uuid(),
            tenant_id=actor.tenant_id,
            user_id=actor.user_id,
            platform=body.platform,
            push_token=body.push_token,
            is_active=body.is_active,
            last_seen_at=now if body.is_active else None,
        )
        db.add(row)
    else:
        row.platform = body.platform
        row.is_active = body.is_active
        row.last_seen_at = now if body.is_active else row.last_seen_at
    db.commit()
    db.refresh(row)
    response = {
        "token_id": row.token_id,
        "platform": row.platform,
        "is_active": bool(row.is_active),
        "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
        "created_at": row.created_at.isoformat(),
    }
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.delete("/device-tokens/{token_id}")
def deactivate_device_token(
    token_id: str,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    enforce_rate_limit(f"{actor.user_id}:write:/device-tokens/{token_id}", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload={"token_id": token_id},
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard
    row = (
        db.query(DeviceToken)
        .filter(
            DeviceToken.token_id == token_id,
            DeviceToken.tenant_id == actor.tenant_id,
            DeviceToken.user_id == actor.user_id,
        )
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="DEVICE_TOKEN_NOT_FOUND")
    row.is_active = False
    db.commit()
    response = {"token_id": row.token_id, "status": "deactivated"}
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.patch("/meals/{meal_id}")
def patch_meal(
    meal_id: str,
    body: MealUpdateRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    enforce_rate_limit(f"{actor.user_id}:write:/meals/{meal_id}", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json", exclude_none=True),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    meal = _require_meal(db, actor, meal_id)
    if body.meal_state is not None:
        meal.meal_state = body.meal_state
    if body.meal_time is not None:
        mt = body.meal_time
        if mt.tzinfo is None:
            mt = mt.replace(tzinfo=timezone.utc)
        if mt > (_utcnow() + timedelta(minutes=5)):
            raise HTTPException(status_code=422, detail="MEAL_TIME_IN_FUTURE")
        meal.meal_time = mt
    if body.fasting_hours is not None:
        meal.fasting_hours = body.fasting_hours
    if body.source is not None:
        meal.source = body.source
    db.commit()
    db.refresh(meal)

    response = {"meal_id": meal.meal_id, "status": "updated"}
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.post("/meals/{meal_id}/photos", response_model=MealPhotoResponse)
def create_meal_photos(
    meal_id: str,
    body: MealPhotoCreateRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> MealPhotoResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:upload:/meals/{meal_id}/photos", 30)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    meal = _require_meal(db, actor, meal_id)
    existing_count = db.query(MealPhoto).filter(MealPhoto.meal_id == meal.meal_id).count()
    if existing_count + len(body.photos) > 10:
        raise HTTPException(status_code=422, detail="PHOTO_LIMIT_EXCEEDED")

    uploaded = []
    for p in body.photos:
        row = MealPhoto(
            photo_id=make_uuid(),
            meal_id=meal.meal_id,
            storage_uri=p.storage_uri,
            thumbnail_uri=p.thumbnail_uri,
            embedding_ref=p.embedding_ref,
            raw_store=p.raw_store,
        )
        db.add(row)
        uploaded.append({"photo_id": row.photo_id, "url": row.storage_uri})
    db.commit()

    log_event(
        db,
        actor=actor,
        event_name="photo_uploaded",
        meal_id=meal.meal_id,
        payload={
            "photo_count": len(body.photos),
            "raw_store": any(p.raw_store for p in body.photos),
        },
    )
    response = {
        "uploaded": uploaded,
        "raw_store": any(p.raw_store for p in body.photos),
    }
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.post("/meals/{meal_id}/photos/upload", response_model=MealPhotoResponse)
async def upload_meal_photos(
    meal_id: str,
    req: Request,
    files: list[UploadFile] = File(...),
    raw_store: bool = Form(default=False),
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> MealPhotoResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:upload:/meals/{meal_id}/photos/upload", 30)
    payload = {
        "raw_store": bool(raw_store),
        "files": [
            {"name": _safe_filename(upload.filename), "content_type": upload.content_type or ""}
            for upload in files
        ],
    }
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=payload,
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    meal = _require_meal(db, actor, meal_id)
    if not files:
        raise HTTPException(status_code=422, detail="PHOTO_REQUIRED")

    existing_count = db.query(MealPhoto).filter(MealPhoto.meal_id == meal.meal_id).count()
    if existing_count + len(files) > MAX_PHOTO_COUNT_PER_MEAL:
        raise HTTPException(status_code=422, detail="PHOTO_LIMIT_EXCEEDED")

    prepared: list[tuple[str, str, bytes]] = []
    for upload in files:
        content_type = (upload.content_type or "").lower()
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=415, detail="UNSUPPORTED_MEDIA_TYPE")
        content = await upload.read()
        await upload.close()
        if not content:
            raise HTTPException(status_code=422, detail="EMPTY_FILE")
        if len(content) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="PHOTO_TOO_LARGE")
        prepared.append((_safe_filename(upload.filename), content_type, content))

    meal_dir = PHOTO_STORAGE_ROOT / actor.tenant_id / meal.meal_id
    meal_dir.mkdir(parents=True, exist_ok=True)

    uploaded = []
    for safe_name, _content_type, content in prepared:
        photo_id = make_uuid()
        target_path = meal_dir / f"{photo_id}_{safe_name}"
        with target_path.open("wb") as fp:
            fp.write(content)
        storage_uri = target_path.as_posix()
        row = MealPhoto(
            photo_id=photo_id,
            meal_id=meal.meal_id,
            storage_uri=storage_uri,
            thumbnail_uri=None,
            embedding_ref=None,
            raw_store=raw_store,
        )
        db.add(row)
        uploaded.append({"photo_id": row.photo_id, "url": row.storage_uri})
    db.commit()

    log_event(
        db,
        actor=actor,
        event_name="photo_uploaded",
        meal_id=meal.meal_id,
        payload={
            "photo_count": len(prepared),
            "raw_store": bool(raw_store),
            "upload_mode": "multipart",
        },
    )
    auto_estimate_payload = None
    if meal.meal_state == "ATE":
        try:
            vision_estimate = await estimate_nutrition_from_meal_photos(
                [
                    MealVisionPhoto(content=content, content_type=content_type)
                    for _safe_name, content_type, content in prepared
                ]
            )
            if vision_estimate:
                saved = _save_estimate_row(db, meal=meal, estimate_payload=vision_estimate)
                if saved is not None:
                    auto_estimate_payload = _estimate_to_response(saved)
                    log_event(
                        db,
                        actor=actor,
                        event_name="nutrition_estimated",
                        meal_id=meal.meal_id,
                        payload={
                            "track": saved.track,
                            "confidence": float(saved.confidence),
                            "confidence_bucket": confidence_bucket(float(saved.confidence)),
                            "source": "responses_api_auto_on_upload",
                        },
                    )
        except Exception:
            logger.exception("Auto nutrition estimate failed after photo upload")

    response = {
        "uploaded": uploaded,
        "raw_store": bool(raw_store),
    }
    if auto_estimate_payload is not None:
        response["auto_estimate"] = auto_estimate_payload
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.post("/meals/{meal_id}/estimate", response_model=MealEstimateResponse)
def estimate_meal(
    meal_id: str,
    body: MealEstimateRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> MealEstimateResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:estimate:/meals/{meal_id}", 20)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    meal = _require_meal(db, actor, meal_id)
    meal.track_selected = body.track
    db.commit()

    if not body.force_recompute:
        existing = (
            db.query(NutritionEstimate)
            .filter(NutritionEstimate.meal_id == meal.meal_id)
            .order_by(NutritionEstimate.created_at.desc())
            .first()
        )
        if existing is not None:
            response = _estimate_to_response(existing)
            _store_idempotent(
                db,
                actor=actor,
                req=req,
                idempotency_key=idem_key,
                req_hash=req_hash,
                body=response,
            )
            return response

    photo_count = db.query(MealPhoto).filter(MealPhoto.meal_id == meal.meal_id).count()
    est = build_estimate(meal=meal, req=body, photo_count=photo_count)
    row = NutritionEstimate(
        estimate_id=make_uuid(),
        meal_id=meal.meal_id,
        track=est["track_used"],
        calories=est["nutrition"]["calories"],
        carbs_g=est["nutrition"]["carbs_g"],
        protein_g=est["nutrition"]["protein_g"],
        fat_g=est["nutrition"]["fat_g"],
        sodium_mg=est["nutrition"]["sodium_mg"],
        labels=est["labels"],
        confidence=est["confidence"],
        uncertainty_reason=est["uncertainty_reason"],
        source_refs=est["source_refs"],
        engine_version=ESTIMATE_VERSIONS["engine_version"],
        model_version=ESTIMATE_VERSIONS["model_version"],
        prompt_version=ESTIMATE_VERSIONS["prompt_version"],
        dataset_version=ESTIMATE_VERSIONS["dataset_version"],
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    response = _estimate_to_response(row)
    log_event(
        db,
        actor=actor,
        event_name="nutrition_estimated",
        meal_id=meal.meal_id,
        payload={
            "track": row.track,
            "confidence": row.confidence,
            "confidence_bucket": response["confidence_bucket"],
        },
    )
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.get("/meals/{meal_id}/estimate", response_model=MealEstimateResponse)
def get_estimate(
    meal_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
) -> MealEstimateResponse:
    enforce_rate_limit(f"{actor.user_id}:read:/meals/{meal_id}/estimate", 120)
    _require_meal(db, actor, meal_id)
    row = (
        db.query(NutritionEstimate)
        .filter(NutritionEstimate.meal_id == meal_id)
        .order_by(NutritionEstimate.created_at.desc())
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="ESTIMATE_NOT_FOUND")
    return _estimate_to_response(row)


@router.post("/meals/{meal_id}/post-check", response_model=PostCheckResponse)
def submit_post_check(
    meal_id: str,
    body: PostCheckRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> PostCheckResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:write:/meals/{meal_id}/post-check", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    meal = _require_meal(db, actor, meal_id)
    try:
        check = upsert_post_check(db, meal=meal, req=body)
    except ValueError as exc:
        if str(exc) == "SLOT_ALREADY_SUBMITTED":
            raise HTTPException(status_code=409, detail="SLOT_ALREADY_SUBMITTED")
        raise

    effect, advice = compute_effect_and_advice(db, meal=meal)
    partial = (
        int(effect.dip_score_t30 or 0)
        if body.slot == "T30"
        else int(effect.dip_score_t90 or effect.dip_score_t30 or 0)
    )
    late = validate_post_check_window(meal, body)

    # Bidirectional sync bridge: /api/v1 meal post-check -> /api/spec condition summary.
    try:
        from backend.meal_coach.sync import sync_meal_post_check_to_spec_condition

        sync_meal_post_check_to_spec_condition(
            db,
            user_id=actor.user_id,
            meal=meal,
            check=check,
            dip_score=int(effect.dip_score),
            dip_score_t30=int(effect.dip_score_t30 or 0),
            dip_score_t90=int(effect.dip_score_t90 or 0),
        )
    except Exception:
        # Keep meal endpoint resilient even if sync sidecar fails.
        pass

    log_event(
        db,
        actor=actor,
        event_name="post_check_submitted",
        meal_id=meal.meal_id,
        payload={
            "slot": body.slot,
            "dip_partial": partial,
            "check_completion_time_ms": check.check_completion_time_ms,
            "confidence_bucket": effect.confidence_bucket,
        },
    )
    log_event(
        db,
        actor=actor,
        event_name="advice_generated",
        meal_id=meal.meal_id,
        payload={
            "dip_score": int(effect.dip_score),
            "task_mode": advice.task_mode,
            "decision_mode": advice.decision_mode,
            "confidence": float(advice.confidence),
        },
    )

    response = {
        "check_id": check.check_id,
        "slot": body.slot,
        "dip_score_partial": partial,
        "late": late,
        "check_completion_time_ms": check.check_completion_time_ms,
    }
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.get("/meals/{meal_id}/post-checks", response_model=PostCheckListResponse)
def list_post_checks(
    meal_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
) -> PostCheckListResponse:
    enforce_rate_limit(f"{actor.user_id}:read:/meals/{meal_id}/post-checks", 120)
    _require_meal(db, actor, meal_id)
    rows = (
        db.query(PostMealCheck)
        .filter(PostMealCheck.meal_id == meal_id)
        .order_by(PostMealCheck.submitted_at.asc())
        .all()
    )
    items = []
    for r in rows:
        base = ((0.4 * r.sleepiness) + (0.35 * r.focus_drop) + (0.25 * r.sluggishness)) / 4.0 * 100.0
        if (r.gi_discomfort or 0) >= 2:
            base += 5
        if (r.headache or 0) >= 2:
            base += 5
        if r.caffeine_used:
            base -= 3
        items.append({"slot": r.slot, "dip_score_partial": int(max(0, min(100, round(base))))})
    return {"items": items}


@router.get("/meals/{meal_id}/advice", response_model=AdviceResponse)
def get_advice(
    meal_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
) -> AdviceResponse:
    enforce_rate_limit(f"{actor.user_id}:read:/meals/{meal_id}/advice", 120)
    _require_meal(db, actor, meal_id)
    row = (
        db.query(MealAdvice)
        .filter(MealAdvice.meal_id == meal_id)
        .order_by(MealAdvice.created_at.desc())
        .first()
    )
    if row is None:
        raise HTTPException(status_code=409, detail="ADVICE_NOT_READY")
    return {
        "advice_id": row.advice_id,
        "dip_score": row.dip_score,
        "decision_mode": row.decision_mode,
        "task_mode": row.task_mode,
        "next_action": list(row.next_action or []),
        "confidence": float(row.confidence),
        "why_tokens": list(row.why_tokens or []),
        "versions": {
            "engine_version": row.engine_version,
            "model_version": row.model_version,
            "prompt_version": row.prompt_version,
            "dataset_version": row.dataset_version,
        },
    }


@router.post("/scheduler/jobs", response_model=SchedulerJobResponse)
def create_scheduler_job(
    body: SchedulerJobCreateRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> SchedulerJobResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:write:/scheduler/jobs", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    _require_meal(db, actor, body.meal_id)
    dedupe_key = f"postcheck:{body.meal_id}:{body.job_type}"
    existing = db.query(MealSchedulerJob).filter(MealSchedulerJob.dedupe_key == dedupe_key).one_or_none()
    if existing is None:
        row = MealSchedulerJob(
            job_id=make_uuid(),
            tenant_id=actor.tenant_id,
            user_id=actor.user_id,
            meal_id=body.meal_id,
            job_type=body.job_type,
            due_at=body.due_at,
            status="queued",
            dedupe_key=dedupe_key,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    else:
        row = existing

    response = {"job_id": row.job_id, "status": row.status, "dedupe_key": row.dedupe_key}
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.post("/scheduler/run-due", response_model=SchedulerRunResponse)
def run_due_scheduler_jobs(
    body: SchedulerRunRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
) -> SchedulerRunResponse:
    enforce_rate_limit(f"{actor.user_id}:write:/scheduler/run-due", 30)
    require_owner_or_admin(actor)
    result = process_due_scheduler_jobs(
        db,
        actor=actor,
        limit=body.limit,
        quiet_policy=body.quiet_policy,
        channel=body.channel,
    )
    return result


@router.post("/notifications/trigger", response_model=NotificationTriggerResponse)
def trigger_notification(
    body: NotificationTriggerRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> NotificationTriggerResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:write:/notifications/trigger", 60)
    require_owner_or_admin(actor)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    row = (
        db.query(MealSchedulerJob)
        .filter(MealSchedulerJob.job_id == body.job_id, MealSchedulerJob.tenant_id == actor.tenant_id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="JOB_NOT_FOUND")

    row.attempts = int(row.attempts or 0) + 1
    row.status = "sent"
    row.sent_at = _utcnow()
    db.commit()
    db.refresh(row)

    delivery_id = make_uuid()
    log_event(
        db,
        actor=actor,
        event_name="post_check_sent",
        meal_id=row.meal_id,
        payload={
            "job_id": row.job_id,
            "job_type": row.job_type,
            "channel": body.channel,
            "attempt": row.attempts,
        },
    )
    response = {"delivery_id": delivery_id, "status": "sent", "attempt": row.attempts}
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.get("/summaries/weekly", response_model=WeeklySummaryResponse)
def get_weekly_summary(
    week_start: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
) -> WeeklySummaryResponse:
    enforce_rate_limit(f"{actor.user_id}:read:/summaries/weekly", 30)
    if week_start is None:
        today = _utcnow().date()
        week_start = today - timedelta(days=today.weekday())

    summary = summarize_week(db, actor=actor, week_start=week_start)
    log_event(
        db,
        actor=actor,
        event_name="weekly_summary_viewed",
        payload={"week_start": week_start.isoformat()},
    )
    return summary


@router.post("/consents", response_model=ConsentResponse)
def upsert_consent(
    body: ConsentUpsertRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
) -> ConsentResponse | JSONResponse:
    enforce_rate_limit(f"{actor.user_id}:write:/consents", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    row = ConsentLog(
        consent_id=make_uuid(),
        tenant_id=actor.tenant_id,
        user_id=actor.user_id,
        consent_type=body.consent_type,
        version=body.version,
        granted=body.granted,
        metadata_json=body.metadata_json or {},
    )
    db.add(row)
    db.commit()

    log_audit(
        db,
        actor=actor,
        action="consent_upsert",
        target_type="consent_logs",
        target_id=row.consent_id,
        details={"consent_type": body.consent_type, "granted": body.granted},
    )
    response = {"consent_id": row.consent_id, "status": "recorded"}
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


@router.post("/consents/revoke")
def revoke_consent(
    body: ConsentRevokeRequest,
    req: Request,
    db: Session = Depends(get_db),
    actor: Actor = Depends(_get_actor),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    enforce_rate_limit(f"{actor.user_id}:write:/consents/revoke", 60)
    guard = _idempotency_guard(
        db,
        actor=actor,
        req=req,
        payload=body.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    if isinstance(guard, JSONResponse):
        return guard
    idem_key, req_hash = guard

    effective = body.effective_at or _utcnow()
    if effective.tzinfo is None:
        effective = effective.replace(tzinfo=timezone.utc)

    row = (
        db.query(ConsentLog)
        .filter(
            ConsentLog.tenant_id == actor.tenant_id,
            ConsentLog.user_id == actor.user_id,
            ConsentLog.consent_type == body.consent_type,
            ConsentLog.withdrawn_at.is_(None),
        )
        .order_by(ConsentLog.recorded_at.desc())
        .first()
    )
    if row is None:
        row = ConsentLog(
            consent_id=make_uuid(),
            tenant_id=actor.tenant_id,
            user_id=actor.user_id,
            consent_type=body.consent_type,
            version="revoke-auto",
            granted=False,
            metadata_json={},
            withdrawn_at=effective,
        )
        db.add(row)
    else:
        row.withdrawn_at = effective
        row.granted = False
    db.commit()
    db.refresh(row)

    response = {
        "status": "revoked",
        "data_processing": "stopped",
        "deletion_ticket": f"del_{make_uuid()}",
    }
    _store_idempotent(
        db,
        actor=actor,
        req=req,
        idempotency_key=idem_key,
        req_hash=req_hash,
        body=response,
    )
    return response


# Compatibility bridge: existing condition flow can send post-meal dip as behavior_inference.
@router.get("/compat/version-map")
def get_version_map():
    return {
        "estimate_versions": ESTIMATE_VERSIONS,
        "advice_versions": ADVICE_VERSIONS,
        "compatibility": {
            "behavior_inference.post_meal_dip_0_4": "mapped from post-check values",
            "behavior_inference.focus_drop_0_4": "mapped from post-check values",
        },
    }

