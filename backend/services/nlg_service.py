"""
MoodTalk v2.0 NLG Service.
- ?챘챘짝짭챙짚 챗째챙: reference_scenario + 챗째챙/?챙 ??Qwen 챗째챙 ??Fallback ??base_text 챗쨌쨍챘?챘징?
- 챗쨍째챙징쨈: Qwen NLG ?챘 챘징챙쨩짭 ?챠챘짝??쨈챘째짹.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from backend.models.chat_models import StrictIntakeInput
from backend.domain_types.guidance_schema import (
    CaptionItem,
    GuidanceAction,
    GuidanceCursor,
    ScenarioBlock,
    GUIDANCE_INTERVENTION_TYPES,
)
from utils.logger import get_logger

logger = get_logger(__name__)

_OPENAI_CLIENT = None
_GUIDANCE_MODEL = os.getenv("GUIDANCE_OPENAI_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5.2"
_GUIDANCE_MAX_OUTPUT_TOKENS = 220


def _get_openai_client():
    """Lazy-init OpenAI client for guidance Responses API."""
    global _OPENAI_CLIENT
    if _OPENAI_CLIENT is not None:
        return _OPENAI_CLIENT
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return None
    try:
        from openai import OpenAI

        _OPENAI_CLIENT = OpenAI(api_key=api_key, timeout=20.0)
        return _OPENAI_CLIENT
    except Exception as exc:
        logger.warning("OpenAI client init failed for guidance: %s", exc)
        return None


def _extract_response_text(resp: Any) -> str:
    """Extract plain text safely from Responses API payload."""
    text = getattr(resp, "output_text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    parts: List[str] = []
    output_items = getattr(resp, "output", None) or []
    for item in output_items:
        item_type = getattr(item, "type", None)
        if item_type is None and isinstance(item, dict):
            item_type = item.get("type")
        if item_type != "message":
            continue
        content_items = getattr(item, "content", None)
        if content_items is None and isinstance(item, dict):
            content_items = item.get("content")
        for content in content_items or []:
            ctype = getattr(content, "type", None)
            if ctype is None and isinstance(content, dict):
                ctype = content.get("type")
            if ctype not in {"output_text", "text"}:
                continue
            ctext = getattr(content, "text", None)
            if ctext is None and isinstance(content, dict):
                ctext = content.get("text")
            if isinstance(ctext, str) and ctext.strip():
                parts.append(ctext.strip())
    return "\n".join(parts).strip()


def _responses_generate(system_prompt: str, user_prompt: str, max_output_tokens: int) -> Tuple[str, str]:
    """Generate guidance text through OpenAI Responses API."""
    client = _get_openai_client()
    if client is None:
        raise RuntimeError("OpenAI client unavailable for guidance")

    response = client.responses.create(
        model=_GUIDANCE_MODEL,
        input=[
            {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_prompt}]},
        ],
        max_output_tokens=max_output_tokens,
    )
    text = _extract_response_text(response)
    if not text:
        raise ValueError("Empty response text from Responses API")
    model_name = getattr(response, "model", None) or _GUIDANCE_MODEL
    return text, model_name


def _to_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_posture_desc(intake: StrictIntakeInput) -> str:
    """Compact posture summary for prompt context."""
    posture = getattr(intake, "posture_data", None)
    if not isinstance(posture, dict):
        return ""
    score = _to_float(posture.get("posture_score"))
    bad_sec = _to_float(posture.get("bad_posture_sec"))
    shoulder = _to_float(posture.get("shoulder_tilt_deg"))
    torso = _to_float(posture.get("torso_tilt_deg"))
    cue = posture.get("cue")
    parts: List[str] = []
    if score is not None:
        parts.append(f"score={score:.2f}")
    if bad_sec is not None:
        parts.append(f"bad_posture_sec={bad_sec:.1f}")
    if shoulder is not None:
        parts.append(f"shoulder_tilt_deg={shoulder:.1f}")
    if torso is not None:
        parts.append(f"torso_tilt_deg={torso:.1f}")
    if isinstance(cue, str) and cue.strip():
        parts.append(f"cue={cue.strip()}")
    return ", ".join(parts)

# ?챠챘짝?챗짼쩍챘징
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_TEMPLATES_PATH = _DATA_DIR / "templates.json"

# Guard: Hard-command denylist (?챗쨍째) / 챙짠챘짢횂쨌챘짧챘쨔 챗쨍챙?
DENYLIST_PHRASES = [
    "shutdown",
    "reboot",
    "format",
    "rm -rf",
    "del /s",
    "sudo",
    "powershell",
]
# 챙짚챘쨔 챗쨍????MIN_LINE_CHARS = 5
MAX_LINE_CHARS = 120
MAX_LINES = 2

# 챗쨍째챘쨀쨍 hold_ms
DEFAULT_HOLD_MS = [2500, 3000]
# ?챘챘짝짭챙짚 챘쨍챘징챘쨀?챗쨍째챘쨀쨍 hold_ms (Chunk 챘짱쨍챙짭????
SCENARIO_HOLD_MS = {"intro": 2500, "bridge_advice": 3500, "main": 3000, "outro": 2500}
# Chunk??챙쨉챘? 챙쨘징챙 ??(MVP: captions 챙쨉챘? 2챗째챘짠 챘째챠)
CHUNK_MAX_CAPTIONS = 2

# Grand Master v2: ?짚챘쨀 NLG 챙짠??(Dynamic Tone)
TONE_PROMPT: dict[str, str] = {
    "warm": "?? ?째챘쨩??챙쨔챗쨉짭. 챗쨀쨉챗째 ?챙짙쩌, 챘쨋?챘짭???쨈챙챙짼?~?쨈챙).",
    "rational": "?? 챗짹쨈챙징째???챘짭쨍챗째. ?짤챠쨍 ?챙짙쩌, ?짭챘짭쨈?챙쨍 ?짤챘?짚챙짼쨈(~?짤챘??.",
    "strict": "?? ?짢챠쨍??챙쩍챙쨔. ?챙쩍??챙째짢챘짢. ?? 챘짧챘쨔챙징?~?쨈챘쩌) 챗쨍챙?. 챗째챠 챙짼???~?짤챙?? ~?챙쨍?? ?짭챙짤.",
}

# --- Grand Master v2: Timing Engine (arousal ??hold_ms / silence_ms) ---
DEFAULT_AROUSAL = 0.5
SILENCE_MS_MIN = 500
SILENCE_MS_MAX = 2000
SILENCE_MS_LOW_AROUSAL = 700
SILENCE_MS_HIGH_AROUSAL = 1500
HOLD_AROUSAL_FACTOR_LOW = 0.85   # ?챗째챙짹: hold 챙짠짠챗짼 (?챘짝짭챙짠 ?챗짼)
HOLD_AROUSAL_FACTOR_HIGH = 1.15  # 챗쨀챗째?? hold 챗쨍쨍챗짼 (??챗쨀챘? ?챗째)


def resolve_arousal_level(intake: StrictIntakeInput) -> float:
    """
    ?쨍챠?쨈챠짭?챙 챗째챙짹 ?챙? 0~1 챙쨋챙. arousal_level ?째챙, ?챙쩌챘짤?intensity/10, face_data.intensity.
    """
    val = getattr(intake, "arousal_level", None)
    if val is not None and isinstance(val, (int, float)):
        return max(0.0, min(1.0, float(val)))
    intensity = getattr(intake, "intensity", None)
    if intensity is not None and isinstance(intensity, (int, float)):
        return max(0.0, min(1.0, float(intensity) / 10.0))
    face = getattr(intake, "face_data", None) or {}
    if isinstance(face, dict):
        fi = face.get("intensity") or face.get("arousal")
        if fi is not None:
            return max(0.0, min(1.0, float(fi)))
    return DEFAULT_AROUSAL


def compute_hold_ms(blk: ScenarioBlock, pace: str, arousal_level: float) -> int:
    """
    pace챘징?챗쨍째챘쨀쨍 hold 챗짼째챙 ?? arousal챘징?챘쨀쨈챙. 챗쨀챗째??????챗쨍?hold(챙짠챙), ?챗째챙짹 ????챙짠짠챙? hold.
    """
    base = _hold_ms_for_block(blk, pace)
    t = max(0.0, min(1.0, float(arousal_level)))
    factor = HOLD_AROUSAL_FACTOR_LOW + (HOLD_AROUSAL_FACTOR_HIGH - HOLD_AROUSAL_FACTOR_LOW) * t
    return max(1000, min(8000, int(base * factor)))


def compute_silence_ms(arousal_level: float) -> int:
    """챗쨀챗째?????챘짠 챗째?챙쨔짢챘짭쨉 챗쨍쨍챗짼(1500ms), ?챗째챙짹 ??챙짠짠챗짼(700ms)."""
    t = max(0.0, min(1.0, float(arousal_level)))
    ms = SILENCE_MS_LOW_AROUSAL + (SILENCE_MS_HIGH_AROUSAL - SILENCE_MS_LOW_AROUSAL) * t
    return max(SILENCE_MS_MIN, min(SILENCE_MS_MAX, int(ms)))

# Qwen 챙쨋챘짜 챙쨘징챙 ?챙짹: "\n"챘징?split. 챙짚챘째챗쩔??챙=1챗째? 2챗째?챙쨈챗쨀쩌=챙짝챙 failover.
def parse_caption_lines(content: str) -> Optional[List[str]]:
    """
    Qwen 챙쨋챘짜??챙쨘징챙 챙짚??짢챙챘징??챙짹. 챗쨌챙쨔:
    - "\n"챘징?split.
    - 챙짚챘째챗쩔챙쨈 ?챙쩌챘짤?captions 1챗째챘징 챙짼챘짝짭 (?챙짼쨈챘짜???챙짚챘징).
    - 챙짚챘째챗쩔챙쩌챘징??챘 챗짼째챗쨀쩌챗째 2챗째?챙쨈챗쨀쩌챘짤?None 챘째챠 ??챙짝챙 failover(챘징챙쨩짭 ?챠챘짝?.
    """
    if not content or not isinstance(content, str):
        return None
    raw = content.strip()
    if not raw:
        return None
    lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
    if len(lines) > MAX_LINES:
        return None
    if not lines:
        return [raw]
    return lines[:MAX_LINES]


_INTERVENTION_TYPE_SET = set(GUIDANCE_INTERVENTION_TYPES)


def _normalize_interventions(raw: Any) -> Optional[List[Dict[str, Any]]]:
    """Normalize intervention list to a safe, typed payload."""
    if not isinstance(raw, list):
        return None
    output: List[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        type_raw = str(item.get("type") or "").strip()
        if type_raw not in _INTERVENTION_TYPE_SET:
            continue
        params = item.get("params") if isinstance(item.get("params"), dict) else {}
        cooldown_ms = item.get("cooldown_ms")
        try:
            cooldown_ms = int(cooldown_ms) if cooldown_ms is not None else 0
        except (TypeError, ValueError):
            cooldown_ms = 0
        reason = item.get("reason")
        output.append({
            "type": type_raw,
            "params": params,
            "cooldown_ms": max(0, cooldown_ms),
            "reason": str(reason).strip() if reason is not None else None,
        })
    return output or None


def _parse_json_payload(content: str) -> Tuple[Optional[List[str]], Optional[List[Dict[str, Any]]]]:
    """Parse JSON payload containing captions and optional interventions."""
    if not content or not isinstance(content, str):
        return None, None
    raw = content.strip()
    if not raw.startswith("{"):
        return None, None
    try:
        payload = json.loads(raw)
    except Exception:
        return None, None
    captions_raw = payload.get("captions")
    lines: Optional[List[str]]
    if isinstance(captions_raw, list):
        lines = [str(item).strip() for item in captions_raw if str(item).strip()]
    elif isinstance(captions_raw, str):
        lines = parse_caption_lines(captions_raw)
    else:
        lines = None
    if not lines:
        return None, None
    if len(lines) > MAX_LINES:
        lines = lines[:MAX_LINES]
    interventions = _normalize_interventions(payload.get("interventions"))
    return lines, interventions


def _load_templates() -> dict:
    """챘징챙쨩짭 ?챠챘짝?JSON 챘징챘."""
    if not _TEMPLATES_PATH.exists():
        return {}
    try:
        with open(_TEMPLATES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("templates.json load failed: %s", e)
        return {}


def _fill_slot(text: str, intake: StrictIntakeInput, action: GuidanceAction) -> str:
    """?짭챘징짱 챙쨔챠: {situation_context}, {automatic_thought}, {immediate_goal}, {task_atom}."""
    return (
        text.replace("{situation_context}", intake.situation_context or "")
        .replace("{automatic_thought}", intake.automatic_thought or "")
        .replace("{immediate_goal}", intake.immediate_goal or "")
        .replace("{task_atom}", action.task_atom or "")
    )


def _template_key(action: GuidanceAction) -> str:
    """?챠챘짝??? phase.block_type.prompt_style.instruction_kind"""
    return f"{action.phase}.{action.block_type}.{action.prompt_style}.{action.instruction_kind}"


def _get_local_captions(action: GuidanceAction, intake: StrictIntakeInput) -> List[CaptionItem]:
    """챘징챙쨩짭 ?챠챘짝쩔챙쩌챘징?CaptionItem 챙쨉챘? 2챗째??챙짹."""
    templates = _load_templates()
    key = _template_key(action)
    raw = templates.get(key)
    if not raw or not isinstance(raw, list):
        # 챙쨉챙 ?쨈챘째짹
        return [
            CaptionItem(seq=1, text="?챙 ?짢챙 챗쨀챘짜쨈챘짤????챗째??챙짠챙짚??챘쨀쨈챙쨍??", hold_ms=2500),
        ]
    lines = [_fill_slot(str(t), intake, action) for t in raw[:MAX_LINES] if t]
    if not lines:
        return [CaptionItem(seq=1, text="?짚챙 ?짢챗쨀챘징??챙쨈챗째 챘쨀쨈챙쨍??", hold_ms=2500)]
    return [
        CaptionItem(seq=i + 1, text=line.strip(), hold_ms=DEFAULT_HOLD_MS[i] if i < len(DEFAULT_HOLD_MS) else 3000)
        for i, line in enumerate(lines)
    ]


def _guard_check(
    lines: List[str],
    action: GuidanceAction,
) -> bool:
    """
    Guard 챗짼??
    - task_atom???챙쩌챘짤?챘째챘???챙짼쨈 ?챙짚?쨍챙 ?짭챠짢.
    - denylist ?짭챠짢 ??False.
    - 챗째?챙짚?5~120?? 챙쨉챘? 2챙짚?
    """
    full = " ".join(lines)
    if action.task_atom and action.task_atom.strip():
        if action.task_atom.strip() not in full:
            return False
    for phrase in DENYLIST_PHRASES:
        if phrase in full:
            return False
    if len(lines) > MAX_LINES:
        return False
    for line in lines:
        length = len(line.strip())
        if length < MIN_LINE_CHARS or length > MAX_LINE_CHARS:
            return False
    return True


def _guard_scenario_lines(lines: List[str]) -> bool:
    """?챘챘짝짭챙짚 챗째챙 챗짼째챗쨀쩌 Guard: 챗쨍챙? ?챠 ?챙, 챙짚챘쨔 5~120??"""
    full = " ".join(lines)
    for phrase in DENYLIST_PHRASES:
        if phrase in full:
            return False
    for line in lines:
        ln = line.strip()
        if not ln:
            continue
        if len(ln) < MIN_LINE_CHARS or len(ln) > MAX_LINE_CHARS:
            return False
    return True


def _hold_ms_for_block(blk: ScenarioBlock, pace: str) -> int:
    """pace???째챘쩌 hold_ms 챗짼째챙: slow=max, fast=min, normal=챙짚챗째. (Timing Engine? compute_hold_ms ?짭챙짤)"""
    if pace == "slow":
        return blk.max_hold_ms
    if pace == "fast":
        return blk.min_hold_ms
    return (blk.min_hold_ms + blk.max_hold_ms) // 2


def _fallback_captions_from_scenario(
    blocks: List[ScenarioBlock],
    start_index: int = 0,
    max_count: int = CHUNK_MAX_CAPTIONS,
    pace: str = "normal",
    arousal_level: float = DEFAULT_AROUSAL,
) -> List[CaptionItem]:
    """?챠쩌?째챙짚 ?챘챘짝짭챙짚??base_text챘짜?챗쨌쨍챘?챘징??챘짠?쩌챘징 ?짭챙짤 (API ?짚챠짢 ??. Chunk ?짢챙. arousal챘징?hold_ms 챘쨀쨈챙."""
    out: List[CaptionItem] = []
    for blk in blocks[start_index : start_index + max_count]:
        text = (blk.base_text or "").strip()
        if not text and blk.adapt_instruction:
            text = "챙짠챗쨍??챘쩌??챗쨌쨍챘?챘징?챗쨈챙째짰?챙. 챙짼챙짼???째챘쩌? 챙짙쩌챙쨍??"
        if not text:
            continue
        hold = compute_hold_ms(blk, pace, arousal_level)
        out.append(CaptionItem(seq=len(out) + 1, text=text, hold_ms=hold, type=blk.type))
    if not out:
        hold_default = int(2500 * (HOLD_AROUSAL_FACTOR_LOW + (HOLD_AROUSAL_FACTOR_HIGH - HOLD_AROUSAL_FACTOR_LOW) * arousal_level))
        out.append(CaptionItem(seq=1, text="?챙 ?짢챙 챗쨀챘짜쨈챘짤????챗째??챙짠챙짚??챘쨀쨈챙쨍??", hold_ms=max(1000, min(8000, hold_default)), type="main"))
    return out


def render_scenario_chunk(
    action: GuidanceAction,
    intake: StrictIntakeInput,
    cursor: Optional[GuidanceCursor],
    use_qwen: bool = True,
) -> Tuple[List[CaptionItem], Optional[GuidanceCursor], bool, str, Optional[List[Dict[str, Any]]]]:
    """
    Chunk 챘째짤챙: cursor챗째 챗째챘짝짭챠짚??챘쨍챘징챘쨋??챙쨉챘? 2챙짚챘짠 ?챙짹. next_cursor 챘째챠.
    cursor=null?쨈챘짤쨈 챙짼?Chunk(next_block_index=0).
    base_text 챘쨍챘징? ?챘? ?챙?+??챘짱쨍챙쨍 챙징째챙, adapt_instruction 챘쨍챘징챘짠?LLM??1~2챘짭쨍챙짜 ?챙짹. task_atom 챘쨋챘?.
    """
    blocks = action.scenario_blocks or action.reference_scenario or []
    if not blocks:
        captions, fail, model, interventions = render_captions(action, intake, use_qwen=use_qwen)
        return captions, None, fail, model, interventions

    scenario_id = action.scenario_id or "standard_grounding"
    start = cursor.next_block_index if cursor else 0
    if cursor and cursor.scenario_id != scenario_id:
        start = 0
    chunk = blocks[start : start + CHUNK_MAX_CAPTIONS]
    if not chunk:
        return [], None, True, "local"

    pace = getattr(action, "pace", "normal") or "normal"
    arousal = resolve_arousal_level(intake)
    if not use_qwen:
        captions = _fallback_captions_from_scenario(
            blocks, start_index=start, max_count=CHUNK_MAX_CAPTIONS, pace=pace, arousal_level=arousal
        )
        next_idx = start + len(captions)
        next_cursor = (
            GuidanceCursor(scenario_id=scenario_id, next_block_index=next_idx)
            if next_idx < len(blocks)
            else None
        )
        return captions, next_cursor, True, "local", None

    face = intake.face_data or {}
    # 챘짧챙쨍: quality < 0.5 ??face_data ?챘쨉/챗쨍째챘쨀쨍챗째? NLG?챙??face 챘짱쨍챙짭??face_desc??core_emotion?쩌챘징 fallback)
    if face and float(face.get("quality", 1.0)) < 0.5:
        face = {}
    face_desc = face.get("dominant_emotion", "") or ""
    if face.get("intensity") is not None:
        face_desc = f"{face_desc} (챗째챘 {face.get('intensity')})"
    br = face.get("breath_rate")
    if br is not None:
        if br < 8:
            face_desc = f"{face_desc}, ?쨍챠징: ?챘짝쩌/?챙"
        elif br <= 14:
            face_desc = f"{face_desc}, ?쨍챠징: ?챙"
        else:
            face_desc = f"{face_desc}, ?쨍챠징: 챘쨔챘짝"
    hr = face.get("heart_rate")
    hr_conf = face.get("heart_rate_confidence") or 0
    if hr is not None and hr_conf >= 0.4:
        face_desc = f"{face_desc}, ?짭챘째: ??{int(hr)} BPM"
    if not face_desc:
        face_desc = intake.core_emotion
    posture_desc = _format_posture_desc(intake)

    tone = getattr(action, "guide_tone", None) or "warm"
    tone_instruction = TONE_PROMPT.get(tone, TONE_PROMPT["warm"])
    system = (
        "?쨔챙? 100챘짠??챠챘짼?챘짧챙 ?짚챠짭챘짝쩍챠쨍 챗째챙 ?챗??챘?? "
        "?챘챘짝짭챙짚 챘쨍챘징 ?챙챘짜?챘째챗쩐쨍챙짠 챘짠챙쨍?? "
        f"{tone_instruction} "
        "base_text챗째 ?챘 챘쨍챘징? ?챘?챘짜??챙??챗쨀 ?짚챘짠 챘짱쨍챙쨍 챙징째챙?챙쨍?? "
        "adapt_instruction???챘 챘쨍챘징챘짠??짭챙짤???챠챘짜??쨈챙짤??1~2챘짭쨍챙짜???챙짹?챙쨍?? "
        "activation 챘쨍챘징?챙 task_atom? 챘째챘??챗쨌쨍챘?챘징??짭챠짢?챙쨍??챘짭쨍챙??챘쨋챘?). "
        "챙짠챘짢횂쨌챘짧챘쨔 ?챠(?쨈챘쩌, ?쨈챙쩌 ?챘짚, 챘째챘????? ?짭챙짤?챙? 챘짠챙쨍?? "
        "챙쨋챘짜? ?쨈챘짼 Chunk 챘쨍챘징 ?챙?챘징???챙짚챙 ??챘짭쨍챙짜?? 챙짚챘째챗쩔챙쩌챘징?챗쨉짭챘쨋?챙쨍?? If you need to request an intervention, reply with JSON: {\"captions\":[\"...\"],\"interventions\":[{\"type\":\"PAUSE_GUIDE_AUDIO\",\"params\":{},\"cooldown_ms\":10000,\"reason\":\"...\"}]}."
    )
    scenario_text = "\n".join(
        f"[{b.type}] base_text: {b.base_text or ''} / adapt_instruction: {b.adapt_instruction or ''}".strip()
        for b in chunk
    )
    user_parts = [
        "## ?쨈챘짼 Chunk ?챘챘짝짭챙짚 챘쩌챘? (챙쨉챘? 2챘쨍챘징)",
        scenario_text,
        "## ?짭챙짤???챠",
        f"챗째챙: {intake.core_emotion}",
        f"?챠짤: {intake.situation_context}",
        f"?챘?짭챗쨀: {intake.automatic_thought}",
        f"?챙/챗째챘: {face_desc}",
    ]
    if action.task_atom:
        user_parts.append(f"task_atom (챘째챘??챗쨌쨍챘?챘징??짭챠짢): {action.task_atom}")
    if posture_desc:
        user_parts.append(f"posture: {posture_desc}")
    user_content = "\n".join(user_parts)

    try:
        content, model_used = _responses_generate(
            system_prompt=system,
            user_prompt=user_content,
            max_output_tokens=_GUIDANCE_MAX_OUTPUT_TOKENS,
        )
        content = (content or "").strip()
        lines, interventions = _parse_json_payload(content)
        if lines is None:
            lines = parse_caption_lines(content)
            interventions = None
        if lines is None or not _guard_scenario_lines(lines):
            raise ValueError("scenario guard violation or empty")
        if action.task_atom and action.task_atom.strip():
            full = " ".join(lines)
            if action.task_atom.strip() not in full:
                raise ValueError("task_atom not included")
        captions = []
        for i, blk in enumerate(chunk):
            text = lines[i] if i < len(lines) else (blk.base_text or "?짚챙 ?짢챗쨀챘징??챙쨈챗째 챘쨀쨈챙쨍??").strip()
            hold = compute_hold_ms(blk, pace, arousal)
            captions.append(CaptionItem(seq=i + 1, text=text, hold_ms=hold, type=blk.type))
        next_idx = start + len(captions)
        next_cursor = (
            GuidanceCursor(scenario_id=scenario_id, next_block_index=next_idx)
            if next_idx < len(blocks)
            else None
        )
        return captions, next_cursor, False, model_used, interventions
    except Exception as e:
        logger.warning("NLG scenario chunk fallback to base_text: %s", e)
        captions = _fallback_captions_from_scenario(
            blocks, start_index=start, max_count=CHUNK_MAX_CAPTIONS, pace=pace, arousal_level=arousal
        )
        next_idx = start + len(captions)
        next_cursor = (
            GuidanceCursor(scenario_id=scenario_id, next_block_index=next_idx)
            if next_idx < len(blocks)
            else None
        )
        return captions, next_cursor, True, "local", None


def render_scenario_captions(
    action: GuidanceAction,
    intake: StrictIntakeInput,
    use_qwen: bool = True,
) -> Tuple[List[CaptionItem], bool, str, Optional[List[Dict[str, Any]]]]:
    """
    ?챠쩌?째챙짚 ?챘챘짝짭챙짚 챘쩌챘? + 챗째챙/?챙 ??Qwen 챗째챙 ??CaptionItem 챘짝짭챙짚??
    (?쨍챠) scenario_blocks챗째 ?챙쩌챘짤?cursor=null챘징?render_scenario_chunk ?쨍챙쨋??챙짼?Chunk챘짠?챘째챠.
    """
    blocks = action.scenario_blocks or action.reference_scenario or []
    if not blocks:
        return render_captions(action, intake, use_qwen=use_qwen)
    captions, _, is_failover, model_name, interventions = render_scenario_chunk(
        action, intake, cursor=None, use_qwen=use_qwen
    )
    return captions, is_failover, model_name, interventions


def render_captions(
    action: GuidanceAction,
    intake: StrictIntakeInput,
    use_qwen: bool = True,
) -> Tuple[List[CaptionItem], bool, str, Optional[List[Dict[str, Any]]]]:
    """
    GuidanceAction + StrictIntakeInput ??CaptionItem 챘짝짭챙짚??
    use_qwen=True챘짤?Qwen ?쨍챙쨋 ?챘 ??Guard ?챘째/?챘짭 ??챘징챙쨩짭 ?챠챘짝?
    챘째챠: (captions, is_failover, model_name).
    """
    if not use_qwen:
        captions = _get_local_captions(action, intake)
        return captions, True, "local", None

    try:
        tone = getattr(action, "guide_tone", None) or "warm"
        tone_instruction = TONE_PROMPT.get(tone, TONE_PROMPT["warm"])
        system = (
            "?쨔챙? ?짭챘짝짭 ?챘쨈 챗째?쨈챘 ?짚챠짭챘짝쩍챠째?챘?? "
            f"{tone_instruction} "
            "챙짙쩌챙쨈챙짠?task_atom? ?챙짢 ?챘 챘째챗쩐쨍챙짠 챘짠챗쨀 챗쨌쨍챘?챘징?챘짭쨍챙짜???짭챠짢?챙쨍???챙??챘쨀??챗쨍챙?). "
            "?챙짼쨈 챙쨋챘짜? ?챙째?짚챘짭???챗쨉??챗쨉짭챙쨈챙짼쨈챘징 2챘짭쨍챙짜 ?쨈챘쨈, 챘짭쨍챙짜? 챙짚챘째챗쩔챙쩌챘징?챗쨉짭챘쨋?챙쨍?? If you need to request an intervention, reply with JSON: {\"captions\":[\"...\"],\"interventions\":[{\"type\":\"PAUSE_GUIDE_AUDIO\",\"params\":{},\"cooldown_ms\":10000,\"reason\":\"...\"}]}."
        )
        user_parts = [
            f"core_emotion: {intake.core_emotion}",
            f"situation_context: {intake.situation_context}",
            f"automatic_thought: {intake.automatic_thought}",
            f"immediate_goal: {intake.immediate_goal or ''}",
            f"block_type: {action.block_type}",
        ]
        if action.task_atom:
            user_parts.append(f"task_atom (챘째챘??챗쨌쨍챘?챘징??짭챠짢): {action.task_atom}")
        posture_desc = _format_posture_desc(intake)
        if posture_desc:
            user_parts.append(f"posture: {posture_desc}")
        user_content = "\n".join(user_parts)
        content, model_used = _responses_generate(
            system_prompt=system,
            user_prompt=user_content,
            max_output_tokens=_GUIDANCE_MAX_OUTPUT_TOKENS,
        )
        content = (content or "").strip()
        lines, interventions = _parse_json_payload(content)
        if lines is None:
            lines = parse_caption_lines(content)
            interventions = None
        if lines is None:
            raise ValueError("caption parse: more than 2 lines -> failover")
        if not lines or not _guard_check(lines, action):
            raise ValueError("guard violation")
        arousal = resolve_arousal_level(intake)
        base_holds = [DEFAULT_HOLD_MS[i] if i < len(DEFAULT_HOLD_MS) else 3000 for i in range(len(lines))]
        factor = HOLD_AROUSAL_FACTOR_LOW + (HOLD_AROUSAL_FACTOR_HIGH - HOLD_AROUSAL_FACTOR_LOW) * arousal
        captions = [
            CaptionItem(seq=i + 1, text=ln, hold_ms=max(1000, min(8000, int(base_holds[i] * factor))))
            for i, ln in enumerate(lines)
        ]
        return captions, False, model_used, interventions
    except Exception as e:
        logger.warning("NLG Qwen fallback to local: %s", e)
        captions = _get_local_captions(action, intake)
        return captions, True, "local", None


