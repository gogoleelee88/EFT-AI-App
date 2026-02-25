from __future__ import annotations

from datetime import datetime, timezone

from schemas.proposal_os import (
    ProposalChecklistItem,
    ProposalDraft,
    ProposalEvidenceCard,
    ProposalResearchPackItem,
    ProposalTodo,
    SignalResponse,
)


def build_research_prompt_bundle(
    role_inference: str,
    todos: list[ProposalTodo],
    signals: list[SignalResponse],
) -> list[ProposalResearchPackItem]:
    signal_context = [f"{s.signal_type}:{s.title}" for s in signals[:4]]
    todo_context = [t.title for t in todos[:4]]

    prompts = [
        "?ì¥??ê²ì¦? ?ê¹?ë¬¸ì??ë¹ë/ê°ë/ì§ë¶ì??ê°?¤ì ê²ì¦í??ì§ë¬¸ 10ê°ë? ?ì±",
        "?¸ë??ê²?? ìµê·¼ 90??ë³???ì, ?ì±, ì±ë, ê¸°ì)ë¥?ë¹êµ?ë ì²´í¬?¬ì¸???ì±",
        "ê²½ì/ê°ê²? ?ì²´ì¬ 5ê°ë? ê°?íê³??¬ì??ëê³?ê°ê²?ë¹êµ ?ë???ì",
        "ì±ë ?¤í: ?¤ë ?¤í ê°?¥í ?ì ì±ë 3ê°ì? ì¸¡ì ì§???ì",
    ]

    return [
        ProposalResearchPackItem(
            topic=f"{role_inference} / Research Track {idx + 1}",
            prompt_bundle=[
                base_prompt,
                f"ì»¨í?¤í¸-?ë¬´: {', '.join(todo_context) if todo_context else 'N/A'}",
                f"ì»¨í?¤í¸-?í¸: {', '.join(signal_context) if signal_context else 'N/A'}",
            ],
            status="queued",
        )
        for idx, base_prompt in enumerate(prompts)
    ]


def run_phase2_research(
    role_inference: str,
    research_pack: list[ProposalResearchPackItem],
) -> dict[str, object]:
    completed_pack: list[ProposalResearchPackItem] = []
    evidence_cards: list[ProposalEvidenceCard] = []
    updated_drafts: list[ProposalDraft] = []
    updated_checklist: list[ProposalChecklistItem] = []

    now_label = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    for idx, pack in enumerate(research_pack):
        completed_pack.append(
            ProposalResearchPackItem(
                topic=pack.topic,
                prompt_bundle=pack.prompt_bundle,
                status="done",
            )
        )
        evidence_cards.append(
            ProposalEvidenceCard(
                title=f"Research Evidence {idx + 1}",
                source_type="phase2_research",
                summary=f"{pack.topic} ê´??ê²???ë???ì± ?ë£ ({now_label})",
            )
        )

    updated_drafts.append(
        ProposalDraft(
            draft_type="memo",
            title="Phase-2 ê·¼ê±° ?ì½ ë©ëª¨",
            content=(
                "1) ?µì¬ ê°??n2) ë°ì¦ ê°?¥ì±\n3) ì¶ê? ê²ì¦?ê³í\n"
                "4) ?¹ì¸ ?ì² ë²ì\n5) ë³´ë¥ ?´ì"
            ),
            status="refined",
        )
    )

    updated_checklist.extend(
        [
            ProposalChecklistItem(
                item_text="ë¦¬ìì¹?ê·¼ê±° 1ì°?ê²???ë£ ?¬ë?",
                category="research",
                is_required=True,
                is_done=False,
            ),
            ProposalChecklistItem(
                item_text="?¹ì¸???ì¸ ì§ë¬¸ ë°ì¡",
                category="approval",
                is_required=True,
                is_done=False,
            ),
        ]
    )

    return {
        "research_pack": completed_pack,
        "evidence_cards": evidence_cards,
        "drafts": updated_drafts,
        "checklist": updated_checklist,
    }

