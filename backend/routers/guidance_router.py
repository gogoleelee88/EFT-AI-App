"""
MoodTalk v2.0 Guidance Pipeline.
POST /api/guidance/generate ??GuidanceOutputState (captions + voice_profile, TTS ?짭챙 ?챙).
POST /api/guidance/feedback ??GuidanceFeedbackResponse (?짢챗쨀쩌??챙쨋챙, Time-Sync Mechanism).

MVP 챙쨋챘짜 ?짢챙: ?챙짼??GuidanceAction 1챗째챘짠 ?챙짹. captions??챙쨉챘? 2챗째?=챙쨉챘? 2챙짚?챘짠?챘째챠.
?쨍챙 ?챘(?짭챘짭 block ?짚챙?챙짚챘짠)? ?쨈챘짼 ?짢챗쨀 챘짼챙 챘째?
"""
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.models.chat_models import StrictIntakeInput
from core.policy_engine import decide_action, decide_interventions, resolve_guide_tone
from core.theme_recommender import get_theme_recommender
from services.planner_service import (
    invoke_planner,
    get_crisis_fixed_scenario_blocks,
    planner_blocks_to_scenario_blocks,
)
from services.guidance_feedback_service import append_feedback
from services.nlg_service import (
    render_captions,
    render_scenario_captions,
    render_scenario_chunk,
    resolve_arousal_level,
    compute_silence_ms,
)
from services.voice_style_manager import (
    face_data_from_intake_dict,
    get_voice_style_manager,
)
from services.tts_service import synthesize_stream
from backend.types.guidance_schema import (
    ThemeRecommendation,
    GuidanceAction,
    GuidanceCursor,
    GuidanceOutputState,
    GuidanceFeedbackRequest,
    GuidanceFeedbackResponse,
)

router = APIRouter(prefix="/api/guidance", tags=["guidance"])

# 횂짠14: planner_custom / crisis_grounding ??챙짼?Chunk action 챙쨘챙 (cursor챘징??쨈챙쨈챗째????챙쩌 scenario_blocks ?짭챙짤)
_planner_action_cache: dict[str, tuple[GuidanceAction, List[str]]] = {}


class ThemesRecommendRequest(BaseModel):
    """?챘짠 챙쨋챙짼 ?챙짼. STRICT6 ?쨍챠?쨈챠짭챘짠챙쩌챘징?챙쨋챙짼 ?챙 챘째챠 (?쨉챙 B)."""
    intake: StrictIntakeInput = Field(..., description="STRICT6 ?쨍챠?쨈챠짭")


class ThemesRecommendResponse(BaseModel):
    """?챘짠 챙쨋챙짼 ?챘쨉. ?챙 ???챘짭??3챙짖?+ default_theme_id(1??."""
    recommendations: List[ThemeRecommendation] = Field(..., description="Top 3 recommended themes")
    default_theme_id: str = Field(..., description="1?챙 ?챘짠 ID (챗쨍째챘쨀쨍 ?챠)")
    decision_trace: List[str] = Field(default_factory=list, description="챗짼째챙 챗쨌쩌챗짹째 챘징챗쨌쨍")


@router.post("/themes/recommend", response_model=ThemesRecommendResponse)
async def recommend_themes(req: ThemesRecommendRequest):
    """
    STRICT6 ?쨍챠?쨈챠짭 챗쨍째챘째 ?챘짠 챙쨋챙짼. core_emotion, situation_context, immediate_goal, intensity챘징?    ?챘짠 3챙짖챙 ?챙 챘쨋????챙쨋챙짼 ?챙쩌챘징??챘짭??챘째챠. (?쨉챙 B: ?짭챙짤??챘짠챙쨋짚 챙쨋챙짼 3챗째챙짠)
    """
    recommender = get_theme_recommender()
    themes, default_theme_id, decision_trace = recommender.recommend(req.intake, intent=None)
    return ThemesRecommendResponse(
        recommendations=themes,
        default_theme_id=default_theme_id,
        decision_trace=decision_trace,
    )


class GuidanceGenerateRequest(BaseModel):
    """Guidance ?챙짹 ?챙짼. cursor=null?쨈챘짤쨈 챙짼?Chunk, next_cursor챘징??째챙 챙짠챠."""
    intake: StrictIntakeInput = Field(..., description="STRICT6 ?쨍챠?쨈챠짭")
    selected_theme_id: str = Field(..., description="?챠???챘짠 ID")
    signal_degrade: bool = Field(default=False, description="True챘짤?standard_grounding?쩌챘징 Failover")
    confidence: Optional[float] = Field(default=None, description="null?쨈챘짤쨈 failover??signal_degrade챘짠??짭챙짤")
    cursor: Optional[GuidanceCursor] = Field(default=None, description="?짚챙 Chunk ?챙짼 ???쨈챙 ?챘쨉??next_cursor ?챘짭")
    selected_video_id: Optional[str] = Field(default=None, description="selected YouTube video_id (optional)")
    session_id: Optional[str] = Field(
        default=None,
        description="챘짧챙 ??ID. ?챙쩌 ?쨍챙?챙 Chunk챘짠챘짚 ?챙쩌 챗째??챘짭 ??TTS ?짚챠????챠(챙쩔짢챘짚???챙짚?챘짝짭?챙짚) ?챙?",
    )


@router.post("/generate", response_model=GuidanceOutputState)
async def generate_guidance(req: GuidanceGenerateRequest):
    """
    ?챙짼??GuidanceAction 1챗째챘짠 ?챙짹. captions 챙쨉챘? 2챗째챘짠 챘째챠.
    횂짠14: cursor=null(?쨍챙 ?챙 챙짼?Chunk)???챘짠 ?챘??LLM ?챘 ???짹챗쨀쨉 ??planner_custom, ?짚챠짢/quality/crisis ??챗쨍째챙징쨈 ?챘챘짝짭챙짚.
    cursor ?챙쩌챘짤??챘???쨍챙쨋 ?챙쨈 챗쨍째챙징쨈 decide_action ??NLG.
    """
    decision_trace: List[str] = []
    action: Optional[GuidanceAction] = None
    policy_interventions: List[dict] = []

    if req.cursor is not None:
        # ?짚챙 Chunk ?챙짼 ??cursor.scenario_id챗째 planner_custom/crisis_grounding?쨈챘짤쨈 챙쨘챙?챙 ?챙쩌 action ?짭챙짭??        sid = (req.session_id or "").strip()
        if sid and req.cursor.scenario_id in ("planner_custom", "crisis_grounding"):
            cached = _planner_action_cache.get(sid)
            if cached:
                action, decision_trace = cached
                policy_interventions, signal_trace = decide_interventions(
                    intake=req.intake,
                    signal_degrade=req.signal_degrade,
                    confidence=req.confidence,
                    selected_video_id=req.selected_video_id,
                )
                decision_trace = [*decision_trace, *signal_trace]
            else:
                action, decision_trace, policy_interventions = decide_action(
                    req.intake,
                    req.selected_theme_id,
                    signal_degrade=req.signal_degrade,
                    confidence=req.confidence,
                    selected_video_id=req.selected_video_id,
                )
        else:
            action, decision_trace, policy_interventions = decide_action(
                req.intake,
                req.selected_theme_id,
                signal_degrade=req.signal_degrade,
                confidence=req.confidence,
                selected_video_id=req.selected_video_id,
            )
    else:
        # ?쨍챙 ?챙 챙짼?Chunk ???챘???챘 (챘짧챙쨍 횂짠14)
        is_crisis = req.signal_degrade or (
            req.confidence is not None and req.confidence < 0.4
        )
        quality = 1.0
        if req.intake.face_data and isinstance(req.intake.face_data, dict):
            quality = float(req.intake.face_data.get("quality", 1.0))

        if is_crisis:
            policy_interventions, signal_trace = decide_interventions(
                intake=req.intake,
                signal_degrade=req.signal_degrade,
                confidence=req.confidence,
                selected_video_id=req.selected_video_id,
            )
            scenario_blocks = get_crisis_fixed_scenario_blocks()
            tone, _ = resolve_guide_tone(req.intake, req.selected_theme_id)
            action = GuidanceAction(
                phase="grounding",
                block_type="grounding_breath",
                prompt_style="calm",
                instruction_kind="instruction",
                task_atom=None,
                constraints={},
                safety_guards={},
                output_mode="caption",
                scenario_id="crisis_grounding",
                scenario_blocks=scenario_blocks,
                pace="normal",
                intervention_rate="med",
                reference_scenario=scenario_blocks,
                guide_tone=tone,
            )
            decision_trace = ["planner_used: false", "planner_fallback_reason: crisis"]
            decision_trace.extend(signal_trace)
            if req.session_id:
                _planner_action_cache[(req.session_id or "").strip()] = (action, decision_trace)
        elif quality < 0.5:
            action, decision_trace, policy_interventions = decide_action(
                req.intake,
                req.selected_theme_id,
                signal_degrade=req.signal_degrade,
                confidence=req.confidence,
                selected_video_id=req.selected_video_id,
            )
            decision_trace.append("planner_used: false")
            decision_trace.append("planner_fallback_reason: low_quality")
        else:
            plan, fallback_reason = invoke_planner(
                req.intake, "No prior feedback", None
            )
            if plan is not None:
                policy_interventions, signal_trace = decide_interventions(
                    intake=req.intake,
                    signal_degrade=req.signal_degrade,
                    confidence=req.confidence,
                    selected_video_id=req.selected_video_id,
                )
                scenario_blocks = planner_blocks_to_scenario_blocks(plan.blocks)
                tone, _ = resolve_guide_tone(req.intake, req.selected_theme_id)
                action = GuidanceAction(
                    phase="planner_custom",
                    block_type="main",
                    prompt_style="calm",
                    instruction_kind="instruction",
                    task_atom=None,
                    constraints={},
                    safety_guards={},
                    output_mode="caption",
                    scenario_id="planner_custom",
                    scenario_blocks=scenario_blocks,
                    pace="normal",
                    intervention_rate="med",
                    reference_scenario=scenario_blocks,
                    guide_tone=tone,
                )
                decision_trace = ["planner_used: true"]
                decision_trace.extend(signal_trace)
                if req.session_id:
                    _planner_action_cache[(req.session_id or "").strip()] = (action, decision_trace)
            else:
                action, decision_trace, policy_interventions = decide_action(
                    req.intake,
                    req.selected_theme_id,
                    signal_degrade=req.signal_degrade,
                    confidence=req.confidence,
                    selected_video_id=req.selected_video_id,
                )
                decision_trace.append("planner_used: false")
                decision_trace.append(
                    f"planner_fallback_reason: {fallback_reason or 'unknown'}"
                )

    next_cursor: Optional[GuidanceCursor] = None
    if action.scenario_blocks or action.reference_scenario:
        captions, next_cursor, is_failover, model_name, interventions = render_scenario_chunk(
            action, req.intake, cursor=req.cursor, use_qwen=True
        )
    else:
        captions, is_failover, model_name, interventions = render_captions(
            action, req.intake, use_qwen=True
        )
    merged_interventions: Optional[List[dict]] = None
    if policy_interventions or interventions:
        merged: List[dict] = []
        seen_types: set[str] = set()
        for src in [policy_interventions, interventions or []]:
            for iv in src:
                iv_type = str(iv.get("type") or "").strip()
                if not iv_type or iv_type in seen_types:
                    continue
                seen_types.add(iv_type)
                merged.append(iv)
        merged_interventions = merged or None
    decision_trace.append(f"NLG: {'template fallback' if is_failover else model_name} captions={len(captions)}")
    arousal = resolve_arousal_level(req.intake)
    silence_ms = compute_silence_ms(arousal)
    decision_trace.append(f"Timing: arousal={arousal:.2f} ??silence_ms={silence_ms}")
    guidance_id = str(uuid.uuid4())

    # TTS ?짚챠??? session_id + face_data ?챙쩌챘짤?Hybrid Pacing ?챙짤. 챘짧챙쨍: quality < 0.5 ??face_data ?챘쨉(?짚챠???챘짱쨍챙??
    tts_instruction: Optional[str] = None
    tts_speed: Optional[float] = None
    if req.session_id and req.intake.face_data:
        fd = req.intake.face_data
        quality = float(fd.get("quality", 1.0)) if isinstance(fd, dict) else 1.0
        if quality >= 0.5:
            face_data = face_data_from_intake_dict(
                fd,
                timestamp=None,
            )
        else:
            face_data = None
        if face_data is not None:
            manager = get_voice_style_manager(req.session_id)
            tts_config = manager.determine_style(face_data)
            tts_instruction = tts_config.instruction
            tts_speed = tts_config.speed
            decision_trace.append(f"TTS: style={tts_config.style} speed={tts_speed}")

    return GuidanceOutputState(
        guidance_id=guidance_id,
        captions=captions,
        silence_ms=silence_ms,
        voice_profile="qwen_female_calm",
        tts_instruction=tts_instruction,
        tts_speed=tts_speed,
        action_context=action.model_dump(),
        next_cursor=next_cursor,
        decision_trace=decision_trace,
        interventions=merged_interventions,
        meta={"is_failover": is_failover, "model": model_name},
    )


class GuidanceGenerateAudioRequest(GuidanceGenerateRequest):
    """?짚챘???짚챠쨍챘짝쩌챙짤 generate ?챙짼. StrictIntake + selected_theme_id???챙쩌?챗짼 ?짭챙짤."""
    pass


@router.post("/generate_audio")
async def generate_guidance_audio(req: GuidanceGenerateAudioRequest):
    """
    STRICT6 ?쨍챠?쨈챠짭 + ?챠 ?챘짠챘짜?챘째챙, ??Chunk 챘쨋챘??챘짧챙 챗째?쨈챘챘짜?    TTS(mock) ?짚챘???짚챠쨍챘짝쩌챙쩌챘징?챘째챠?챘짚.
    - ?쨈챘??챙쩌챘징챘 /generate ? ?챙쩌??decide_action + NLG ?챘짝?????
      captions ?챙짚?쨍챘? 챘짧짢챘 ?짤챙쨀 TTS???챙쨈??
    - ?짚챙 TTS 챘짧짢챘쨍??챘쨋챗쨍째 ?챗쨔챙짠??synthesize_stream ??mock ?짚챘?짚챘? 챘째챠?챘짚.
    """
    # ?챙짚??챙쨘징챙 ?챙짹 (planner + crisis 챘징챙짠 ?짭챠짢)
    guidance_state = await generate_guidance(req)  # type: ignore[arg-type]
    text = " ".join(c.text for c in guidance_state.captions)
    voice_id = getattr(req.intake, "voice_id", None)
    audio_stream = synthesize_stream(text=text, voice_id=voice_id)
    return StreamingResponse(audio_stream, media_type="audio/wav")


@router.post("/feedback", response_model=GuidanceFeedbackResponse)
async def submit_guidance_feedback(req: GuidanceFeedbackRequest):
    """
    챘짧챙 챙짖챘짙 ???쩌챘챘째???? Time-Sync Mechanism.
    best_moments: ?챙/?챘 ?쩌챘챘째짹챘 ?챘짠??seq 챘짝짭챙짚??
    Lite: JSONL 챘징챗쨌쨍챘짠? Pro: 챙쨋챠 챗째챙짚챙쨔 챘째챙.
    """
    trace_id, saved_at = append_feedback(req)
    return GuidanceFeedbackResponse(ok=True, trace_id=trace_id, saved_at=saved_at)


