import redis

import textwrap
import os
from supabase import create_client

from fastapi import APIRouter, Cookie, HTTPException
from services.emotion_candidates_service import get_emotion_candidates
from routers.compare import SessionState
import json

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from backend.models.chat_models import StrictIntakeInput
from core.theme_recommender import get_theme_recommender
from backend.types.guidance_schema import ThemeRecommendation
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
    """媛?泥댄???泥. ?濡???吏 ??ぉ(7~8媛?怨?1:1 留ㅼ?"""
    session_id: str
    session_type: Literal["eftar", "meditation"] | None = None
    user_id: str | None = None
    core_emotion: str
    situation_context: str
    automatic_thought: str
    physical_sensation: str | None = None
    coping_attempt: str | None = None  # ?濡??behavioral_reaction ?????應??議
    immediate_goal: str | None = None
    intensity_before: int
    plan_start_resistance: str | None = None
    available_time: int | None = None  # ?ъ?媛???媛(遺?. ?濡??8踰吏???ぉ


@router.post("/checkin")
def save_emotion_checkin(
    payload: EmotionCheckinRequest,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
):
    """
    媛?泥댄????? 湲곗〈 ?逾??theme_recommendations, default_theme_id Optional 異?.
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
            # MODULE_MODE=lite: 洹移 湲곕?/ pro: LLM 湲곕?+ Rule fallback
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

    # ??몄 ??遺臾?ㅺ린
    raw = redis_client.get(f"session:compare:{req.session_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Session not found")
    state = SessionState(**json.loads(raw))

    intake = {item.key: item.value for item in state.checklist}

    # ? ?珥釉由??LLM ?蹂?異異
    inference_list = await get_emotion_candidates(
        user_input=intake.get("situation_context") or "",
        strict6_output=intake,
        engine="b"
    )

    if not inference_list:
        return EmotionCandidatesResponse(
            message="감정 후보 추론 결과가 없어 기본값을 반환합니다.",
            candidates=[{
                "label": "unknown",
                "reason": "모델 후보가 없어 기본 라벨로 추정합니다.",
                "confidence": 0.5,
            }]
        )

    candidates_out = [{
        "label": c.label,
        "reason": c.reason,
        "confidence": c.confidence,
    } for c in inference_list]

    return EmotionCandidatesResponse(
        message="추론 후보를 기반으로 감정 후보를 구성했습니다.",
        candidates=candidates_out,
        core_emotion_hypothesis=inference_list[0].label,
        reasoning=inference_list[0].reason
    )


class EmotionCheckinSummary(BaseModel):
    id: str
    created_at: datetime
    core_emotion: str
    situation_context: str
    automatic_thought: str
    physical_sensation: Optional[str] = None
    coping_attempt: Optional[str] = None
    immediate_goal: Optional[str] = None
    intensity: int = Field(..., description="?몄 ????媛?(intensity_before)")


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
    mode_label = "EFT" if payload.session_type == "eftar" else "명상"
    core_emotion = payload.strict_intake.core_emotion.strip() or "감정"
    situation = payload.strict_intake.situation_context.strip() or "현재 상황"
    automatic_thought = payload.strict_intake.automatic_thought.strip() or "불확실함"
    behavioral_reaction = (
        payload.strict_intake.behavioral_reaction.strip()
        if payload.strict_intake.behavioral_reaction
        else "특별한 실행 행동 기록 없음"
    )
    goal = (
        payload.strict_intake.immediate_goal.strip()
        if payload.strict_intake.immediate_goal
        else "안정감 회복"
    )
    available_time = payload.strict_intake.available_time
    time_hint = ""
    if isinstance(available_time, int) and 1 <= available_time <= 120:
        time_hint = f"(지금 확보된 시간: {available_time}분)"

    # ACT + 멘탈코치 톤: “진단/평가” 대신 “공감+수용+가치기반 행동”으로 안내
    # 실행 과제는 항상 '업무 재진입'을 돕는 초소형 행동으로 고정(과도한 자기통제/훈계 톤 금지)
    micro_action_10m = (
        "다음 10분은 ‘기분을 없애는 시간’이 아니라 ‘기분을 안고 한 걸음’ 내딛는 시간으로 잡아볼게요. "
        "1) 60초만 호흡을 길게(들이마심 4초/내쉼 6초) 하고, "
        f"2) 지금 떠오른 생각을 그대로 문장으로 붙여서 “나는 지금 ‘{automatic_thought}’라는 생각을 하고 있네”라고 한 번만 말해요. "
        "3) 그다음 업무를 ‘최소 단위’로 쪼개서, 지금 바로 할 수 있는 1개만 실행합니다: "
        "‘파일 열기 → 첫 줄 고치기/주석 달기/테스트 1번 실행’처럼요."
    )

    check_30m = (
        "그리고 30분 안에 한 번만 점검해요: "
        "① 내가 한 행동이 목표에 1%라도 가까워졌나 ② 감정이 남아 있어도 움직일 수 있었나 "
        "③ 다음 10분에 할 ‘다음 1개’는 무엇인가."
    )

    next_session_tip = (
        f"다음 세션에서는 목표를 '{goal}'로 두되, 시작 전 질문을 하나만 더해보세요: "
        "“내가 지금 피하려는 건 감정이야, 아니면 불편한 업무의 첫 2분이야?” "
        "이 질문 하나가 회피 대신 ‘착수’를 선택하는 데 도움 돼요."
    )

    if delta >= 3:
        advice = (
            f"{mode_label} 전후 강도가 {payload.intensity_before}→{payload.intensity_after}로 {delta}점 내려갔어요. {time_hint} "
            f"지금 당신은 '{situation}' 상황에서 '{automatic_thought}'가 떠오르며 '{core_emotion}'이 올라온 상태였죠. "
            "여기까지 내려온 건 ‘당신이 이미 조절을 해낸 증거’예요. 잘 버텼어요. "
            "이제 남은 건 완벽해지는 게 아니라, ‘다시 업무로 돌아오는 다리’를 놓는 거예요. "
            f"{micro_action_10m} "
            f"{check_30m} "
            f"{next_session_tip}"
        )
    elif delta >= 1:
        advice = (
            f"{mode_label} 후 강도가 {payload.intensity_before}→{payload.intensity_after}로 {delta}점 내려갔어요. {time_hint} "
            f"'{situation}'에서 '{automatic_thought}'가 올라오면 몸과 마음이 자동으로 움츠러들 수 있어요. "
            "그래도 지금은 ‘조금 내려간 상태’라서, 이 타이밍이 업무 재진입에 딱 좋아요. "
            "ACT에서는 감정을 없애려 하기보다, 감정을 데리고 ‘의미 있는 행동’을 택하는 쪽이 회복을 빠르게 만들어요. "
            f"{micro_action_10m} "
            f"{check_30m} "
            f"{next_session_tip}"
        )
    elif delta == 0:
        advice = (
            f"{mode_label} 후에도 강도가 {payload.intensity_before}→{payload.intensity_after}로 비슷하게 남아 있어요. {time_hint} "
            "이건 실패가 아니라, ‘감정이 쉽게 안 가라앉는 날’일 뿐이에요. "
            f"'{situation}'에서 '{automatic_thought}'가 계속 울려도, 우리는 감정과 싸우지 않고 ‘움직임’을 선택할 수 있어요. "
            "오늘의 목표는 기분을 0으로 만드는 게 아니라, 업무를 1mm라도 전진시키는 거예요. "
            f"{micro_action_10m} "
            f"{check_30m} "
            f"{next_session_tip}"
        )
    else:
        advice = (
            f"{mode_label} 후 강도가 {payload.intensity_before}→{payload.intensity_after}로 오히려 {abs(delta)}점 올라갔어요. {time_hint} "
            "이럴 땐 ‘억지로 밀어붙이기’가 아니라 ‘안전을 먼저 확보’하는 게 우선이에요. "
            "지금은 당신이 약해서가 아니라, 신경계가 과부하를 겪는 흔한 패턴일 수 있어요. "
            "먼저 2분만 안정화 루틴을 해요: "
            "① 숨을 길게 내쉬기 6회 ② 눈에 보이는 것 5개/촉감 4개/소리 3개를 조용히 확인 "
            "③ 물 한 잔. "
            "그 다음에 업무는 ‘진짜로’ 최소로: "
            "‘프로젝트 열기’나 ‘해야 할 한 줄을 메모장에 적기’처럼 부담이 가장 낮은 1개만 해요. "
            f"{check_30m} "
            f"{next_session_tip}"
        )

    # 마지막에 상담 톤을 부드럽게 고정(훈계/진단 금지)
    closing = (
        "\n\n지금 감정은 ‘문제가 있는 증거’가 아니라 ‘당신이 중요하게 여기는 걸 지키려는 신호’일 가능성이 커요. "
        f"'{core_emotion}'이 올라와도 당신은 선택권이 있어요. 오늘은 크게 바꾸려 하지 말고, "
        "딱 한 번만 ‘다음 10분’에 집중해요. "
        "마지막으로 질문 하나만: 지금 이 순간, 당신이 지키고 싶은 가치는 무엇이고(예: 성실, 성장, 책임, 안정), "
        "그 가치를 위해 ‘가장 작은 한 걸음’은 뭘까요?"
    )

    full_advice = (advice + closing).strip()

    return SessionAdviceResponse(
        advice=full_advice,
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
    理洹?STRICT 媛??명?댄?emotion_checkins) 湲곕??議고.
    ??蹂??'理洹?媛??몄' 移대???ъ?
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
            raw_id = r.get("id")
            if raw_id is None:
                continue
            summaries.append(
                EmotionCheckinSummary(
                    id=str(raw_id),
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
        session_id: str,
    access_token: Optional[str] = Cookie(default=None, alias="access_token"),
) -> EmotionCheckinSummary:
    """
    ?⑥?媛??몄(emotion_checkins) 1嫄?議고. ?痢 ?硫??
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
        raw_id = r.get("id")
        if raw_id is None:
            raise HTTPException(status_code=500, detail="Session data missing id")
        return EmotionCheckinSummary(
            id=str(raw_id),
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
    emotion_checkins 湲곕?湲곕낯 ?듦?
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

        # 媛?遺姿 + ?洹 媛?        dist: Dict[str, int] = {}
        intensities: List[int] = []
        for r in rows:
            ce = r.get("core_emotion") or "湲고?"
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
    OpenAI 湲곕?媛??⑦??듭같 ?梨.
    - user_id媛 紐?硫??대??ъ?留
    - ?應?access_token 荑仍???ъ???蹂
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
                template_title="감정 리포트 대기",
                total_records=0,
                confidence=0.0,
                source="fallback",
                model="rule_based",
                generated_at=datetime.fromisoformat(now_iso.replace("Z", "+00:00")),
                summary_text="기록이 없어 감정 리포트를 생성할 수 없습니다.",
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
            template_title=str(report.get("template_title") or "감정 리포트"),
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
            template_title=str(report.get("template_title") or "주간 감정 리포트"),
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
    mode_label = "EFT" if payload.session_type == "eftar" else "명상"
    model_name = (
        (os.getenv("OPENAI_REASONING_MODEL") or "").strip()
        or (os.getenv("OPENAI_MODEL") or "").strip()
        or (settings.OPENAI_MODEL or "").strip()
        or "gpt-5.2"
    )

    client = get_openai_client()
    if client is None:
        return _fallback_session_advice(payload)

    behavioral_reaction = payload.strict_intake.behavioral_reaction
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
        "behavioral_reaction": behavioral_reaction,
        "act": behavioral_reaction,
        "immediate_goal": payload.strict_intake.immediate_goal,
        "available_time": payload.strict_intake.available_time,
        "selected_theme_id": payload.selected_theme_id,
        "selected_video_title": payload.selected_video_title,
    }

    system_prompt = (
        "You are a trauma-informed ACT therapist + mental performance coach. "
        "Your job: comfort the user, reduce shame/pressure, and gently help them re-enter work with a tiny committed action. "
        "Respond ONLY in Korean. Use a warm counseling tone (not clinical/diagnostic). "
        "No diagnosis, no labels like '임상적으로', no scolding. "
        "Be specific and safe. If the user seems in crisis or mentions self-harm, encourage seeking immediate professional help. "
        "Do not use markdown. Write 700~1200 Korean characters."
    )

    user_prompt = json.dumps(
        {
            "task": "Provide post-session counseling + ACT-based coaching to help the user feel soothed and restart their work.",
            "session_data": prompt_payload,
            "requirements": [
                "첫 문단: 사용자의 상황(situation_context)과 자동사고(automatic_thought)를 그대로 반영해 1~2문장으로 공감/정서적 반영을 한다.",
                "둘째 문단: 강도 변화(intensity_before→intensity_after, delta)를 숫자로 정확히 말하고, '잘 해냈다/버텼다' 같은 비판 없는 인정 문장을 1개 포함한다.",
                "셋째 문단: ACT 관점(수용/탈융합/가치)을 아주 쉬운 말로 2~3문장 설명한다(이론 설명 길게 금지).",
                "넷째 문단: '다음 10분' 초소형 실행 1개를 제시한다(업무 재진입용: 파일 열기/첫 줄 수정/테스트 1회 등). 사용자의 immediate_goal/available_time을 반영한다.",
                "다섯째 문단: '다음 30분' 점검 질문 3개(행동/가치정렬/다음 한 걸음)를 제시한다.",
                "여섯째 문단: 다음 세션에서의 조정 팁 1개(목표/상황 기반)를 준다.",
                "마무리: 짧은 자기연민 문장 1개 + 짧은 반추 질문 1개로 끝낸다.",
                "진단/라벨링/훈계 금지. 지나치게 과격한 도전 금지. 구체적이고 따뜻하게.",
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
            max_tokens=900,
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






