from __future__ import annotations

import json
import os
from typing import Any, Optional, Protocol

from openai import AsyncOpenAI

from config.settings import get_settings
from work_guide.schemas import BBox, Candidate, DomNode, Step, StepConfirm, StepFallback, StepTarget


class WorkGuideLLM(Protocol):
    async def plan_screenshot_step(
        self,
        *,
        goal: str,
        locale: str,
        context_text: Optional[str],
        step_index: int,
        max_steps: int,
        img_w: int,
        img_h: int,
        screenshot_data_url: str,
    ) -> Optional[Step]:
        ...

    async def plan_dom_step(
        self,
        *,
        goal: str,
        locale: str,
        context_text: Optional[str],
        url: str,
        step_index: int,
        max_steps: int,
        dom_summary: list[DomNode],
    ) -> Optional[Step]:
        ...


def _extract_json_object(raw_text: str) -> Optional[dict[str, Any]]:
    if not raw_text:
        return None

    decoder = json.JSONDecoder()
    for idx, ch in enumerate(raw_text):
        if ch != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(raw_text[idx:])
        except Exception:
            continue
        if isinstance(obj, dict):
            return obj
    return None


def _bbox_from_obj(obj: Any) -> Optional[BBox]:
    if not isinstance(obj, dict):
        return None
    try:
        return BBox(
            x=int(obj.get("x", 0)),
            y=int(obj.get("y", 0)),
            w=max(1, int(obj.get("w", 1))),
            h=max(1, int(obj.get("h", 1))),
        )
    except Exception:
        return None


def _candidate_from_obj(obj: Any) -> Optional[Candidate]:
    if not isinstance(obj, dict):
        return None
    label = str(obj.get("label") or "").strip()
    if not label:
        return None
    confidence_raw = obj.get("confidence", 0.5)
    try:
        confidence = float(confidence_raw)
    except Exception:
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))
    selector = obj.get("selector")
    selector_out = str(selector).strip() if isinstance(selector, str) and selector.strip() else None
    return Candidate(
        label=label[:120],
        selector=selector_out,
        bbox=_bbox_from_obj(obj.get("bbox")),
        confidence=confidence,
    )


def _step_from_obj(obj: dict[str, Any], *, default_id: str) -> Optional[Step]:
    title = str(obj.get("title") or "").strip()
    instruction = str(obj.get("instruction") or "").strip()
    if not title or not instruction:
        return None

    target_obj = obj.get("target") if isinstance(obj.get("target"), dict) else {}
    target_type = str(target_obj.get("type") or "").strip()
    if target_type not in {"selector", "bbox", "text_hint"}:
        target_type = "text_hint"
    target = StepTarget(
        type=target_type,  # type: ignore[arg-type]
        selector=str(target_obj.get("selector") or "").strip() or None,
        text_hint=str(target_obj.get("text_hint") or "").strip() or None,
        bbox=_bbox_from_obj(target_obj.get("bbox")),
    )

    fallback_obj = obj.get("fallback") if isinstance(obj.get("fallback"), dict) else {}
    fallback_bbox = _bbox_from_obj(fallback_obj.get("bbox"))
    fallback = StepFallback(bbox=fallback_bbox)

    confirm_obj = obj.get("confirm") if isinstance(obj.get("confirm"), dict) else {}
    confirm = StepConfirm(
        needed=bool(confirm_obj.get("needed", False)),
        question=str(confirm_obj.get("question") or "").strip() or None,
    )

    candidates_raw = obj.get("candidates") if isinstance(obj.get("candidates"), list) else []
    candidates: list[Candidate] = []
    for item in candidates_raw[:2]:
        parsed = _candidate_from_obj(item)
        if parsed is not None:
            candidates.append(parsed)

    step_id = str(obj.get("id") or default_id).strip() or default_id
    return Step(
        id=step_id[:64],
        title=title[:120],
        instruction=instruction[:500],
        target=target,
        fallback=fallback,
        confirm=confirm,
        candidates=candidates,
    )


class OpenAIWorkGuideLLM:
    def __init__(self) -> None:
        settings = get_settings()
        api_key = (settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY") or "").strip()
        self._client = AsyncOpenAI(api_key=api_key, timeout=45.0) if api_key else None
        env_model = (os.getenv("WORK_GUIDE_OPENAI_MODEL") or "").strip()
        self._model = env_model or (settings.OPENAI_MODEL or "gpt-5.2")

    async def _call_json(self, *, prompt: str, screenshot_data_url: Optional[str] = None) -> Optional[dict[str, Any]]:
        if self._client is None:
            return None

        content: list[dict[str, Any]] = [{"type": "input_text", "text": prompt}]
        if screenshot_data_url:
            content.append({"type": "input_image", "image_url": screenshot_data_url})

        try:
            response = await self._client.responses.create(
                model=self._model,
                input=[{"role": "user", "content": content}],
                max_output_tokens=800,
                temperature=0.2,
            )
        except Exception:
            return None

        parsed = _extract_json_object((response.output_text or "").strip())
        return parsed

    async def plan_screenshot_step(
        self,
        *,
        goal: str,
        locale: str,
        context_text: Optional[str],
        step_index: int,
        max_steps: int,
        img_w: int,
        img_h: int,
        screenshot_data_url: str,
    ) -> Optional[Step]:
        prompt = (
            "You are a UI click guide assistant.\n"
            "Return JSON object only with fields:\n"
            "id,title,instruction,target{type,selector,text_hint,bbox{x,y,w,h}},"
            "fallback{bbox{x,y,w,h}},confirm{needed,question},"
            "candidates[{label,selector,bbox{x,y,w,h},confidence}] (max 2).\n"
            "Constraints:\n"
            "- One single step only.\n"
            "- This is screenshot mode, use bbox with integer pixels in original image coordinates.\n"
            "- If uncertain, set confirm.needed=true and include 2 candidates.\n"
            f"- locale={locale}, goal={goal}, step_index={step_index}, max_steps={max_steps}, img_w={img_w}, img_h={img_h}\n"
            f"- context_text={context_text or ''}\n"
        )
        obj = await self._call_json(prompt=prompt, screenshot_data_url=screenshot_data_url)
        if not isinstance(obj, dict):
            return None
        return _step_from_obj(obj, default_id=f"s{step_index}")

    async def plan_dom_step(
        self,
        *,
        goal: str,
        locale: str,
        context_text: Optional[str],
        url: str,
        step_index: int,
        max_steps: int,
        dom_summary: list[DomNode],
    ) -> Optional[Step]:
        dom_items = [item.model_dump() for item in dom_summary[:200]]
        prompt = (
            "You are a UI click guide assistant.\n"
            "Return JSON object only with fields:\n"
            "id,title,instruction,target{type,selector,text_hint},"
            "fallback{bbox{x,y,w,h}},confirm{needed,question},"
            "candidates[{label,selector,confidence}] (max 2).\n"
            "Constraints:\n"
            "- One single step only.\n"
            "- Use target.type='selector' with a stable selector when possible.\n"
            "- If uncertain, set confirm.needed=true and include 2 candidates.\n"
            f"- locale={locale}, goal={goal}, url={url}, step_index={step_index}, max_steps={max_steps}\n"
            f"- context_text={context_text or ''}\n"
            f"- dom_summary_json={json.dumps(dom_items, ensure_ascii=True)}\n"
        )
        obj = await self._call_json(prompt=prompt)
        if not isinstance(obj, dict):
            return None
        return _step_from_obj(obj, default_id=f"s{step_index}")


_work_guide_llm: Optional[OpenAIWorkGuideLLM] = None


def get_work_guide_llm() -> WorkGuideLLM:
    global _work_guide_llm
    if _work_guide_llm is None:
        _work_guide_llm = OpenAIWorkGuideLLM()
    return _work_guide_llm

