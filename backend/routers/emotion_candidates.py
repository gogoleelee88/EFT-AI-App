import redis

import os
from supabase import create_client

from fastapi import APIRouter, Cookie, HTTPException
from services.emotion_candidates_service import get_emotion_candidates
from routers.compare import SessionState
import json

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from models.chat_models import StrictIntakeInput
from core.theme_recommender import get_theme_recommender
from types.guidance_schema import ThemeRecommendation
from services.auth_service import AuthService
from services.emotion_insight_service import (
    generate_emotion_adaptive_report_bundle,
    generate_emotion_weekly_report_bundle,
    generate_emotion_insight_bundle,
)
from config.settings import get_settings
from services.chatgpt_service import get_openai_client



def _get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
except Exception as e:
    redis_client = None


router = APIRouter(prefix="/api/emotion", tags=["emotion"])
auth_service = AuthService()


def _decode_user_id_from_cookie(access_token: Optional[str]) -> Optional[str]:
    if not access_token:
        return None
    try:
        payload = auth_service.decode_jwt(access_token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        return user_id if isinstance(user_id, str) and user_id else None
    except Exception:
        return None


def _resolve_user_id(explicit_user_id: Optional[str], access_token: Optional[str]) -> Optional[str]:
    if explicit_user_id and explicit_user_id.strip():
        return explicit_user_id.strip()
    return _decode_user_id_from_cookie(access_token)


def _require_authenticated_user_id(access_token: Optional[str]) -> str:
    user_id = _decode_user_id_from_cookie(access_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user_id


class EmotionCheckinRequest(BaseModel):
    """Í∞êÏ†ï Ï≤¥ÌÅ¨???îÏ≤≠. ?ÑÎ°†???òÏßë ??™©(7~8Í∞?Í≥?1:1 Îß§Ïπ≠."""
    session_id: str
    session_type: Literal["eftar", "meditation"] | None = None
    user_id: str | None = None
    core_emotion: str
    situation_context: str
    automatic_thought: str
    physical_sensation: str | None = None
    coping_attempt: str | None = None  # ?ÑÎ°†??behavioral_reaction ?????ÑÎìúÎ°??ÑÏÜ°
    immediate_goal: str | None = None
    intensity_before: int
    plan_start_resistance: str | None = None
    available_time: int | None = None  # ?¨Ïö© Í∞Ä???úÍ∞Ñ(Î∂?. ?ÑÎ°†??8Î≤àÏß∏ ??™©


@router.post("/checkin")
def save_emotion_checkin(
    payload: EmotionCheckinRequest,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
):
    """
    Í∞êÏ†ï Ï≤¥ÌÅ¨???Ä?? Í∏∞Ï°¥ ?ëÎãµ??theme_recommendations, default_theme_id Optional Ï∂îÍ?.
    """
    try:
        sb = _get_supabase()
        resolved_user_id = _resolve_user_id(payload.user_id, access_token)
        data = payload.model_dump(exclude_none=True)
        if resolved_user_id:
            data["user_id"] = resolved_user_id
        try:
            sb.table("emotion_checkins").insert(data).execute()
        except Exception as e:
            if "session_type" in str(e).lower():
                data_no_session_type = {k: v for k, v in data.items() if k != "session_type"}
                sb.table("emotion_checkins").insert(data_no_session_type).execute()
            else:
                raise
        out: Dict[str, Any] = {"ok": True}
        try:
            intake = StrictIntakeInput(
                core_emotion=payload.core_emotion,
                situation_context=payload.situation_context,
                automatic_thought=payload.automatic_thought,
                physical_sensation=payload.physical_sensation,
                behavioral_reaction=payload.coping_attempt,
                intensity=payload.intensity_before,
                immediate_goal=payload.immediate_goal,
                available_time=payload.available_time,
            )
            # MODULE_MODE=lite: Í∑úÏπô Í∏∞Î∞ò / pro: LLM Í∏∞Î∞ò + Rule fallback
            recommender = get_theme_recommender()
            themes, default_theme_id, decision_trace = recommender.recommend(intake, intent=None)
            out["theme_recommendations"] = [t.model_dump() for t in themes]
            out["default_theme_id"] = default_theme_id
            out["decision_trace"] = decision_trace
        except Exception as theme_err:
            out["theme_recommendations"] = None
            out["default_theme_id"] = None
            out["decision_trace"] = None
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save emotion checkin: {e}")

class EmotionCandidatesRequest(BaseModel):
    session_id: str

class EmotionCandidatesResponse(BaseModel):
    message: str
    candidates: List[Dict[str, Any]]
    core_emotion_hypothesis: Optional[str] = None
    reasoning: Optional[str] = None

@router.post("/candidates", response_model=EmotionCandidatesResponse)
async def emotion_candidates(req: EmotionCandidatesRequest):

    # ‚≠??∏ÏÖò ?ÅÌÉú Î∂àÎü¨?§Í∏∞
    raw = redis_client.get(f"session:compare:{req.session_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Session not found")
    state = SessionState(**json.loads(raw))

    intake = {item.key: item.value for item in state.checklist}

    # ?åü ?òÏù¥Î∏åÎ¶¨??LLM ?ÑÎ≥¥ Ï∂îÏ∂ú
    inference_list = await get_emotion_candidates(
        user_input=intake.get("situation_context") or "",
        strict6_output=intake,
        engine="b"
    )

    if not inference_list:
        return EmotionCandidatesResponse(
            message="∞®¡§ »ƒ∫∏ √ﬂ∑– ∞·∞˙∞° æ¯æÓ ±‚∫ª∞™¿ª π›»Ø«’¥œ¥Ÿ.",
            candidates=[{
                "label": "unknown",
                "reason": "∏µ® »ƒ∫∏∞° æ¯æÓ ±‚∫ª ∂Û∫ß∑Œ √ﬂ¡§«’¥œ¥Ÿ.",
                "confidence": 0.5,
            }]
        )

    candidates_out = [{
        "label": c.label,
        "reason": c.reason,
        "confidence": c.confidence,
    } for c in inference_list]

    return EmotionCandidatesResponse(
        message="√ﬂ∑– »ƒ∫∏∏¶ ±‚π›¿∏∑Œ ∞®¡§ »ƒ∫∏∏¶ ±∏º∫«ﬂΩ¿¥œ¥Ÿ.",
        candidates=candidates_out,
        core_emotion_hypothesis=inference_list[0].label,
        reasoning=inference_list[0].reason
    )


class EmotionCheckinSummary(BaseModel):
    id: int
    created_at: datetime
    core_emotion: str
    situation_context: str
    automatic_thought: str
    physical_sensation: Optional[str] = None
    coping_attempt: Optional[str] = None
    immediate_goal: Optional[str] = None
    intensity: int = Field(..., description="?∏ÏÖò ?úÏûë ??Í∞ïÎèÑ (intensity_before)")


class EmotionStatsResponse(BaseModel):
    total_records: int
    emotion_distribution: Dict[str, int]
    average_intensity: float


class EmotionInsightCard(BaseModel):
    title: str
    detail: str
    confidence: float = Field(..., ge=0.0, le=1.0)


class EmotionInsightsResponse(BaseModel):
    total_records: int
    dominant_emotions: List[str]
    average_intensity: float
    trend: str
    insight_summary: str
    pattern_cards: List[EmotionInsightCard]
    recommended_actions: List[str]
    generated_at: datetime
    source: str
    model: str


class EmotionAdaptiveReportResponse(BaseModel):
    template_type: str
    template_title: str
    total_records: int
    confidence: float = Field(..., ge=0.0, le=1.0)
    source: str
    model: str
    generated_at: datetime
    summary_text: str
    fields: Dict[str, Any]


class EmotionWeeklyReportResponse(BaseModel):
    template_type: str
    template_title: str
    week_start: datetime
    week_end: datetime
    total_records: int
    confidence: float = Field(..., ge=0.0, le=1.0)
    source: str
    model: str
    generated_at: datetime
    summary_text: str
    recommendations: List[str] = Field(default_factory=list)
    fields: Dict[str, Any]


class SessionAdviceRequest(BaseModel):
    session_type: Literal["eftar", "meditation"]
    strict_intake: StrictIntakeInput
    intensity_before: int = Field(..., ge=0, le=10)
    intensity_after: int = Field(..., ge=0, le=10)
    selected_theme_id: Optional[str] = None
    selected_video_title: Optional[str] = None


class SessionAdviceResponse(BaseModel):
    advice: str
    delta: int
    source: str
    model: str


def _fallback_session_advice(payload: SessionAdviceRequest) -> SessionAdviceResponse:
    delta = payload.intensity_before - payload.intensity_after
    mode_label = "EFT" if payload.session_type == "eftar" else "Î™ÖÏÉÅ"

    if delta >= 3:
        advice = (
            f"{mode_label} ??Í∞êÏ†ï Í∞ïÎèÑÍ∞Ä {delta}????ïÑÏ°åÏñ¥?? ?®Í≥ºÍ∞Ä ?ïÏù∏???®ÌÑ¥?¥Îãà, "
            "?§Îäò?Ä Í∞ôÏ? Î∞©Ïãù?ºÎ°ú 1????ÏßßÍ≤å Î∞òÎ≥µ??Î™∏Ïù¥ ?àÏ†ï?òÎäî Í∞êÍ∞Å??Í≥†Ï†ï??Î≥¥ÏÑ∏??"
        )
    elif delta >= 1:
        advice = (
            f"{mode_label} ??Í∞êÏ†ï Í∞ïÎèÑÍ∞Ä Ï°∞Í∏à ??ïÑÏ°åÏñ¥?? ÏßÄÍ∏??ÅÌÉú?êÏÑú 2Î∂??∏Ìù° ?ïÎ¶¨?Ä ?®Íªò "
            "?®ÏïÑ ?àÎäî ?ùÍ∞Å????Î¨∏Ïû•?ºÎ°ú ?ÅÏúºÎ©??àÏ†ï?????§ÎûòÍ∞ëÎãà??"
        )
    elif delta == 0:
        advice = (
            f"{mode_label} ???êÏàò Î≥Ä?îÍ? Í±∞Ïùò ?ÜÏóà?¥Ïöî. Í∞ïÎèÑÍ∞Ä ?†Ï????åÎäî "
            "?êÍ∑π Î¨∏Ïû•????Íµ¨Ï≤¥?îÌï¥??1?ºÏö¥??Ï∂îÍ??òÍ±∞?? ?òÍ≤Ω ?êÍ∑π??Ï§ÑÏù∏ ???§Ïãú ?úÎèÑ??Î≥¥ÏÑ∏??"
        )
    else:
        advice = (
            f"{mode_label} ???§Ìûà??Í∞ïÎèÑÍ∞Ä ?¨ÎùºÍ∞îÏñ¥?? ÏßÄÍ∏àÏ? Ï∂îÍ? ?êÍ∑π??Î©àÏ∂îÍ≥? "
            "Ï≤úÏ≤ú???∏Ìù°?òÎ©∞ ?àÏ†ÑÍ∞êÎ????åÎ≥µ???§Ïùå ÏßßÏ? ?∏ÏÖò?ºÎ°ú ?¨Ïãú?ëÌïò??Í≤ÉÏù¥ Ï¢ãÏäµ?àÎã§."
        )

    return SessionAdviceResponse(
        advice=advice,
        delta=delta,
        source="fallback",
        model="rule_based",
    )


@router.get("/recent", response_model=List[EmotionCheckinSummary])
def get_recent_emotion_checkins(
    limit: int = 5,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> List[EmotionCheckinSummary]:
    """
    ÏµúÍ∑º STRICT Í∞êÏ†ï ?∏ÌÖå?¥ÌÅ¨(emotion_checkins) Í∏∞Î°ù??Ï°∞Ìöå.
    ?Ä?úÎ≥¥??'ÏµúÍ∑º Í∞êÏ†ï ?∏ÏÖò' Ïπ¥Îìú?êÏÑú ?¨Ïö©.
    """
    try:
        sb = _get_supabase()
        resolved_user_id = _require_authenticated_user_id(access_token)
        query = (
            sb.table("emotion_checkins")
            .select("*")
            .order("created_at", desc=True)
            .limit(max(1, min(limit, 20)))
        )
        query = query.eq("user_id", resolved_user_id)
        res = query.execute()
        rows: List[Dict[str, Any]] = getattr(res, "data", None) or []

        summaries: List[EmotionCheckinSummary] = []
        for r in rows:
            created_raw = r.get("created_at") or r.get("inserted_at") or datetime.utcnow().isoformat()
            created_at = datetime.fromisoformat(str(created_raw).replace("Z", "+00:00"))
            summaries.append(
                EmotionCheckinSummary(
                    id=int(r.get("id")),
                    created_at=created_at,
                    core_emotion=r.get("core_emotion") or "",
                    situation_context=r.get("situation_context") or "",
                    automatic_thought=r.get("automatic_thought") or "",
                    physical_sensation=r.get("physical_sensation"),
                    coping_attempt=r.get("coping_attempt"),
                    immediate_goal=r.get("immediate_goal"),
                    intensity=int(r.get("intensity_before") or 0),
                )
            )
        return summaries
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load recent emotion checkins: {e}")


@router.get("/session/{session_id}", response_model=EmotionCheckinSummary)
def get_emotion_session(
    session_id: int,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> EmotionCheckinSummary:
    """
    ?®Ïùº Í∞êÏ†ï ?∏ÏÖò(emotion_checkins) 1Í±?Ï°∞Ìöå. ?ÅÏÑ∏ ?îÎ©¥??
    """
    try:
        sb = _get_supabase()
        resolved_user_id = _require_authenticated_user_id(access_token)
        query = (
            sb.table("emotion_checkins")
            .select("*")
            .eq("id", session_id)
            .limit(1)
        )
        query = query.eq("user_id", resolved_user_id)
        res = query.execute()
        rows: List[Dict[str, Any]] = getattr(res, "data", None) or []
        if not rows:
            raise HTTPException(status_code=404, detail="Session not found")
        r = rows[0]
        created_raw = r.get("created_at") or r.get("inserted_at") or datetime.utcnow().isoformat()
        created_at = datetime.fromisoformat(str(created_raw).replace("Z", "+00:00"))
        return EmotionCheckinSummary(
            id=int(r.get("id")),
            created_at=created_at,
            core_emotion=r.get("core_emotion") or "",
            situation_context=r.get("situation_context") or "",
            automatic_thought=r.get("automatic_thought") or "",
            physical_sensation=r.get("physical_sensation"),
            coping_attempt=r.get("coping_attempt"),
            immediate_goal=r.get("immediate_goal"),
            intensity=int(r.get("intensity_before") or 0),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load emotion session: {e}")


@router.get("/stats", response_model=EmotionStatsResponse)
def get_emotion_stats(
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> EmotionStatsResponse:
    """
    emotion_checkins Í∏∞Î∞ò Í∏∞Î≥∏ ?µÍ≥Ñ.
    """
    try:
        sb = _get_supabase()
        resolved_user_id = _require_authenticated_user_id(access_token)
        query = sb.table("emotion_checkins").select("*").eq("user_id", resolved_user_id)
        res = query.execute()
        rows: List[Dict[str, Any]] = getattr(res, "data", None) or []

        total = len(rows)
        if total == 0:
            return EmotionStatsResponse(
                total_records=0,
                emotion_distribution={},
                average_intensity=0.0,
            )

        # Í∞êÏ†ï Î∂ÑÌè¨ + ?âÍ∑† Í∞ïÎèÑ
        dist: Dict[str, int] = {}
        intensities: List[int] = []
        for r in rows:
            ce = r.get("core_emotion") or "Í∏∞Ì?"
            dist[ce] = dist.get(ce, 0) + 1
            intensities.append(int(r.get("intensity_before") or 0))

        avg_intensity = sum(intensities) / max(1, len(intensities))

        return EmotionStatsResponse(
            total_records=total,
            emotion_distribution=dist,
            average_intensity=round(avg_intensity, 2),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load emotion stats: {e}")


@router.get("/insights", response_model=EmotionInsightsResponse)
async def get_emotion_insights(
    limit: int = 30,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> EmotionInsightsResponse:
    """
    OpenAI Í∏∞Î∞ò Í∞êÏ†ï ?®ÌÑ¥/?µÏ∞∞ ?ùÏÑ±.
    - user_idÍ∞Ä Î™ÖÏãú?òÎ©¥ ?¥Îãπ ?¨Ïö©?êÎßå
    - ?ÑÎãàÎ©?access_token Ïø†ÌÇ§?êÏÑú ?¨Ïö©???ùÎ≥Ñ
    """
    resolved_user_id = _require_authenticated_user_id(access_token)

    try:
        sb = _get_supabase()
        rows_res = (
            sb.table("emotion_checkins")
            .select("*")
            .eq("user_id", resolved_user_id)
            .order("created_at", desc=True)
            .limit(max(5, min(limit, 100)))
            .execute()
        )
        rows: List[Dict[str, Any]] = getattr(rows_res, "data", None) or []
        insight = await generate_emotion_insight_bundle(rows)
        generated_at = insight.get("generated_at") or datetime.utcnow().isoformat()
        return EmotionInsightsResponse(
            total_records=int(insight.get("total_records", 0)),
            dominant_emotions=list(insight.get("dominant_emotions") or []),
            average_intensity=float(insight.get("average_intensity", 0.0)),
            trend=str(insight.get("trend") or "stable"),
            insight_summary=str(insight.get("insight_summary") or ""),
            pattern_cards=list(insight.get("pattern_cards") or []),
            recommended_actions=list(insight.get("recommended_actions") or []),
            generated_at=datetime.fromisoformat(str(generated_at).replace("Z", "+00:00")),
            source=str(insight.get("source") or "unknown"),
            model=str(insight.get("model") or "unknown"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate emotion insights: {e}")


def _chunked_session_ids(values: List[str], size: int = 80) -> List[List[str]]:
    if size <= 0:
        size = 80
    out: List[List[str]] = []
    for idx in range(0, len(values), size):
        out.append(values[idx : idx + size])
    return out


@router.get("/adaptive-report", response_model=EmotionAdaptiveReportResponse)
async def get_emotion_adaptive_report(
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> EmotionAdaptiveReportResponse:
    resolved_user_id = _require_authenticated_user_id(access_token)
    try:
        sb = _get_supabase()
        checkin_res = (
            sb.table("emotion_checkins")
            .select("*")
            .eq("user_id", resolved_user_id)
            .order("created_at", desc=True)
            .limit(130)
            .execute()
        )
        checkin_rows: List[Dict[str, Any]] = getattr(checkin_res, "data", None) or []

        total_records = len(checkin_rows)
        try:
            count_res = (
                sb.table("emotion_checkins")
                .select("id", count="exact")
                .eq("user_id", resolved_user_id)
                .execute()
            )
            count_value = getattr(count_res, "count", None)
            if isinstance(count_value, int):
                total_records = count_value
        except Exception:
            pass

        if not checkin_rows:
            now_iso = datetime.utcnow().isoformat()
            return EmotionAdaptiveReportResponse(
                template_type="warming_up",
                template_title="∞®¡§ ∏Æ∆˜∆Æ ¥Î±‚",
                total_records=0,
                confidence=0.0,
                source="fallback",
                model="rule_based",
                generated_at=datetime.fromisoformat(now_iso.replace("Z", "+00:00")),
                summary_text="±‚∑œ¿Ã æ¯æÓ ∞®¡§ ∏Æ∆˜∆Æ∏¶ ª˝º∫«“ ºˆ æ¯Ω¿¥œ¥Ÿ.",
                fields={},
            )

        session_ids: List[str] = [
            str(r.get("session_id"))
            for r in checkin_rows
            if str(r.get("session_id") or "").strip()
        ]
        unique_session_ids = sorted(set(session_ids))

        suds_rows: List[Dict[str, Any]] = []
        for chunk in _chunked_session_ids(unique_session_ids, 60):
            suds_res = (
                sb.table("suds_records")
                .select("*")
                .in_("session_id", chunk)
                .execute()
            )
            suds_rows.extend(getattr(suds_res, "data", None) or [])

        report = await generate_emotion_adaptive_report_bundle(
            checkin_rows,
            suds_rows,
            total_records=total_records,
        )
        generated_raw = report.get("generated_at") or datetime.utcnow().isoformat()

        return EmotionAdaptiveReportResponse(
            template_type=str(report.get("template_type", "warming_up")),
            template_title=str(report.get("template_title") or "∞®¡§ ∏Æ∆˜∆Æ"),
            total_records=int(report.get("total_records", total_records)),
            confidence=float(report.get("confidence", 0.0)),
            source=str(report.get("source") or "fallback"),
            model=str(report.get("model") or "rule_based"),
            generated_at=datetime.fromisoformat(str(generated_raw).replace("Z", "+00:00")),
            summary_text=str(report.get("summary") or ""),
            fields=report.get("fields") if isinstance(report.get("fields"), dict) else {},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate adaptive emotion report: {e}",
        )


@router.get("/weekly-report", response_model=EmotionWeeklyReportResponse)
async def get_emotion_weekly_report(
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> EmotionWeeklyReportResponse:
    resolved_user_id = _require_authenticated_user_id(access_token)
    week_end = datetime.utcnow()
    week_start = week_end - timedelta(days=7)

    try:
        sb = _get_supabase()
        checkin_res = (
            sb.table("emotion_checkins")
            .select("*")
            .eq("user_id", resolved_user_id)
            .gte("created_at", week_start.isoformat())
            .order("created_at", desc=True)
            .execute()
        )
        checkin_rows: List[Dict[str, Any]] = getattr(checkin_res, "data", None) or []

        session_ids: List[str] = [
            str(r.get("session_id"))
            for r in checkin_rows
            if str(r.get("session_id") or "").strip()
        ]
        unique_session_ids = sorted(set(session_ids))

        suds_rows: List[Dict[str, Any]] = []
        for chunk in _chunked_session_ids(unique_session_ids, 60):
            suds_res = (
                sb.table("suds_records")
                .select("*")
                .in_("session_id", chunk)
                .execute()
            )
            suds_rows.extend(getattr(suds_res, "data", None) or [])

        report = await generate_emotion_weekly_report_bundle(
            checkin_rows,
            suds_rows,
            week_start,
            week_end,
        )
        generated_raw = report.get("generated_at") or datetime.utcnow().isoformat()

        return EmotionWeeklyReportResponse(
            template_type=str(report.get("template_type", "weekly_warmup")),
            template_title=str(report.get("template_title") or "¡÷∞£ ∞®¡§ ∏Æ∆˜∆Æ"),
            week_start=week_start,
            week_end=week_end,
            total_records=int(report.get("total_records", len(checkin_rows))),
            confidence=float(report.get("confidence", 0.0)),
            source=str(report.get("source") or "fallback"),
            model=str(report.get("model") or "rule_based"),
            generated_at=datetime.fromisoformat(str(generated_raw).replace("Z", "+00:00")),
            summary_text=str(report.get("summary_text") or ""),
            recommendations=list(report.get("recommendations") or []),
            fields=report.get("fields") if isinstance(report.get("fields"), dict) else {},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate weekly emotion report: {e}",
        )


@router.post("/session-advice", response_model=SessionAdviceResponse)
async def generate_session_advice(payload: SessionAdviceRequest) -> SessionAdviceResponse:
    settings = get_settings()
    delta = payload.intensity_before - payload.intensity_after
    mode_label = "EFT" if payload.session_type == "eftar" else "Î™ÖÏÉÅ"
    model_name = (
        (os.getenv("OPENAI_REASONING_MODEL") or "").strip()
        or (os.getenv("OPENAI_MODEL") or "").strip()
        or (settings.OPENAI_MODEL or "").strip()
        or "gpt-5.2"
    )

    client = get_openai_client()
    if client is None:
        return _fallback_session_advice(payload)

    prompt_payload = {
        "session_type": payload.session_type,
        "mode_label": mode_label,
        "core_emotion": payload.strict_intake.core_emotion,
        "intensity_before": payload.intensity_before,
        "intensity_after": payload.intensity_after,
        "delta": delta,
        "automatic_thought": payload.strict_intake.automatic_thought,
        "situation_context": payload.strict_intake.situation_context,
        "physical_sensation": payload.strict_intake.physical_sensation,
        "immediate_goal": payload.strict_intake.immediate_goal,
        "available_time": payload.strict_intake.available_time,
        "selected_theme_id": payload.selected_theme_id,
        "selected_video_title": payload.selected_video_title,
    }

    system_prompt = (
        "You are a trauma-informed EFT/meditation coach. "
        "Respond in Korean with concise, practical advice after a completed session. "
        "Give 3-5 sentences only, no markdown, no diagnosis."
    )

    user_prompt = json.dumps(
        {
            "task": "Provide post-session coaching advice based on before/after intensity change.",
            "session_data": prompt_payload,
            "requirements": [
                "Acknowledge change in intensity score",
                "Give one immediate action for the next 10 minutes",
                "Give one next-session adjustment tip",
                "Keep tone calm and specific",
            ],
        },
        ensure_ascii=False,
    )

    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=400,
        )
        advice = (response.choices[0].message.content or "").strip()
        if not advice:
            return _fallback_session_advice(payload)
        return SessionAdviceResponse(
            advice=advice,
            delta=delta,
            source="openai",
            model=model_name,
        )
    except Exception:
        return _fallback_session_advice(payload)


