"""
MoodTalk v2.0 Policy Engine.
Theme/block recommendation and signal-driven intervention policy.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from config.settings import get_settings
from core.task_atom_chooser import get_task_atom_chooser
from backend.models.chat_models import StrictIntakeInput
from backend.domain_types.guidance_schema import ThemeRecommendation, GuidanceAction, ScenarioBlock

_SCENARIOS_PATH = Path(__file__).resolve().parent.parent / "data" / "scenarios.json"


THEME_LIBRARY: List[ThemeRecommendation] = [
    ThemeRecommendation(
        theme_id="self_compassion",
        title="Self-Compassion",
        estimated_min=8,
        summary="Offer calm self-soothing guidance and reduce pressure during stress.",
    ),
    ThemeRecommendation(
        theme_id="thought_labeling",
        title="Thought Labeling",
        estimated_min=6,
        summary="Help the user name and observe thoughts without fusing with them.",
    ),
    ThemeRecommendation(
        theme_id="micro_task_bridging",
        title="Micro-Task Bridging",
        estimated_min=5,
        summary="Move from emotional overwhelm into a very small actionable step.",
    ),
]


def load_reference_scenario(scenario_id: str) -> List[ScenarioBlock]:
    """
    Load scenario definition from scenarios.json.
    Returns scenario blocks for the given scenario_id when available.
    """
    if not _SCENARIOS_PATH.exists():
        return []
    try:
        with open(_SCENARIOS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []
    raw = data.get(scenario_id)
    if isinstance(raw, dict) and "blocks" in raw:
        raw = raw["blocks"]
    if not isinstance(raw, list):
        return []
    out: List[ScenarioBlock] = []
    for i, item in enumerate(raw):
        if isinstance(item, dict):
            bid = item.get("block_id") or f"{scenario_id}_{i}"
            t = item.get("type", "")
            base = item.get("base_text")
            adapt = item.get("adapt_instruction") or item.get("instruction")
            min_hold = int(item.get("min_hold_ms", 2000))
            max_hold = int(item.get("max_hold_ms", 4000))
            out.append(
                ScenarioBlock(
                    block_id=bid,
                    type=t,
                    base_text=base,
                    adapt_instruction=adapt,
                    min_hold_ms=min_hold,
                    max_hold_ms=max_hold,
                )
            )
    return out


def get_default_task_for_scenario(scenario_id: str) -> Optional[str]:
    """
    Return default_task from scenarios.json for wrapper fallback.
    """
    if not _SCENARIOS_PATH.exists():
        return None
    try:
        with open(_SCENARIOS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None
    raw = data.get(scenario_id)
    if isinstance(raw, dict) and "default_task" in raw:
        return raw.get("default_task")
    return None


VALID_THEME_IDS = {"self_compassion", "thought_labeling", "micro_task_bridging"}

# Grand Master v2 tone defaults by theme.
THEME_DEFAULT_TONE: dict[str, str] = {
    "self_compassion": "warm",
    "thought_labeling": "rational",
    "micro_task_bridging": "strict",
}
VALID_TONES = {"warm", "rational", "strict"}


def _intent_to_default_theme_id(intent: Optional[str]) -> Optional[str]:
    """Map explicit intent string to one of the valid theme ids."""
    if not intent or not isinstance(intent, str):
        return None
    key = intent.strip().lower()
    if key in VALID_THEME_IDS:
        return key
    return None


def resolve_guide_tone(
    intake: StrictIntakeInput,
    selected_theme_id: str,
) -> Tuple[str, str]:
    """
    Resolve guide tone:
    - user selection: warm / rational / strict (preferred)
    - auto by theme default otherwise
    """
    gt = getattr(intake, "guide_tone", None)
    if gt and isinstance(gt, str) and gt.strip().lower() in VALID_TONES:
        return gt.strip().lower(), "User Selected"
    default = THEME_DEFAULT_TONE.get(selected_theme_id, "warm")
    return default, f"Auto by theme {selected_theme_id}"


def _get_recommended_theme_id(core_emotion: str, intensity: int) -> str:
    """
    Fallback rule using core_emotion/intensity.
    """
    e = (core_emotion or "").lower()
    if any(x in e for x in ["stress", "anxiety", "depressed", "tired", "panic"]):
        return "self_compassion"
    if any(x in e for x in ["worry", "overthink", "rumination", "fear", "anger"]):
        return "thought_labeling"
    if any(x in str(e) for x in ["fatigue", "burnout", "exhausted", "lethargy", "low energy"]):
        return "micro_task_bridging"
    if intensity >= 7:
        return "self_compassion"
    return "thought_labeling"


_THEME_SCORE_KEYWORDS: dict[str, list[str]] = {
    "self_compassion": [
        "stress",
        "anxiety",
        "overwhelmed",
        "panic",
        "depressed",
        "sad",
        "fear",
        "tired",
        "exhausted",
        "fragile",
    ],
    "thought_labeling": [
        "worry",
        "overthink",
        "rumination",
        "fear",
        "anger",
        "judgment",
        "spiral",
        "catastrophic",
        "analyzing",
        "stuck",
    ],
    "micro_task_bridging": [
        "unmotivated",
        "procrastinate",
        "overloaded",
        "task",
        "low",
        "tired",
        "dragged",
        "numb",
        "bored",
        "distracted",
    ],
}


def _score_theme_for_intake(theme_id: str, intake: StrictIntakeInput) -> float:
    """
    Rule score (0~10) from intake fields.
    """
    if theme_id not in VALID_THEME_IDS:
        return 0.0
    keywords = _THEME_SCORE_KEYWORDS.get(theme_id, [])
    score = 0.0
    raw = " ".join(
        [
            (intake.core_emotion or ""),
            (intake.situation_context or ""),
            (intake.immediate_goal or ""),
        ]
    ).lower()
    for kw in keywords:
        if kw in raw:
            score += 2.0
    if intake.intensity >= 7 and theme_id == "self_compassion":
        score += 1.5
    if intake.intensity <= 4 and theme_id == "micro_task_bridging":
        score += 0.5
    return min(10.0, score + 1.0)


def get_theme_recommendations(
    intake: StrictIntakeInput,
    intent: Optional[str] = None,
) -> Tuple[List[ThemeRecommendation], str, List[str]]:
    """
    Return sorted recommendation list and default theme.
    """
    trace: List[str] = []
    default_id = _intent_to_default_theme_id(intent)
    if default_id is not None:
        trace.append(f"Intent matched: default_theme_id={default_id}")
        ordered = list(THEME_LIBRARY)
        ordered.sort(
            key=lambda t: (
                t.theme_id != default_id,
                -(_score_theme_for_intake(t.theme_id, intake)),
            )
        )
        trace.append(f"Selected default_theme_id={default_id}")
        return ordered, default_id, trace

    trace.append(
        "Scoring themes by intake (core_emotion, situation_context, immediate_goal, intensity)"
    )
    scored: List[Tuple[ThemeRecommendation, float]] = [
        (t, _score_theme_for_intake(t.theme_id, intake)) for t in THEME_LIBRARY
    ]
    scored.sort(key=lambda x: (-x[1], x[0].theme_id))
    ordered = [t for t, _ in scored]
    default_id = ordered[0].theme_id
    for t, s in scored:
        trace.append(f"theme_id={t.theme_id} score={s:.1f}")
    trace.append(f"Selected default_theme_id={default_id} (1st by score)")
    return ordered, default_id, trace


def _resolve_task_atom(
    intake: StrictIntakeInput,
    scenario_id: str,
    block_type: str,
) -> str:
    """
    Coach-first TaskAtomChooser integration.
    """
    if block_type != "activation":
        return ""
    default_task = get_default_task_for_scenario(scenario_id)
    mode = get_settings().MODULE_MODE
    chooser = get_task_atom_chooser(mode)
    return chooser.choose(intake, scenario_id, default_task, context=None)


INTERVENTION_COOLDOWN_MS = 12000
INTERVENTION_TYPES = {
    "SOFT_CUE",
    "POSTURE_RESET",
    "BREATH_PACE",
    "REPEAT_LAST_CAPTION",
    "PAUSE_YOUTUBE",
    "SEEK_YOUTUBE",
    "RESUME_YOUTUBE",
}


def _num(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_signal_interventions(
    intake: StrictIntakeInput,
    signal_degrade: bool,
    confidence: Optional[float],
    selected_video_id: Optional[str],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Map multimodal signals to interventions.
    If signal_degrade/confidence is low, no interventions are emitted.
    """
    trace: List[str] = []
    face = intake.face_data if isinstance(getattr(intake, "face_data", None), dict) else {}
    posture = (
        intake.posture_data if isinstance(getattr(intake, "posture_data", None), dict) else {}
    )
    quality = _num(face.get("quality")) or 0.0
    tension_delta = _num(face.get("tension_delta"))
    perclos = _num(face.get("perclos"))
    breath_rate = _num(face.get("breath_rate"))
    hr = _num(face.get("heart_rate"))
    hr_conf = _num(face.get("heart_rate_confidence")) or 0.0
    posture_score = _num(posture.get("posture_score"))
    posture_bad_sec = _num(posture.get("bad_posture_sec")) or 0.0
    posture_conf = _num(posture.get("confidence"))
    if posture_conf is None:
        posture_conf = _num(posture.get("quality")) or 0.0
    shoulder_tilt_deg = _num(posture.get("shoulder_tilt_deg"))
    torso_tilt_deg = _num(posture.get("torso_tilt_deg"))
    posture_cue = posture.get("cue") if isinstance(posture.get("cue"), str) else None
    has_video = bool(selected_video_id and str(selected_video_id).strip())

    trace.append(
        "signal_input:"
        f" quality={quality:.2f}"
        f" tension_delta={tension_delta}"
        f" perclos={perclos}"
        f" breath_rate={breath_rate}"
        f" heart_rate={hr}"
        f" heart_rate_conf={hr_conf:.2f}"
        f" posture_score={posture_score}"
        f" posture_bad_sec={posture_bad_sec:.1f}"
        f" posture_conf={posture_conf:.2f}"
        f" confidence={confidence}"
        f" signal_degrade={signal_degrade}"
    )

    if signal_degrade or (confidence is not None and confidence < 0.45) or quality < 0.45:
        trace.append("intervention_suppressed: unstable_signal")
        return [], trace

    interventions: List[Dict[str, Any]] = []

    if tension_delta is not None and tension_delta >= 0.22:
        interventions.append(
            {
                "type": "SOFT_CUE",
                "params": {"cue": "jaw_brow_release"},
                "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                "reason": f"tension_delta={tension_delta:.2f}",
            }
        )
        if has_video and tension_delta >= 0.3:
            interventions.append(
                {
                    "type": "PAUSE_YOUTUBE",
                    "params": {},
                    "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                    "reason": f"high_tension_delta={tension_delta:.2f}",
                }
            )

    if (
        posture_conf >= 0.45
        and posture_bad_sec >= 8.0
        and (posture_score is None or posture_score <= 0.58)
    ):
        cue = posture_cue
        if not cue:
            if shoulder_tilt_deg is not None and abs(shoulder_tilt_deg) >= 8.0:
                cue = "Relax shoulders and flatten chest."
            elif torso_tilt_deg is not None and abs(torso_tilt_deg) >= 10.0:
                cue = "Align torso and return chest to neutral."
            else:
                cue = "Gently re-check neck and shoulder alignment."
        interventions.append(
            {
                "type": "POSTURE_RESET",
                "params": {"target": "neck_shoulders", "cue": cue},
                "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                "reason": (
                    f"posture_score={posture_score if posture_score is not None else 'n/a'}"
                    f"/bad_sec={posture_bad_sec:.1f}"
                ),
            }
        )

    if perclos is not None and perclos >= 0.38:
        interventions.append(
            {
                "type": "POSTURE_RESET",
                "params": {"target": "head_shoulders"},
                "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                "reason": f"perclos={perclos:.2f}",
            }
        )
        interventions.append(
            {
                "type": "REPEAT_LAST_CAPTION",
                "params": {},
                "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                "reason": f"perclos={perclos:.2f}",
            }
        )
        if has_video:
            interventions.append(
                {
                    "type": "SEEK_YOUTUBE",
                    "params": {"delta_sec": -5},
                    "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                    "reason": "perclos_rewind",
                }
            )

    if breath_rate is not None and (breath_rate >= 20 or breath_rate <= 7):
        target = 6 if breath_rate >= 20 else 8
        interventions.append(
            {
                "type": "BREATH_PACE",
                "params": {"target_bpm": target},
                "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                "reason": f"breath_rate={breath_rate:.1f}",
            }
        )

    if (
        hr is not None
        and hr_conf >= 0.4
        and hr >= 105
        and breath_rate is not None
        and breath_rate >= 20
    ):
        interventions.append(
            {
                "type": "REPEAT_LAST_CAPTION",
                "params": {},
                "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                "reason": f"hr={hr:.0f}/br={breath_rate:.1f}",
            }
        )

    if has_video and tension_delta is not None and tension_delta <= 0.05 and quality >= 0.65:
        interventions.append(
            {
                "type": "RESUME_YOUTUBE",
                "params": {},
                "cooldown_ms": INTERVENTION_COOLDOWN_MS,
                "reason": "stable_recovery",
            }
        )

    dedup: Dict[str, Dict[str, Any]] = {}
    for iv in interventions:
        iv_type = str(iv.get("type") or "")
        if iv_type not in INTERVENTION_TYPES:
            continue
        if iv_type not in dedup:
            dedup[iv_type] = iv

    result = list(dedup.values())
    trace.append(
        "interventions_selected:" + (", ".join(iv["type"] for iv in result) if result else "none")
    )
    return result, trace


def decide_interventions(
    intake: StrictIntakeInput,
    signal_degrade: bool = False,
    confidence: Optional[float] = None,
    selected_video_id: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Public helper for signal-driven interventions."""
    return _build_signal_interventions(
        intake=intake,
        signal_degrade=signal_degrade,
        confidence=confidence,
        selected_video_id=selected_video_id,
    )


def decide_action(
    intake: StrictIntakeInput,
    selected_theme_id: str,
    signal_degrade: bool = False,
    confidence: Optional[float] = None,
    selected_video_id: Optional[str] = None,
) -> Tuple[GuidanceAction, List[str], List[Dict[str, Any]]]:
    """
    Convert intake + selected_theme_id into GuidanceAction and traces.
    Failover to standard grounding when signal quality is degraded.
    """
    trace: List[str] = []
    trace.append(
        f"selected_theme_id={selected_theme_id} "
        f"signal_degrade={signal_degrade} confidence={confidence}"
    )
    policy_interventions, intervention_trace = _build_signal_interventions(
        intake=intake,
        signal_degrade=signal_degrade,
        confidence=confidence,
        selected_video_id=selected_video_id,
    )
    trace.extend(intervention_trace)

    force_grounding = signal_degrade or (confidence is not None and confidence < 0.4)

    if force_grounding:
        trace.append("Failover: using scenario_id=standard_grounding")
        scenario_blocks = load_reference_scenario("standard_grounding")
        action = GuidanceAction(
            phase="grounding",
            block_type="grounding_breath",
            prompt_style="calm",
            instruction_kind="instruction",
            task_atom=None,
            constraints={},
            safety_guards={},
            output_mode="caption",
            scenario_id="standard_grounding",
            scenario_blocks=scenario_blocks,
            pace="normal",
            intervention_rate="med",
            reference_scenario=scenario_blocks if scenario_blocks else None,
        )
        tone, tone_source = resolve_guide_tone(intake, selected_theme_id)
        trace.append(f"Tone: {tone}({tone_source})")
        action = action.model_copy(update={"guide_tone": tone})
        trace.append(f"scenario_blocks={len(scenario_blocks)} pace=normal")
        return action, trace, policy_interventions

    theme_to_action: dict[str, GuidanceAction] = {
        "self_compassion": GuidanceAction(
            phase="self_compassion",
            block_type="self_compassion",
            prompt_style="calm",
            instruction_kind="instruction",
            task_atom=None,
            constraints={},
            safety_guards={},
            output_mode="caption",
        ),
        "thought_labeling": GuidanceAction(
            phase="defusion",
            block_type="defusion",
            prompt_style="calm",
            instruction_kind="instruction",
            task_atom=None,
            constraints={},
            safety_guards={},
            output_mode="caption",
        ),
        "micro_task_bridging": GuidanceAction(
            phase="activation",
            block_type="activation",
            prompt_style="calm",
            instruction_kind="instruction",
            task_atom="",
            constraints={},
            safety_guards={},
            output_mode="caption",
        ),
    }

    action = theme_to_action.get(selected_theme_id, theme_to_action["thought_labeling"])
    scenario_id = selected_theme_id
    scenario_blocks = load_reference_scenario(scenario_id)
    if not scenario_blocks and selected_theme_id != "grounding_breath":
        scenario_blocks = load_reference_scenario("grounding_breath")
        scenario_id = "grounding_breath"

    tone, tone_source = resolve_guide_tone(intake, selected_theme_id)
    trace.append(f"Tone: {tone}({tone_source})")

    mode = get_settings().MODULE_MODE
    task_atom = (
        _resolve_task_atom(intake, scenario_id, action.block_type)
        if action.block_type == "activation"
        else action.task_atom
    )
    if action.block_type == "activation":
        trace.append(
            f"TaskAtomChooser({mode}): task_atom="
            f"{task_atom[:50]}{'...' if len(task_atom) > 50 else ''}"
        )

    update_payload: dict = {
        "scenario_id": scenario_id,
        "scenario_blocks": scenario_blocks,
        "pace": "normal",
        "intervention_rate": "med",
        "reference_scenario": scenario_blocks if scenario_blocks else None,
        "guide_tone": tone,
    }
    if action.block_type == "activation":
        update_payload["task_atom"] = task_atom

    action = action.model_copy(update=update_payload)
    trace.append(f"scenario_id={scenario_id} scenario_blocks={len(scenario_blocks)}")
    return action, trace, policy_interventions
