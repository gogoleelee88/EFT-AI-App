from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from backend.app.services.auth_helpers import get_current_user_id
from backend.database import get_db
from menstrual import service
from menstrual.schemas import (
    BleedingLogRequest,
    CalendarResponse,
    ExportJobRequest,
    ExportJobResponse,
    ExportJobStatusResponse,
    InsightsResponse,
    JournalLogRequest,
    JournalSearchResponse,
    MedsLogRequest,
    PMDDLiteLogRequest,
    PredictionResponse,
    PrivacySettingsResponse,
    PrivacySettingsUpdateRequest,
    RecordResponse,
    SymptomsLogRequest,
    TriggerLogRequest,
)

router = APIRouter(prefix="/v1/menstrual", tags=["menstrual"])


@router.post("/bleeding", response_model=RecordResponse)
def post_bleeding(
    body: BleedingLogRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> RecordResponse:
    return service.log_bleeding(db, user_id, body)


@router.post("/symptoms", response_model=RecordResponse)
def post_symptoms(
    body: SymptomsLogRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> RecordResponse:
    return service.log_symptoms(db, user_id, body)


@router.post("/pmdd-lite")
def post_pmdd_lite(
    body: PMDDLiteLogRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> dict[str, object]:
    record, score = service.log_pmdd_lite(db, user_id, body)
    return {
        "recorded": True,
        "event": record.model_dump(),
        "score": score.model_dump(),
    }


@router.post("/triggers", response_model=RecordResponse)
def post_trigger(
    body: TriggerLogRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> RecordResponse:
    return service.log_trigger(db, user_id, body)


@router.post("/meds", response_model=RecordResponse)
def post_meds(
    body: MedsLogRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> RecordResponse:
    return service.log_meds(db, user_id, body)


@router.post("/journal", response_model=RecordResponse)
def post_journal(
    body: JournalLogRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> RecordResponse:
    return service.log_journal(db, user_id, body)


@router.get("/journal", response_model=JournalSearchResponse)
def get_journal(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    tag: str | None = None,
    min_severity: int | None = Query(default=None, alias="minSeverity", ge=0, le=4),
    q: str | None = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> JournalSearchResponse:
    return service.search_journal(
        db,
        user_id,
        from_date=from_date,
        to_date=to_date,
        tag=tag,
        min_severity=min_severity,
        q=q,
    )


@router.get("/calendar", response_model=CalendarResponse)
def get_calendar(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> CalendarResponse:
    return service.get_calendar(db, user_id, from_date, to_date)


@router.get("/prediction", response_model=PredictionResponse)
def get_prediction(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> PredictionResponse:
    return service.get_prediction(db, user_id)


@router.get("/insights", response_model=InsightsResponse)
def get_insights(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> InsightsResponse:
    return service.get_insights(db, user_id, from_date, to_date)


@router.post("/export", response_model=ExportJobResponse)
def post_export(
    body: ExportJobRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> ExportJobResponse:
    return service.create_export_job(db, user_id, body)


@router.get("/export/{job_id}", response_model=ExportJobStatusResponse)
def get_export_job(
    job_id: str,
    format: str | None = Query(default=None, pattern="^(csv|pdf)$"),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    if format:
        content, media_type, filename = service.get_export_file(db, user_id, job_id, format)
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )
    return service.get_export_job_status(db, user_id, job_id)


@router.get("/settings", response_model=PrivacySettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> PrivacySettingsResponse:
    return service.get_privacy_settings(db, user_id)


@router.patch("/settings", response_model=PrivacySettingsResponse)
def patch_settings(
    body: PrivacySettingsUpdateRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
) -> PrivacySettingsResponse:
    return service.update_privacy_settings(db, user_id, body)

