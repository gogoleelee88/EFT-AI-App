"""
MoodTalk v2.0 Guidance Pipeline - Contract types.
Chunk 방식 연속 진행: cursor/next_cursor, scenario_id, scenario_blocks, pace, intervention_rate.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

# §14 블록 플래너(LLM): 허용 블록 타입 6종
PLANNER_BLOCK_TYPES = Literal[
    "breath_regulation",
    "body_release",
    "defusion",
    "self_compassion",
    "activation",
    "grounding",
]


class PlannerBlock(BaseModel):
    """플래너 LLM 출력 블록 1개. duration_s 30~300, intensity 0~1 (향후 확장용)."""
    type: PLANNER_BLOCK_TYPES = Field(..., description="허용 6종만")
    duration_s: int = Field(..., ge=30, le=300, description="블록 길이(초)")
    intensity: float = Field(default=0.5, ge=0.0, le=1.0, description="향후 hold_ms/말 빠르기 보정용")


class PlannerPlan(BaseModel):
    """플래너 LLM 출력. total_target_s ± 60 내에 sum(duration_s) 검증."""
    total_target_s: int = Field(..., ge=60, description="목표 총 길이(초)")
    blocks: List[PlannerBlock] = Field(..., min_length=2, max_length=6, description="2~6개 블록")


class ThemeRecommendation(BaseModel):
    """테마 추천 (PolicyEngine Rule Mapping 결과)"""
    theme_id: str = Field(..., description="테마 식별자")
    title: str = Field(..., description="표시 제목")
    estimated_min: int = Field(..., ge=1, description="예상 소요 분")
    summary: str = Field(..., description="한 줄 요약")


class ScenarioBlock(BaseModel):
    """레퍼런스 시나리오 블록 (유튜브 등 검증된 스크립트 뼈대). Chunk 단위."""
    block_id: str = Field(..., description="블록 식별자")
    type: str = Field(..., description="intro | main | bridge_advice | activation | outro 등")
    base_text: Optional[str] = Field(None, description="고정 문장, Fallback 시 그대로 사용")
    adapt_instruction: Optional[str] = Field(None, description="가변 구간 지시(여기만 LLM이 생성)")
    min_hold_ms: int = Field(default=2000, ge=0, description="표시 최소 유지(ms)")
    max_hold_ms: int = Field(default=4000, ge=0, description="표시 최대 유지(ms)")


class GuidanceCursor(BaseModel):
    """Chunk 연속 진행용 커서. 동일 엔드포인트로 다음 2줄 요청 시 사용."""
    scenario_id: str = Field(..., description="시나리오 ID")
    next_block_index: int = Field(..., ge=0, description="다음에 생성할 블록 인덱스")


class CaptionItem(BaseModel):
    """자막 1개 (UI 즉시 렌더링용, TTS는 다음 단계)"""
    seq: int = Field(..., ge=1, description="순서")
    text: str = Field(..., description="표시 텍스트")
    hold_ms: int = Field(..., ge=0, description="표시 유지 시간(ms)")
    type: Optional[str] = Field(None, description="intro, advice, main, outro 등")


class GuidanceAction(BaseModel):
    """
    정책 엔진이 결정한 가이드 액션.
    scenario_id + scenario_blocks: PolicyEngine이 로드한 시나리오 뼈대. pace/intervention_rate로 hold_ms·요청 간격 메타.
    """
    phase: str = Field(..., description="phase 식별자")
    block_type: str = Field(..., description="block_type e.g. grounding_breath")
    prompt_style: str = Field(..., description="prompt_style e.g. calm")
    instruction_kind: str = Field(..., description="instruction_kind e.g. instruction")
    task_atom: Optional[str] = Field(None, description="Activation 시 1개만, 문자열 불변")
    constraints: Optional[Dict[str, Any]] = Field(default_factory=dict)
    safety_guards: Optional[Dict[str, Any]] = Field(default_factory=dict)
    output_mode: str = Field(default="caption", description="이번 단계는 항상 caption")
    scenario_id: str = Field(default="", description="시나리오 라이브러리 ID (standard_grounding, overwhelm_focus 등)")
    scenario_blocks: List[ScenarioBlock] = Field(default_factory=list, description="시나리오 블록 순서(변경 금지)")
    pace: Literal["slow", "normal", "fast"] = Field(default="normal", description="captions hold_ms에 영향")
    intervention_rate: Literal["low", "med", "high"] = Field(default="med", description="다음 캡션 요청 간격 메타")
    reference_scenario: Optional[List[ScenarioBlock]] = Field(
        default=None,
        description="(호환) scenario_blocks와 동일. NLG 레거시 경로용",
    )
    guide_tone: Optional[str] = Field(
        default=None,
        description="Grand Master v2: warm | rational | strict. NLG 톤 반영용.",
    )


GUIDANCE_INTERVENTION_TYPES = (
    "SOFT_CUE",
    "POSTURE_RESET",
    "BREATH_PACE",
    "PAUSE_GUIDE_AUDIO",
    "REWIND_GUIDE_AUDIO",
    "REPEAT_LAST_CAPTION",
    "PAUSE_YOUTUBE",
    "SEEK_YOUTUBE",
    "RESUME_YOUTUBE",
)

GuidanceInterventionType = Literal[
    "SOFT_CUE",
    "POSTURE_RESET",
    "BREATH_PACE",
    "PAUSE_GUIDE_AUDIO",
    "REWIND_GUIDE_AUDIO",
    "REPEAT_LAST_CAPTION",
    "PAUSE_YOUTUBE",
    "SEEK_YOUTUBE",
    "RESUME_YOUTUBE",
]


class GuidanceIntervention(BaseModel):
    """Optional guide interventions suggested by the model."""
    type: GuidanceInterventionType = Field(..., description="Intervention action type")
    params: Dict[str, Any] = Field(default_factory=dict, description="Optional parameters")
    cooldown_ms: int = Field(default=0, ge=0, description="Cooldown window in milliseconds")
    reason: Optional[str] = Field(default=None, description="Reason for intervention")


class GuidanceOutputState(BaseModel):
    """
    Guidance 파이프라인 최종 출력. MVP: GuidanceAction 1개당 captions 최대 2개만 반환.
    decision_trace: 추천/생성 과정의 투명성(Auditability). Grand Master 명세.
    """
    guidance_id: str = Field(..., description="UUID")
    captions: List[CaptionItem] = Field(..., description="자막 목록 (최대 2개)")
    silence_ms: int = Field(default=1000, ge=0, description="자막 간 침묵(ms)")
    voice_profile: str = Field(default="qwen_female_calm", description="다음 단계 TTS용")
    tts_instruction: Optional[str] = Field(
        default=None,
        description="CosyVoice 톤 지시 (face_data 기반 Hybrid Pacing). 있으면 클라이언트가 TTS에 적용",
    )
    tts_speed: Optional[float] = Field(
        default=None,
        ge=0.5,
        le=2.0,
        description="TTS 재생 속도 배율. 있으면 클라이언트가 TTS에 적용",
    )
    action_context: Optional[Dict[str, Any]] = Field(None, description="GuidanceAction 직렬화")
    next_cursor: Optional[GuidanceCursor] = Field(None, description="다음 Chunk 요청 시 cursor로 전달")
    decision_trace: List[str] = Field(
        default_factory=list,
        description="추천/생성 결정 근거 로그 (예: Found keyword '잠', Score 0.8, Selected sleep_01)",
    )
    interventions: Optional[List[GuidanceIntervention]] = Field(
        default=None,
        description="Optional intervention actions (backward-compatible)",
    )
    meta: Dict[str, Any] = Field(
        default_factory=lambda: {"is_failover": False, "model": "local"},
        description="is_failover, model 등"
    )


# --- Feedback Loop (Time-Sync Mechanism) ---


class BestMomentDetail(BaseModel):
    """표정/수동 피드백된 자막 1개. seq + text로 '어떤 멘트가 먹혔는지' 분석용."""
    seq: int = Field(..., ge=1, description="자막 seq 번호")
    text: Optional[str] = Field(None, description="해당 자막 텍스트 (클라이언트가 captions에서 추출)")


class CoachingEvent(BaseModel):
    """Guidance intervention event log (client-side coaching events)."""
    level: Literal["GREEN", "YELLOW", "RED"] = Field(..., description="Event severity")
    timestamp: int = Field(..., ge=0, description="Unix timestamp (ms)")
    actions: List[str] = Field(default_factory=list, description="Action labels")


class GuidanceFeedbackRequest(BaseModel):
    """명상 종료 후 피드백. Lite: 로그만, Pro: 추후 가중치 반영."""
    guidance_id: str = Field(..., description="어떤 명상 세션인지 (generate 응답의 guidance_id)")
    best_moments: List[int] = Field(..., description="표정/수동 피드백된 자막의 seq 리스트")
    best_moments_detail: Optional[List[BestMomentDetail]] = Field(
        default=None,
        description="seq + text (어떤 멘트가 먹혔는지 분석용, 선택)",
    )
    worst_moments: Optional[List[int]] = Field(
        default=None,
        description="별로였던 순간 seq 리스트 (AI 가이드 맞춤용)",
    )
    worst_moments_detail: Optional[List[BestMomentDetail]] = Field(
        default=None,
        description="worst_moments의 seq + text",
    )
    user_rating: int = Field(..., ge=1, le=5, description="1~5 별점")
    session_id: Optional[str] = Field(None, description="세션 ID")
    user_id: Optional[str] = Field(None, description="사용자 ID (로그인 시)")
    scenario_id: Optional[str] = Field(None, description="action_context.scenario_id")
    theme_id: Optional[str] = Field(None, description="선택된 테마 ID")
    selected_video_id: Optional[str] = Field(None, description="Selected YouTube video ID")
    coaching_events: Optional[List[CoachingEvent]] = Field(
        default=None,
        description="Intervention events executed by the client",
    )


class GuidanceFeedbackResponse(BaseModel):
    """Feedback 저장 응답."""
    ok: bool = Field(True, description="성공 여부")
    trace_id: Optional[str] = Field(None, description="추적 ID")
    saved_at: Optional[str] = Field(None, description="저장 시각 ISO8601")
