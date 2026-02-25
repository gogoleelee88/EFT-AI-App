from __future__ import annotations

import re
from typing import Optional

from work_guide.image_annotator import annotate_first_step, decode_data_url_base64, image_size_from_bytes
from work_guide.llm import get_work_guide_llm
from work_guide.log_store import append_plan_log
from work_guide.schemas import (
    BBox,
    Candidate,
    DomNode,
    DomPlanRequest,
    DomPlanResponse,
    ScreenshotPlanRequest,
    ScreenshotPlanResponse,
    Step,
    StepConfirm,
    StepFallback,
    StepPlan,
    StepTarget,
)


def _tokenize_goal(goal: str) -> list[str]:
    raw = re.split(r"[\s,./()]+", (goal or "").strip().lower())
    out: list[str] = []
    for token in raw:
        if len(token) >= 2:
            out.append(token)
    return out[:20]


def _node_text(node: DomNode) -> str:
    parts = [node.text or "", node.ariaLabel or "", node.role or "", node.tag or "", node.pathHint or ""]
    return " ".join(parts).strip()


def _css_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _candidate_label_from_node(node: DomNode) -> str:
    base = (node.text or node.ariaLabel or node.id or node.pathHint or "candidate").strip()
    return base[:120]


def _selector_from_node(node: DomNode) -> Optional[str]:
    if node.id:
        return f"#{_css_escape(node.id)}"
    if node.ariaLabel:
        return f'[aria-label="{_css_escape(node.ariaLabel)}"]'
    if node.role and node.tag:
        return f'{node.tag}[role="{_css_escape(node.role)}"]'
    if node.tag and node.classes:
        cls = next((c for c in node.classes if c), "")
        if cls:
            return f"{node.tag}.{_css_escape(cls)}"
    if node.pathHint:
        return node.pathHint[:512]
    return None


def _score_node(node: DomNode, *, goal_tokens: list[str], step_index: int) -> int:
    text = _node_text(node).lower()
    score = 0
    for token in goal_tokens:
        if token in text:
            score += 3

    step_keywords = {
        1: ["search", "input", "field", "text", "start", "open"],
        2: ["next", "go", "button", "detail", "filter"],
        3: ["confirm", "save", "submit", "complete", "done"],
    }
    for keyword in step_keywords.get(step_index, []):
        if keyword.lower() in text:
            score += 4

    if node.role in {"button", "link"}:
        score += 1
    if node.ariaLabel:
        score += 1
    if node.text:
        score += 1
    return score


def _clamp_bbox(bbox: Optional[BBox], *, img_w: int, img_h: int) -> Optional[BBox]:
    if bbox is None:
        return None
    x = max(0, min(img_w - 1, int(bbox.x)))
    y = max(0, min(img_h - 1, int(bbox.y)))
    w = max(1, int(bbox.w))
    h = max(1, int(bbox.h))
    if x + w > img_w:
        w = max(1, img_w - x)
    if y + h > img_h:
        h = max(1, img_h - y)
    return BBox(x=x, y=y, w=w, h=h)


def _default_title(step_index: int) -> str:
    if step_index == 1:
        return "1?짢챗쨀: ?챙 챘짼챠쩌 챙째쩐챗쨍째"
    if step_index == 2:
        return "2?짢챗쨀: ?쨉챙짭 ??짧짤 ?챠"
    return "3?짢챗쨀: ?짚챙 챙짠챠 챘짼챠쩌 ?챠"


def _heuristic_dom_step(goal: str, step_index: int, nodes: list[DomNode]) -> Step:
    goal_tokens = _tokenize_goal(goal)
    ranked = sorted(
        nodes,
        key=lambda n: _score_node(n, goal_tokens=goal_tokens, step_index=step_index),
        reverse=True,
    )
    picked = ranked[0] if ranked else None
    alt = ranked[1] if len(ranked) > 1 else None

    if picked is None:
        return Step(
            id=f"s{step_index}",
            title=_default_title(step_index),
            instruction=f"{step_index}?짢챗쨀챘징?챙짠챠?챙쨍?? ?챘짤쨈?챙 챗쨈??챘짼챠쩌??챙째쩐챙 ?쨈챘짝?챙쨍??",
            target=StepTarget(type="text_hint", text_hint=goal[:150] or "?짚챙 챘짼챠쩌"),
            fallback=StepFallback(),
            confirm=StepConfirm(needed=True, question="??챘짼챠쩌??챘짠챘??"),
            candidates=[
                Candidate(label="?챘짤쨈 ?챘짢 챘짤챘쨈", confidence=0.4),
                Candidate(label="?챘짤쨈 챙짚챙 챙짙쩌챙 챘짼챠쩌", confidence=0.4),
            ],
        )

    selector = _selector_from_node(picked)
    text_hint = _candidate_label_from_node(picked)
    candidates: list[Candidate] = [
        Candidate(
            label=text_hint,
            selector=selector,
            confidence=0.75,
        )
    ]
    if alt is not None:
        candidates.append(
            Candidate(
                label=_candidate_label_from_node(alt),
                selector=_selector_from_node(alt),
                confidence=0.6,
            )
        )
    if len(candidates) < 2:
        candidates.append(Candidate(label="?짚챙 챗쨈??챘짼챠쩌", confidence=0.45))

    return Step(
        id=f"s{step_index}",
        title=_default_title(step_index),
        instruction=f"'{text_hint}' ?챙챘짜??쨈챘짝?챙쨍?? ?챘 ?쨈챘짝? ?챙? ?챗쨀 ?챘쨈챘짠??챗쨀쨉?짤챘??",
        target=StepTarget(type="selector", selector=selector, text_hint=text_hint),
        fallback=StepFallback(),
        confirm=StepConfirm(
            needed=True,
            question="???챙챗째 챘짧짤챠 챙짠챠??챘짠챘 챘짼챠쩌?쨍챗???",
        ),
        candidates=candidates[:2],
    )


def _heuristic_screenshot_step(goal: str, step_index: int, img_w: int, img_h: int) -> Step:
    box_w = max(80, int(img_w * 0.28))
    box_h = max(48, int(img_h * 0.12))
    box1 = BBox(
        x=max(0, int(img_w * 0.5 - box_w * 0.5)),
        y=max(0, int(img_h * 0.22)),
        w=min(box_w, img_w),
        h=min(box_h, img_h),
    )
    box2 = BBox(
        x=max(0, int(img_w * 0.58)),
        y=max(0, int(img_h * 0.36)),
        w=min(box_w, max(1, img_w - int(img_w * 0.58))),
        h=min(box_h, max(1, img_h - int(img_h * 0.36))),
    )
    return Step(
        id=f"s{step_index}",
        title=_default_title(step_index),
        instruction=f"?챘짤쨈?챙 '{goal[:80]}' 챗쨈??챘짼챠쩌??챙째쩐챙 1챘짼?챘째챙짚챘짜??째챙 ?챙쨍???쨈챘짝?챙쨍??",
        target=StepTarget(type="bbox", bbox=box1, text_hint="primary action"),
        fallback=StepFallback(bbox=box1),
        confirm=StepConfirm(needed=True, question="1챘짼??챘쨀쨈챗째 챘짧짤챠 챘짼챠쩌??챘짠챘??"),
        candidates=[
            Candidate(label="?챘쨀쨈 1", bbox=box1, confidence=0.62),
            Candidate(label="?챘쨀쨈 2", bbox=box2, confidence=0.54),
        ],
    )


def _normalize_dom_step(step: Step, *, goal: str, step_index: int, nodes: list[DomNode]) -> Step:
    if step.target.type not in {"selector", "text_hint"}:
        step.target.type = "text_hint"
    if not step.id:
        step.id = f"s{step_index}"
    if not step.title:
        step.title = _default_title(step_index)
    if not step.instruction:
        step.instruction = f"{step_index}?짢챗쨀 ?챘쨈?챘?? 챗쨈???챙챘짜??쨈챘짝?챙쨍??"

    if step.target.type == "selector" and not step.target.selector:
        heuristic = _heuristic_dom_step(goal, step_index, nodes)
        step.target.selector = heuristic.target.selector
        step.target.text_hint = step.target.text_hint or heuristic.target.text_hint

    if not step.target.text_hint:
        step.target.text_hint = (step.candidates[0].label if step.candidates else goal[:120]) or "next action"

    fixed_candidates: list[Candidate] = []
    for item in step.candidates[:2]:
        fixed_candidates.append(
            Candidate(
                label=item.label[:120] or "candidate",
                selector=(item.selector[:512] if item.selector else None),
                confidence=max(0.0, min(1.0, float(item.confidence))),
            )
        )
    while len(fixed_candidates) < 2:
        fixed_candidates.append(Candidate(label=f"candidate {len(fixed_candidates) + 1}", confidence=0.45))
    step.candidates = fixed_candidates[:2]

    if step.confirm.question and not step.confirm.needed:
        step.confirm.needed = True
    if not step.confirm.question and step.confirm.needed:
        step.confirm.question = "???챙챗째 챘짠챘??"

    if step.target.type == "selector" and not step.target.selector:
        step.target.type = "text_hint"

    return step


def _normalize_screenshot_step(step: Step, *, goal: str, step_index: int, img_w: int, img_h: int) -> Step:
    if not step.id:
        step.id = f"s{step_index}"
    if not step.title:
        step.title = _default_title(step_index)
    if not step.instruction:
        step.instruction = f"{step_index}?짢챗쨀 ?쨈챘짝 ?챙쨔챘짜??챙쨍?챙쨍??"

    if step.target.type not in {"bbox", "text_hint"}:
        step.target.type = "bbox"

    step.target.bbox = _clamp_bbox(step.target.bbox, img_w=img_w, img_h=img_h)
    step.fallback.bbox = _clamp_bbox(step.fallback.bbox, img_w=img_w, img_h=img_h)

    if step.target.bbox is None and step.fallback.bbox is not None:
        step.target.bbox = step.fallback.bbox
        step.target.type = "bbox"
    if step.fallback.bbox is None and step.target.bbox is not None:
        step.fallback.bbox = step.target.bbox
    if step.fallback.bbox is None:
        step = _heuristic_screenshot_step(goal, step_index, img_w, img_h)

    fixed_candidates: list[Candidate] = []
    for item in step.candidates[:2]:
        candidate_bbox = _clamp_bbox(item.bbox, img_w=img_w, img_h=img_h)
        if candidate_bbox is None:
            candidate_bbox = step.fallback.bbox or step.target.bbox
        fixed_candidates.append(
            Candidate(
                label=item.label[:120] or "candidate",
                bbox=candidate_bbox,
                confidence=max(0.0, min(1.0, float(item.confidence))),
            )
        )
    while len(fixed_candidates) < 2:
        idx = len(fixed_candidates)
        bbox = step.fallback.bbox if idx == 0 else step.target.bbox
        fixed_candidates.append(
            Candidate(
                label=f"?챘쨀쨈 {idx + 1}",
                bbox=bbox,
                confidence=0.5 - idx * 0.05,
            )
        )
    step.candidates = fixed_candidates[:2]

    if not step.confirm.question:
        step.confirm.question = "???챙쨔챗째 챘짠챘??"
    step.confirm.needed = True
    if not step.target.text_hint:
        step.target.text_hint = "click target"
    return step


async def build_dom_plan(req: DomPlanRequest) -> DomPlanResponse:
    llm = get_work_guide_llm()
    limited_nodes = req.dom_summary[:200]
    step = await llm.plan_dom_step(
        goal=req.goal,
        locale=req.locale,
        context_text=req.context_text,
        url=req.url,
        step_index=req.step_index,
        max_steps=req.max_steps,
        dom_summary=limited_nodes,
    )
    if step is None:
        step = _heuristic_dom_step(req.goal, req.step_index, limited_nodes)
    step = _normalize_dom_step(step, goal=req.goal, step_index=req.step_index, nodes=limited_nodes)

    plan = StepPlan(
        mode="dom",
        goal=req.goal,
        step_index=req.step_index,
        total_steps_hint=max(3, req.max_steps),
        steps=[step],
    )
    append_plan_log(plan)
    return DomPlanResponse(step_plan=plan)


async def build_screenshot_plan(req: ScreenshotPlanRequest) -> ScreenshotPlanResponse:
    image_bytes = decode_data_url_base64(req.screenshot_base64)
    img_w, img_h = image_size_from_bytes(image_bytes)
    data_url = f"data:image/png;base64,{req.screenshot_base64.split(',', 1)[-1]}"

    llm = get_work_guide_llm()
    step = await llm.plan_screenshot_step(
        goal=req.goal,
        locale=req.locale,
        context_text=req.context_text,
        step_index=req.step_index,
        max_steps=req.max_steps,
        img_w=img_w,
        img_h=img_h,
        screenshot_data_url=data_url,
    )
    if step is None:
        step = _heuristic_screenshot_step(req.goal, req.step_index, img_w, img_h)
    step = _normalize_screenshot_step(step, goal=req.goal, step_index=req.step_index, img_w=img_w, img_h=img_h)

    plan = StepPlan(
        mode="screenshot",
        goal=req.goal,
        step_index=req.step_index,
        total_steps_hint=max(3, req.max_steps),
        steps=[step],
    )
    append_plan_log(plan)

    annotated = annotate_first_step(image_bytes, step)
    return ScreenshotPlanResponse(
        step_plan=plan,
        annotated_image_base64=annotated,
        img_w=img_w,
        img_h=img_h,
    )

