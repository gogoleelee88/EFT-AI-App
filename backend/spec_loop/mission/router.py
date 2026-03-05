# Mission API ?쩌챙째??- 챘짱쨍챙/?짜챙/챘짱쨍챙쨍?챘 챗쨈???챘?짭챙쨍??
import logging
import os
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.spec_loop.authz import get_current_user_id_spec
from config.settings import get_settings
from backend.spec_loop.mission import schemas, service
from backend.spec_loop.mission import proof_service
from backend.spec_loop.execution_log_service import log_execution
from backend.spec_loop.models import DayPlan, MissionRun, Task
from backend.spec_loop.validation.execution_log_schema import ExecutionLogEventType
from backend.spec_loop.mission.schemas import (
    MicroActionCreate,
    MicroActionRecommendation,
    MicroActionSuggestRequest,
    MicroActionSuggestResponse,
    MicroActionResponse,
    MissionRecommendResponse,
    MissionTemplateResponse,
    PlanItemInput,
    PlaceCreate,
    PlaceSearchResult,
    PlaceResponse,
    PlaceUpdate,
    TaskClarifyRequest,
    TaskClarifyResponse,
    TaskHistoryResponse,
)

router = APIRouter(prefix="/spec", tags=["mission"])
logger = logging.getLogger(__name__)
_settings = get_settings()


class MissionStartRequest(BaseModel):
    day_id: int
    item_id: Optional[str] = None
    user_id: Optional[str] = None


@router.post("/missions/start")
def start_mission(
    body: MissionStartRequest,
    db: Session = Depends(get_db),
):
    """챘짱쨍챙 ?짚챠 ?챙(run) ?챙쩍?챘? ?챙짹?챘짚."""
    plan = db.query(DayPlan.day_id).filter(DayPlan.day_id == body.day_id, DayPlan.deleted_at.is_(None)).first()
    if not plan:
        raise HTTPException(status_code=404, detail="day_id not found")

    run = MissionRun(
        mission_run_id=uuid4().hex,
        day_id=body.day_id,
        item_id=body.item_id,
        user_id=body.user_id,
        state="started",
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    log_execution(
        db,
        day_id=body.day_id,
        event_type=ExecutionLogEventType.MISSION_START,
    )

    return {
        "mission_run_id": run.mission_run_id,
        "state": run.state,
        "started_at": run.started_at,
    }


@router.post("/mission/proofs/time-check")
def post_time_check_proof(
    plan_date: date = Query(..., alias="plan_date"),
    task_uid: str = Query(..., min_length=1, max_length=128),
    min_seconds: int = Query(10, ge=0, le=600),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id_spec),
):
    scheduled, now = proof_service.verify_time_check(
        db=db,
        user_id=user_id,
        plan_date=plan_date,
        task_uid=task_uid,
        min_seconds=min_seconds,
    )
    row = proof_service.upsert_proof(
        db=db,
        user_id=user_id,
        plan_date=plan_date,
        task_uid=task_uid,
        mission_type="time_check",
        min_seconds=min_seconds,
        scheduled_fire_at_utc=scheduled,
        data_json={"verified_at_utc": now.isoformat()},
        photo_path=None,
    )
    return {"ok": True, "proof_id": row.id}


@router.post("/mission/proofs/photo")
def post_photo_proof(
    plan_date: date = Form(...),
    task_uid: str = Form(...),
    min_seconds: int = Form(10),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id_spec),
):
    scheduled, now = proof_service.verify_time_check(
        db=db,
        user_id=user_id,
        plan_date=plan_date,
        task_uid=task_uid,
        min_seconds=int(min_seconds),
    )
    photo_path = proof_service.save_photo_file(image)
    row = proof_service.upsert_proof(
        db=db,
        user_id=user_id,
        plan_date=plan_date,
        task_uid=task_uid,
        mission_type="photo",
        min_seconds=int(min_seconds),
        scheduled_fire_at_utc=scheduled,
        data_json={
            "filename": image.filename,
            "content_type": image.content_type,
            "verified_at_utc": now.isoformat(),
        },
        photo_path=photo_path,
    )
    return {"ok": True, "proof_id": row.id}


# === ?짜챙 (Place) API ===
@router.get("/places", response_model=list[PlaceResponse])
def list_places(user_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """?짭챙짤???짜챙 챘짧짤챘징 챙징째챠"""
    places = service.get_user_places(db, user_id)
    return places


@router.get("/places/search", response_model=list[PlaceSearchResult])
def search_places(
    q: str = Query(..., min_length=2, max_length=128, description="챙짙쩌챙 ?챘 ?챠쨍 챗짼?챙쨈"),
    size: int = Query(8, ge=1, le=15, description="챘째챠 챗째챙"),
):
    """챙짙쩌챙/?챠쨍챘짧?챗쨍째챘째 ?짜챙 챗짼??(?쨍챘? 챙짠??API ?챘징??."""
    return service.search_places(query=q, size=size)


@router.post("/places", response_model=PlaceResponse, status_code=201)
def create_place(
    data: PlaceCreate, user_id: Optional[str] = Query(None), db: Session = Depends(get_db)
):
    """???짜챙 ?짹챘징"""
    place = service.create_place(db, data, user_id)
    return place


@router.put("/places/{place_id}", response_model=PlaceResponse)
def update_place(
    place_id: int,
    data: PlaceUpdate,
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """?짜챙 ?챘쨀쨈 ?챙"""
    place = service.update_place(db, place_id, data, user_id)
    return place


@router.delete("/places/{place_id}", status_code=204)
def delete_place(
    place_id: int, user_id: Optional[str] = Query(None), db: Session = Depends(get_db)
):
    """?짜챙 ??"""
    service.delete_place(db, place_id, user_id)


# === 챘짱쨍챙쨍?챘 (MicroAction) API ===
@router.get("/micro-actions", response_model=list[MicroActionResponse])
def get_micro_actions(
    task_id: int = Query(..., description="Task ID"),
    user_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    q: Optional[str] = Query(None, description="Search query"),
    include_unused: bool = Query(False, description="Include unused"),
    db: Session = Depends(get_db),
):
    """Task micro actions list."""
    micro_actions = service.get_micro_actions_by_task(
        db, task_id, user_id, limit, search=q, include_unused=include_unused
    )
    return micro_actions


@router.post("/micro-actions", response_model=MicroActionResponse, status_code=201)
def create_micro_action(
    data: MicroActionCreate,
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Create or reuse a micro action for a task."""
    micro_action = service.create_micro_action(
        db=db,
        name=data.name,
        description=data.description,
        start_trigger=data.start_trigger,
        source=data.source,
        est_minutes=data.est_minutes,
        task_id=data.task_id,
        task_title=data.task_title,
        task_est_minutes=data.task_est_minutes,
        user_id=user_id,
    )
    return micro_action


@router.post("/micro-actions/suggest", response_model=MicroActionSuggestResponse)
async def suggest_micro_action_list(
    body: MicroActionSuggestRequest,
):
    """
    Suggest micro actions for the next few plan items.
    Falls back to heuristic recommendations when LLM is unavailable or returns invalid output.
    """
    plan_items = _build_plan_items(body.plan_items)
    recent_micro_actions = [
        _sanitize_title(name)
        for name in (body.recent_micro_actions or [])
        if _sanitize_title(name)
    ]

    suggestions: Optional[list[dict]] = None
    if os.getenv("OPENAI_API_KEY") and plan_items:
        try:
            from services.chatgpt_service import suggest_micro_actions as ai_suggest

            result = await ai_suggest(
                plan_items=plan_items,
                mission_type=body.mission_type,
                recent_micro_actions=recent_micro_actions,
            )
            suggestions = _normalize_suggestions(result)
        except Exception:
            logger.exception("micro-actions/suggest failed")

    if suggestions is None:
        suggestions = _fallback_micro_action_suggestions(plan_items)

    return MicroActionSuggestResponse(suggestions=suggestions)


@router.post("/micro-actions/recommend", response_model=list[MicroActionRecommendation])
async def recommend_micro_action_list(
    task_title: str = Query(...),
    task_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """Legacy-friendly alias for micro action recommendations."""
    title = _sanitize_title(task_title)
    if not title:
        raise HTTPException(status_code=422, detail="task_title is required")

    recommendations: Optional[list[dict]] = None
    if os.getenv("OPENAI_API_KEY"):
        try:
            from services.chatgpt_service import recommend_micro_actions as ai_recommend

            task_context: Optional[dict[str, object]] = None
            if task_id is not None:
                task = db.query(Task).filter(Task.task_id == task_id).first()
                if task:
                    task_context = {"task_title": task.title, "task_id": task.task_id}
            result = await ai_recommend(task_title=title, task_context=task_context)
            recommendations = _normalize_micro_action_recommendations(result)
        except Exception:
            logger.exception("micro-actions/recommend failed")

    if recommendations is None:
        recommendations = _fallback_micro_action_recommendations(title)

    return [MicroActionRecommendation(**item) for item in recommendations]


@router.post("/missions/recommend", response_model=MissionRecommendResponse)
async def recommend_mission_list(
    task_title: str = Query(...),
    micro_action_name: str = Query(...),
    start_trigger: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Recommend mission set based on task title and micro action."""
    title = _sanitize_title(task_title)
    micro_action = _sanitize_title(micro_action_name)
    if not title:
        raise HTTPException(status_code=422, detail="task_title is required")
    if not micro_action:
        raise HTTPException(status_code=422, detail="micro_action_name is required")

    recommendations: Optional[dict[str, object]] = None
    user_places: Optional[list[dict[str, object]]] = None
    if user_id:
        places = service.get_user_places(db, user_id)
        user_places = [
            {
                "place_id": place.place_id,
                "name": place.name,
                "address": place.address,
                "verification_method": place.verification_method,
            }
            for place in places
        ]

    if os.getenv("OPENAI_API_KEY"):
        try:
            from services.chatgpt_service import recommend_missions as ai_recommend

            raw = await ai_recommend(
                task_title=title,
                micro_action_name=micro_action,
                start_trigger=start_trigger,
                user_places=user_places,
            )
            recommendations = _normalize_mission_recommendations(raw)
        except Exception:
            logger.exception("missions/recommend failed")

    if recommendations is None:
        recommendations = _fallback_mission_recommendations(title, micro_action)

    return MissionRecommendResponse(**recommendations)


def _sanitize_title(title: str) -> str:
    import re

    value = (title or '').strip()
    value = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "[email]", value)
    value = re.sub(r"https?://\S+|www\.\S+", "[link]", value)
    value = re.sub(r"\d{6,}", "[number]", value)
    return value[:80]


def _format_time(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        from datetime import datetime

        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.strftime('%H:%M')
    except Exception:
        return value[:16]


def _build_plan_items(items: list[PlanItemInput]) -> list[dict]:
    sanitized = []
    for item in items:
        title = _sanitize_title(item.title)
        if not title:
            continue
        sanitized.append(
            {
                'title': title,
                'start': _format_time(item.start),
                'end': _format_time(item.end),
            }
        )
    return sanitized[:6]


def _normalize_suggestions(payload: object) -> Optional[list[dict]]:
    if not isinstance(payload, dict):
        return None
    raw = payload.get('suggestions')
    if not isinstance(raw, list):
        return None
    cleaned: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get('title', '')).strip()
        why = str(item.get('why', '')).strip()
        trigger = str(item.get('trigger', '')).strip()
        duration_raw = item.get('duration_min')
        try:
            duration_min = int(duration_raw)
        except Exception:
            duration_min = None
        if not title or not why or not trigger or duration_min is None:
            continue
        duration_min = max(1, min(15, duration_min))
        cleaned.append(
            {
                'title': title[:64],
                'why': why[:200],
                'duration_min': duration_min,
                'trigger': trigger[:64],
            }
        )
    if len(cleaned) < 3:
        return None
    return cleaned[:3]


def _normalize_micro_action_recommendations(payload: object) -> Optional[list[dict]]:
    if not isinstance(payload, dict):
        return None

    raw = payload.get("recommendations")
    if not isinstance(raw, list):
        return None

    cleaned: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue

        name = str(item.get("name", "")).strip()
        description = str(item.get("description", "")).strip()
        start_trigger = item.get("start_trigger")
        if start_trigger is not None:
            start_trigger = str(start_trigger).strip() or None

        try:
            est_minutes = int(item.get("est_minutes"))
        except Exception:
            est_minutes = None

        if not name or not description or est_minutes is None:
            continue

        est_minutes = max(1, min(120, est_minutes))
        cleaned.append(
            {
                "name": name[:80],
                "description": description[:512],
                "start_trigger": start_trigger,
                "est_minutes": est_minutes,
            }
        )

    if len(cleaned) < 1:
        return None
    return cleaned[:3]


def _detect_task_issues(title: str) -> list[str]:
    import re

    issues: list[str] = []
    trimmed = (title or "").strip()
    if not trimmed:
        return ["입력한 내용이 비어 있습니다."]

    if len(trimmed) < 6:
        issues.append("제목이 너무 짧아 구체적으로 작성해 주세요.")

    has_quantity = bool(
        re.search(r"\d+\s*(번|개|회|시간|분|초|단계|세트|회차)\s*(내|씩)?", trimmed)
    )
    if not has_quantity:
        issues.append("숫자(횟수/시간)가 없어 실행 단위를 추정할 수 없습니다.")

    vague_keywords = [
        "아무",
        "그냥",
        "적당히",
        "해줘",
        "좀",
        "요청",
        "부탁",
        "도움",
        "기록",
        "좋은",
        "추천",
        "계획",
        "이렇게",
        "뭐",
        "필요",
    ]
    if not has_quantity and any(word in trimmed for word in vague_keywords):
        issues.append("내용이 추상적입니다. 목표량/횟수/시간을 명확히 적어 주세요.")

    return list(dict.fromkeys(issues))

def _shorten_topic(title: str) -> str:
    value = (title or "").strip()
    if not value:
        return "?짚챘 ?쩌챙"
    if len(value) <= 12:
        return value
    return value[:12]


def _fallback_task_clarify_suggestions(title: str) -> list[dict]:
    topic = _shorten_topic(title)
    return [
        {
            "title": f"{topic} ?쨉챙짭 3챗째??챙쩍 챘짤챘짧짢 ?챙짹"[:40],
            "reason": "?챙 챗짼째챗쨀쩌챗째 ?짢챙쩌챘짤??짚챙 ?챘???짭챙?쨍챙.",
        },
        {
            "title": f"{topic} 20챘쨋?챙짠챙짚 ??3챙짚??챗쨀"[:40],
            "reason": "챙짠짠챗짼 챙짠챙짚?챗쨀 ?챗쨀?챘짤쨈 ?챘짝???쨈챙쨈?쨍챙.",
        },
        {
            "title": f"{topic} ?챘짙 1챗째??쩍챗쨀 5챙짚??챘짝짭"[:40],
            "reason": "?챗짼 ?챙?쨈챘 챙짠챙 ?짜챘짼쩍?????쨍챙.",
        },
    ]


def _normalize_clarify_suggestions(payload: object) -> Optional[list[dict]]:
    if not isinstance(payload, dict):
        return None
    raw = payload.get("rewrite_suggestions") or payload.get("suggestions")
    if not isinstance(raw, list):
        return None
    cleaned: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        reason = str(item.get("reason", "")).strip()
        if not title or not reason:
            continue
        cleaned.append(
            {
                "title": title[:80],
                "reason": reason[:200],
            }
        )
    if len(cleaned) < 3:
        return None
    return cleaned[:3]


def _fallback_micro_action_suggestions(plan_items: list[dict]) -> list[dict]:
    topic = plan_items[0]["title"] if plan_items else "작업"
    return [
        {
            "title": f"{topic} 긴장 푸는 호흡 2분"[:28],
            "why": "호흡을 2분 정도 먼저 하면 곧바로 진입이 쉬워집니다.",
            "duration_min": 2,
            "trigger": "긴장감이 올라올 때",
        },
        {
            "title": "5분 전 정리 스트레칭",
            "why": "작업 전 가볍게 스트레칭하면 집중 전환이 빨라집니다.",
            "duration_min": 5,
            "trigger": "작업 시작 5분 전",
        },
        {
            "title": "마음가다짐 3회",
            "why": "마음속으로 목표를 3번 반복해 집중 상태를 정돈합니다.",
            "duration_min": 3,
            "trigger": "머리가 분산될 때",
        },
    ]
def _fallback_micro_action_recommendations(task_title: str) -> list[dict]:
    """기본 micro-action 추천을 생성한다."""
    task_lower = task_title.lower()

    if "email" in task_lower or "메시지" in task_lower:
        return [
            {
                "name": "초안 먼저 1문장 작성",
                "description": "요지를 먼저 정리한 뒤 본문을 1~2단락으로 압축해 씁니다.",
                "start_trigger": "작성 시작 전",
                "est_minutes": 5,
            },
            {
                "name": "답장 3항목 체크",
                "description": "필수 내용/기한/요청사항을 3줄로 체크해 반영합니다.",
                "start_trigger": "문장 완성 직전",
                "est_minutes": 10,
            },
            {
                "name": "발송 전 맞춤법 확인",
                "description": "맞춤법/오탈자와 톤을 확인하고 최종 발송합니다.",
                "start_trigger": "발송 직전",
                "est_minutes": 8,
            },
        ]
    else:
        return [
            {
                "name": "핵심 2분 정리",
                "description": "먼저 핵심만 2분 동안 적어 목표를 고정합니다.",
                "start_trigger": "작업 직후",
                "est_minutes": 2,
            },
            {
                "name": "우선순위 1개 선택",
                "description": "당장 할 수 있는 첫 번째 동작 1개에 집중합니다.",
                "start_trigger": "시작이 막힐 때",
                "est_minutes": 3,
            },
            {
                "name": "작은 마감 설정",
                "description": "현재 블록을 벗어나기 위한 짧은 마감 시점을 잡습니다.",
                "start_trigger": "10분 경과 후",
                "est_minutes": 5,
            },
        ]
def _fallback_mission_recommendations(task_title: str, micro_action_name: str) -> dict:
    """기본 미션 추천 폴백 응답을 생성한다."""
    return {
        "photo_options": [
            {
                "label": "업무 전 정리 컷",
                "description": "책상/노트/필기구를 활용해 시작 환경을 정돈하세요.",
                "verification_description": "작업 시작 전 정돈된 환경인지 확인합니다.",
                "config": {
                    "requirement": "정돈된 책상, 노트, 물병",
                    "description": "간단한 정비만으로도 시작 난이도를 낮춥니다.",
                    "objects_required": ["desk", "notebook", "pen"],
                    "verification_method": "시작 전 환경 체크",
                },
            }
        ],
        "location_suggestion": {
            "recommendation": "조명이 충분한 조용한 책상 앞"
        },
        "time_suggestion": {
            "recommended_time": "19:00",
            "check_type": "screen_capture",
            "reason": "짧은 루틴 수행에 적절한 시점입니다.",
        },
    }


def _normalize_mission_recommendations(payload: object) -> Optional[dict[str, object]]:
    """Normalize AI mission recommendation payload into safe response format."""
    if not isinstance(payload, dict):
        return None

    raw_photo = payload.get("photo_options")
    photo_candidates: list[dict[str, object]] = []
    if isinstance(raw_photo, list):
        for item in raw_photo:
            if not isinstance(item, dict):
                continue

            label = str(item.get("label", "")).strip()[:80]
            description = str(item.get("description", "")).strip()[:300]
            verification_description = str(
                item.get("verification_description", "")
            ).strip()[:300]
            config_raw = item.get("config")
            if not isinstance(config_raw, dict):
                continue

            requirement = str(config_raw.get("requirement", "")).strip()
            if not (label and description and verification_description and requirement):
                continue

            try:
                config = {
                    "requirement": requirement,
                    "description": _safe_optional_str(config_raw.get("description"), limit=300),
                    "ocr_keywords": _safe_optional_list(config_raw.get("ocr_keywords")),
                    "objects_required": _safe_optional_list(config_raw.get("objects_required")),
                    "verification_method": _safe_optional_str(config_raw.get("verification_method"), limit=80),
                    "example_image_url": _safe_optional_str(
                        config_raw.get("example_image_url"), limit=255
                    ),
                }
                photo_candidates.append(
                    {
                        "label": label,
                        "description": description,
                        "verification_description": verification_description,
                        "config": {k: v for k, v in config.items() if v is not None},
                    }
                )
            except Exception:
                logger.exception("failed to normalize mission recommendation photo option")

            if len(photo_candidates) >= 3:
                break

    location_raw = payload.get("location_suggestion")
    location_suggestion: Optional[dict[str, str]] = None
    if isinstance(location_raw, dict):
        recommendation = str(location_raw.get("recommendation", "")).strip()
        if recommendation:
            location_suggestion = {"recommendation": recommendation}

    time_raw = payload.get("time_suggestion")
    time_suggestion: Optional[dict[str, object]] = None
    if isinstance(time_raw, dict):
        recommended_time = str(time_raw.get("recommended_time", "")).strip()
        if recommended_time:
            time_suggestion = {
                "recommended_time": recommended_time[:16],
                "check_type": str(time_raw.get("check_type", "screen_capture")).strip(),
                "reason": str(time_raw.get("reason", "")).strip()[:300] or None,
            }

    normalized: dict[str, object] = {}
    if photo_candidates:
        normalized["photo_options"] = photo_candidates[:3]
    if location_suggestion:
        normalized["location_suggestion"] = location_suggestion
    if time_suggestion:
        normalized["time_suggestion"] = time_suggestion

    if not normalized:
        return None
    return normalized


def _safe_optional_str(value: object, *, limit: int = 255) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:limit]


def _safe_optional_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [
        text.strip()
        for text in (str(item).strip() for item in value)
        if text.strip()
    ]


@router.post("/tasks/clarify", response_model=TaskClarifyResponse)
async def clarify_task_title(body: TaskClarifyRequest):
    """Clarify ambiguous task titles with rule + LLM fallback."""
    title = _sanitize_title(body.title)
    issues = _detect_task_issues(title)
    is_ambiguous = len(issues) > 0

    recent_tasks = [
        _sanitize_title(name)
        for name in (body.recent_tasks or [])
        if _sanitize_title(name)
    ]
    recent_micro_actions = [
        _sanitize_title(name)
        for name in (body.recent_micro_actions or [])
        if _sanitize_title(name)
    ]

    suggestions: Optional[list[dict]] = None
    if is_ambiguous and os.getenv("OPENAI_API_KEY"):
        try:
            from services.chatgpt_service import (
                clarify_task_title as chatgpt_clarify_task,
            )

            result = await chatgpt_clarify_task(
                title=title,
                mission_type=body.mission_type,
                issues=issues,
                recent_tasks=recent_tasks,
                recent_micro_actions=recent_micro_actions,
            )
            suggestions = _normalize_clarify_suggestions(result)
        except Exception:
            logger.exception("tasks/clarify failed")

    if suggestions is None:
        suggestions = _fallback_task_clarify_suggestions(title)

    return TaskClarifyResponse(
        is_ambiguous=is_ambiguous,
        issues=issues,
        rewrite_suggestions=suggestions,
    )


# === Task 챙쨉챗쨌쩌 ?쨈챘짜 API ===
@router.get("/tasks/recent", response_model=list[TaskHistoryResponse])
def get_recent_tasks(
    user_id: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """챙쨉챗쨌쩌 ?짭챙짤??Task 챘짧짤챘징 (?짹챗쨀쨉챘짜??짭챠짢)"""
    tasks = service.get_recent_tasks(db, user_id, limit)
    return tasks



