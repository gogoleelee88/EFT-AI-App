"""
Â§14 ë¸ë¡ ?ë??LLM). ?¸ì ?ì 1??LLM?ê² ë¸ë¡ ì¡°í© JSONë§?ë°ì ê²ì¦????ëë¦¬ì¤ ?¤í.
?¤í¨ ??ê¸°ì¡´ scenarios.json ê³ì ?ëë¦¬ì¤ë¡??´ë°±.
"""
from __future__ import annotations

import json
import re
from typing import Any, Callable, List, Optional, Tuple

from backend.models.chat_models import StrictIntakeInput
from backend.domain_types.guidance_schema import (
    PlannerBlock,
    PlannerPlan,
    ScenarioBlock,
)
from utils.logger import get_logger

logger = get_logger(__name__)

ALLOWED_BLOCK_TYPES = frozenset([
    "breath_regulation", "body_release", "defusion",
    "self_compassion", "activation", "grounding",
])

PLANNER_PROMPT_TEMPLATE = """You are a planner. Output MUST be a single JSON object and nothing else.

Task:
Given the user's STRICT fields and recent session feedback, propose a safe sequence of meditation blocks.

Allowed block types:
["breath_regulation","body_release","defusion","self_compassion","activation","grounding"]

Constraints:
- Output JSON schema:
{{
  "total_target_s": integer,
  "blocks": [{{"type": string, "duration_s": integer, "intensity": number}}]
}}
- blocks length: 2 to 6
- duration_s per block: 30 to 300
- sum(duration_s) must be within total_target_s Â± 60
- intensity: 0.0 to 1.0
- Do NOT output any text besides the JSON.
- Do NOT invent new block types.

Input STRICT:
{STRICT_PAYLOAD}

Recent feedback summary:
{FEEDBACK_SUMMARY}

Choose total_target_s based on user's state:
- high arousal / stress: 240~420s
- neutral: 360~600s
- low energy / sleepy: 240~480s with activation near the end

Return JSON only."""

# ?ë??ë¸ë¡ type ??ScenarioBlock??base_text / adapt_instruction (ìµì)
PLANNER_BLOCK_DEFAULTS: dict[str, dict[str, Any]] = {
    "grounding": {
        "base_text": "?¸ì?ê² ?ì ê°ê³ ?¸í¡??ì§ì¤?©ë??",
        "adapt_instruction": None,
    },
    "breath_regulation": {
        "base_text": "ì²ì²???¨ì ?¤ì´?¬ê³ ?´ì¬??ë³´ì¸?? ì§ê¸????ê°?ë§ ì§ì¤??ë³´ì¸??",
        "adapt_instruction": None,
    },
    "body_release": {
        "base_text": "ëª¸ì´ ë°ë¥???¿ë ?ë???ê»´ ë³´ì¸?? ?´ê¹¨??ê¸´ì¥???´ë¤ë³´ì¸??",
        "adapt_instruction": None,
    },
    "defusion": {
        "base_text": "?¤ì´?¤ë ?ê°? ê·¸ë¥ '?ê°'??ë¿ì´?ì. ë¶ì?????ë³´ì¸??",
        "adapt_instruction": "?¬ì©???ìê³?ê°ì??ë°ì???°ë»?ê² ?ë§??ê³µê°???? ?¤ì ?¨ê³ë¡??´ì´ì£¼ì¸??",
    },
    "self_compassion": {
        "base_text": "ì§ê¸??ë¼??ê°ì???ë ê·¸ë?ë¡??¸ì??ë³´ì¸?? ê´ì°®?ì.",
        "adapt_instruction": "?¬ì©?ì ?ì¬ ?ìê³?ê°ì???¸ê¸?ë©° ê³µê°?ë ë©í¸ë¥???ë¬¸ì¥?¼ë¡ ì¶ê??´ì£¼?¸ì.",
    },
    "activation": {
        "base_text": "ëªì???ëë©?ë°ë¡ ?????ë ?ì? ???ëë§??í´ ë³´ì¸??",
        "adapt_instruction": "task_atom??ê·¸ë?ë¡??¬í¨?ì¬ ??ë¬¸ì¥?¼ë¡ ?ë´?´ì£¼?¸ì.",
    },
}


def _build_strict_payload(intake: StrictIntakeInput) -> str:
    parts = [
        f"core_emotion: {intake.core_emotion or 'ë¯¸ì'}",
        f"situation_context: {intake.situation_context or 'ë¯¸ì'}",
        f"automatic_thought: {intake.automatic_thought or 'ë¯¸ì'}",
        f"immediate_goal: {intake.immediate_goal or 'ë¯¸ì'}",
        f"intensity(1-10): {intake.intensity}",
        f"available_time(min): {intake.available_time or 'ë¯¸ì'}",
    ]
    return "\n".join(parts)


def validate_plan(plan: PlannerPlan) -> Tuple[bool, Optional[str]]:
    """
    ?ë² ê²ì¦? blocks 2~6, duration_s 30~300, intensity 0~1,
    sum(duration_s) within total_target_s Â± 60, ?ì© typeë§?
    ë°í: (True, None) ?ë (False, fallback_reason).
    """
    if len(plan.blocks) < 2 or len(plan.blocks) > 6:
        return False, "constraints"
    total_s = sum(b.duration_s for b in plan.blocks)
    if abs(total_s - plan.total_target_s) > 60:
        return False, "constraints"
    for b in plan.blocks:
        if b.type not in ALLOWED_BLOCK_TYPES:
            return False, "constraints"
    return True, None


def _parse_planner_json(raw: str) -> Optional[PlannerPlan]:
    """LLM ì¶ë¥?ì JSONë§?ì¶ì¶??PlannerPlan ?ì±. ?¤í¨ ??None."""
    raw = (raw or "").strip()
    # ```json ... ``` ?ë {...} ì¶ì¶
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if m:
        raw = m.group(1).strip()
    m2 = re.search(r"\{[\s\S]*\}", raw)
    if m2:
        raw = m2.group(0)
    try:
        data = json.loads(raw)
        blocks_raw = data.get("blocks") or []
        total_target_s = int(data.get("total_target_s", 480))
        blocks = []
        for i, b in enumerate(blocks_raw):
            t = (b.get("type") or "").strip().lower()
            if t not in ALLOWED_BLOCK_TYPES:
                return None
            dur = int(b.get("duration_s", 120))
            if dur < 30 or dur > 300:
                return None
            intensity = float(b.get("intensity", 0.5))
            intensity = max(0.0, min(1.0, intensity))
            blocks.append(PlannerBlock(type=t, duration_s=dur, intensity=intensity))
        if len(blocks) < 2 or len(blocks) > 6:
            return None
        plan = PlannerPlan(total_target_s=total_target_s, blocks=blocks)
        ok, reason = validate_plan(plan)
        if not ok:
            return None
        return plan
    except Exception as e:
        logger.debug("planner JSON parse failed: %s", e)
        return None


def invoke_planner(
    intake: StrictIntakeInput,
    feedback_summary: str,
    chat_completion_fn: Optional[Callable[..., Any]] = None,
) -> Tuple[Optional[PlannerPlan], Optional[str]]:
    """
    ?ë??LLM ?¸ì¶ ??JSON ?ì±Â·ê²ì¦?
    chat_completion_fn??None?´ë©´ VLLMClient().chat_completion ?¬ì©.
    ë°í: (PlannerPlan, None) ?±ê³µ ?? (None, fallback_reason) ?¤í¨ ??
    fallback_reason: "json_parse" | "schema" | "constraints" | "llm_failed"
    """
    strict_payload = _build_strict_payload(intake)
    feedback = feedback_summary.strip() or "No prior feedback"
    prompt = PLANNER_PROMPT_TEMPLATE.format(
        STRICT_PAYLOAD=strict_payload,
        FEEDBACK_SUMMARY=feedback,
    )
    messages = [
        {"role": "system", "content": "You output only valid JSON. No other text."},
        {"role": "user", "content": prompt},
    ]
    if chat_completion_fn is None:
        from services.vllm_client import VLLMClient
        chat_completion_fn = VLLMClient().chat_completion
    try:
        resp = chat_completion_fn(messages, tier="free", max_tokens=400)
        content = ""
        if resp and "choices" in resp and resp["choices"]:
            content = (resp["choices"][0].get("message") or {}).get("content") or ""
        plan = _parse_planner_json(content)
        if plan is None:
            return None, "json_parse" if not content.strip() else "schema"
        return plan, None
    except Exception as e:
        logger.warning("planner LLM invoke failed: %s", e)
        return None, "llm_failed"


def get_crisis_fixed_scenario_blocks() -> List[ScenarioBlock]:
    """crisis/emergency ???ì©?ë ê³ì ?ë: grounding 120s + breath_regulation 120s."""
    return [
        ScenarioBlock(
            block_id="crisis_grounding_1",
            type="grounding",
            base_text="?¸ì?ê² ?ì ê°ê³ ?¸í¡??ì§ì¤?©ë??",
            adapt_instruction=None,
            min_hold_ms=2000,
            max_hold_ms=4000,
        ),
        ScenarioBlock(
            block_id="crisis_breath_2",
            type="breath_regulation",
            base_text="ì²ì²???¨ì ?¤ì´?¬ê³ ?´ì¬??ë³´ì¸?? ì§ê¸????ê°?ë§ ì§ì¤??ë³´ì¸??",
            adapt_instruction=None,
            min_hold_ms=2000,
            max_hold_ms=4000,
        ),
    ]


def planner_blocks_to_scenario_blocks(blocks: List[PlannerBlock]) -> List[ScenarioBlock]:
    """PlannerBlock ë¦¬ì¤????ScenarioBlock ë¦¬ì¤?? duration_s ??min_hold_ms/max_hold_ms."""
    out: List[ScenarioBlock] = []
    for i, b in enumerate(blocks):
        defaults = PLANNER_BLOCK_DEFAULTS.get(b.type, PLANNER_BLOCK_DEFAULTS["grounding"])
        base = defaults.get("base_text") or "?¤ì ?¨ê³ë¡??ì´ê° ë³´ì¸??"
        adapt = defaults.get("adapt_instruction")
        # duration_s(ì´? ??hold_ms: ???ë¸ë¡ ê¸¸ì´??ë¹ë?
        min_ms = max(2000, b.duration_s * 8)   # ìµì 2ì´?
        max_ms = min(6000, b.duration_s * 12)  # ìµë? 6ì´?
        out.append(
            ScenarioBlock(
                block_id=f"planner_{b.type}_{i}",
                type=b.type,
                base_text=base,
                adapt_instruction=adapt,
                min_hold_ms=min_ms,
                max_hold_ms=max_ms,
            )
        )
    return out


