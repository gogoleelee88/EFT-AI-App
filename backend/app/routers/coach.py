from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.models.chat import ChatMember, ChatMessage, ChatRoom
from backend.app.models.coach import CoachSnapshot
from backend.app.schemas.coach import CoachAnalyzeRequest, CoachAnalyzeResponse, CoachContext
from backend.app.services.auth_helpers import get_current_user
from backend.app.services.chat_service import build_attachment_context, get_contact_for_owner, get_room_for_user
from backend.app.services.coach_engine import CoachEngine
from backend.app.services.context_ingest_service import ingest_room_context_chunks
from backend.app.services.gmail_service import (
    get_gmail_message_detail_for_contact,
    get_gmail_threads_with_contact,
)
from backend.app.services.openai_coach_provider import OpenAICoachProvider
from backend.app.services.profile_cache_service import get_or_build_profile_cache
from backend.app.services.rag_context_service import retrieve_context_bundle
from backend.database import get_db
from backend.models.proposal_os import AspirationProfile, CapabilityProfile, Signal
from backend.models.user import User


router = APIRouter(tags=["coach"])
engine = CoachEngine(provider=OpenAICoachProvider())


def _merge_context(request_context: CoachContext, room) -> CoachContext:
    return CoachContext(
        relationship=request_context.relationship or room.default_relationship,
        goal=request_context.goal or room.default_goal,
        image_goal=request_context.image_goal or list(room.default_image_goal or []),
        banned_tones=request_context.banned_tones or list(room.default_banned_tones or []),
        language=request_context.language or "ko",
        default_send_policy=request_context.default_send_policy or room.default_send_policy,
    )


def _build_context_brief(*, summary_text: str, profile: dict | None) -> str:
    lines: list[str] = []
    summary = (summary_text or "").strip()
    if summary:
        lines.append(f"summary: {summary}")

    if isinstance(profile, dict) and profile:
        decision_style = profile.get("decision_style")
        tone_style = profile.get("tone_style")
        risk_aversion = profile.get("risk_aversion")
        approval_speed = profile.get("approval_speed")
        price_sensitivity = profile.get("price_sensitivity")
        pushback_intensity = profile.get("pushback_intensity")
        confidence = profile.get("confidence")
        common_objections = profile.get("common_objections") or []
        approval_triggers = profile.get("approval_triggers") or []

        profile_line = (
            "profile:"
            f" style={decision_style}, tone={tone_style},"
            f" risk={risk_aversion}, speed={approval_speed},"
            f" price={price_sensitivity}, pushback={pushback_intensity},"
            f" confidence={confidence}"
        )
        lines.append(profile_line)

        if common_objections:
            lines.append(f"objections: {', '.join(str(item) for item in common_objections[:3])}")
        if approval_triggers:
            lines.append(f"triggers: {', '.join(str(item) for item in approval_triggers[:3])}")

    return "\n".join([line for line in lines if line]).strip()


def _build_extra_context(
    db: Session,
    *,
    room_id: str,
    current_user: User,
    draft_text: str,
    their_last_message: str | None = None,
    thread_summary: str | None = None,
    attachment_ids: list[str] | None = None,
) -> dict:
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).one_or_none()
    members = (
        db.query(ChatMember)
        .filter(ChatMember.room_id == room_id)
        .all()
    )
    member_user_ids = [m.user_id for m in members]
    counterparty_ids = [uid for uid in member_user_ids if uid != current_user.id]

    recent_messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
        .all()
    )
    recent_messages_payload = [
        {
            "sender_user_id": msg.sender_user_id,
            "text": msg.text,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        }
        for msg in reversed(recent_messages)
    ]

    my_asp = db.query(AspirationProfile).filter(AspirationProfile.user_id == current_user.id).one_or_none()
    my_cap = db.query(CapabilityProfile).filter(CapabilityProfile.user_id == current_user.id).one_or_none()
    my_signals = (
        db.query(Signal)
        .filter(Signal.user_id == current_user.id)
        .order_by(Signal.created_at.desc())
        .limit(5)
        .all()
    )

    target_bundle = []
    for target_user_id in counterparty_ids[:2]:
        target_asp = db.query(AspirationProfile).filter(AspirationProfile.user_id == target_user_id).one_or_none()
        target_cap = db.query(CapabilityProfile).filter(CapabilityProfile.user_id == target_user_id).one_or_none()
        target_signals = (
            db.query(Signal)
            .filter(Signal.user_id == target_user_id)
            .order_by(Signal.created_at.desc())
            .limit(5)
            .all()
        )
        target_bundle.append(
            {
                "user_id": target_user_id,
                "aspiration_profile": {
                    "aspiration_statement": target_asp.aspiration_statement if target_asp else None,
                    "target_identity": target_asp.target_identity if target_asp else None,
                    "north_star_goal": target_asp.north_star_goal if target_asp else None,
                    "values": (target_asp.values if target_asp else None) or [],
                    "constraints": (target_asp.constraints if target_asp else None) or [],
                },
                "capability_profile": {
                    "strengths": (target_cap.strengths if target_cap else None) or [],
                    "domain_focus": (target_cap.domain_focus if target_cap else None) or [],
                },
                "recent_signals": [
                    {
                        "signal_type": s.signal_type,
                        "source": s.source,
                        "title": s.title,
                        "body": s.body,
                        "created_at": s.created_at.isoformat() if s.created_at else None,
                    }
                    for s in target_signals
                ],
            }
        )

    gmail_threads_summary: dict | None = None
    contact_email_for_context: str | None = None
    if room is None:
        contact_email_for_context = None
    elif room.contact_id:
        try:
            contact = get_contact_for_owner(db=db, owner_user_id=room.owner_user_id, contact_id=room.contact_id)
            contact_email_for_context = contact.email
        except Exception:
            contact_email_for_context = None

    if contact_email_for_context is None and room is not None:
        contact_email_for_context = (
            db.query(User.email)
            .join(ChatMember, ChatMember.user_id == User.id)
            .filter(ChatMember.room_id == room.id, ChatMember.user_id != room.owner_user_id)
            .order_by(ChatMember.joined_at.asc())
            .scalar_one_or_none()
        )

    if contact_email_for_context:
        try:
            threads = get_gmail_threads_with_contact(
                db=db,
                user_id=room.owner_user_id,
                contact_email=contact_email_for_context,
                limit=10,
            )
            body_samples: list[str] = []
            for thread in threads[:3]:
                msg_id = thread.get("id")
                if not msg_id:
                    continue
                detail = get_gmail_message_detail_for_contact(
                    db=db,
                    user_id=room.owner_user_id,
                    contact_email=contact_email_for_context,
                    message_id=str(msg_id),
                )
                body = (detail or {}).get("body_text")
                if body:
                    body_samples.append(str(body)[:2000])
            gmail_threads_summary = {
                "contact_id": room.contact_id or "",
                "contact_email": contact_email_for_context,
                "count": len(threads),
                "subjects": [t.get("subject") for t in threads if t.get("subject")][:8],
                "snippets": [t.get("snippet") for t in threads if t.get("snippet")][:5],
                "body_samples": body_samples,
            }
        except Exception:
            gmail_threads_summary = None

    attachment_context = build_attachment_context(
        db=db,
        room_id=room_id,
        user_id=current_user.id,
        attachment_ids=attachment_ids,
        limit=6,
    )

    contact_id = room.contact_id if room else None
    chat_texts = [str(item.get("text") or "").strip() for item in recent_messages_payload if item.get("text")]
    email_texts: list[str] = []
    if isinstance(gmail_threads_summary, dict):
        email_texts.extend(
            [str(item).strip() for item in (gmail_threads_summary.get("subjects") or []) if str(item).strip()]
        )
        email_texts.extend(
            [str(item).strip() for item in (gmail_threads_summary.get("snippets") or []) if str(item).strip()]
        )
        email_texts.extend(
            [str(item).strip() for item in (gmail_threads_summary.get("body_samples") or []) if str(item).strip()]
        )
    attachment_texts = [str(item.get("excerpt") or "").strip() for item in attachment_context if item.get("excerpt")]

    ingest_stats = ingest_room_context_chunks(
        db=db,
        room_id=room_id,
        contact_id=contact_id,
        chat_texts=chat_texts,
        email_texts=email_texts,
        attachment_texts=attachment_texts,
    )
    query_text = " ".join(
        [
            (draft_text or "").strip(),
            (their_last_message or "").strip(),
            (thread_summary or "").strip(),
        ]
    ).strip()

    rag_bundle = retrieve_context_bundle(
        db=db,
        room_id=room_id,
        contact_id=contact_id,
        query_text=query_text or draft_text,
        top_k=8,
    )
    profile_bundle = get_or_build_profile_cache(
        db=db,
        room_id=room_id,
        contact_id=contact_id,
    )

    evidence_items: list[str] = []
    for item in rag_bundle.get("evidence_items", []):
        if isinstance(item, str) and item.strip():
            evidence_items.append(item.strip())
    if profile_bundle:
        for item in profile_bundle.get("evidence", []):
            if isinstance(item, str) and item.strip():
                evidence_items.append(f"[profile] {item.strip()[:90]}")
    deduped_evidence: list[str] = []
    seen = set()
    for item in evidence_items:
        key = item[:120]
        if key in seen:
            continue
        seen.add(key)
        deduped_evidence.append(item)
        if len(deduped_evidence) >= 3:
            break

    context_brief = _build_context_brief(
        summary_text=rag_bundle.get("summary_text") or "",
        profile=(profile_bundle or {}).get("profile") if isinstance(profile_bundle, dict) else None,
    )

    return {
        "my_profile": {
            "user_id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "aspiration_profile": {
                "aspiration_statement": my_asp.aspiration_statement if my_asp else None,
                "target_identity": my_asp.target_identity if my_asp else None,
                "north_star_goal": my_asp.north_star_goal if my_asp else None,
                "values": (my_asp.values if my_asp else None) or [],
                "constraints": (my_asp.constraints if my_asp else None) or [],
            },
            "capability_profile": {
                "strengths": (my_cap.strengths if my_cap else None) or [],
                "domain_focus": (my_cap.domain_focus if my_cap else None) or [],
            },
            "recent_signals": [
                {
                    "signal_type": s.signal_type,
                    "source": s.source,
                    "title": s.title,
                    "body": s.body,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in my_signals
            ],
        },
        "counterparties": target_bundle,
        "room_recent_messages": recent_messages_payload,
        "contact_email_threads_summary": gmail_threads_summary,
        "room_attachments_summary": attachment_context,
        "retrieved_context_summary": rag_bundle.get("summary_text") or "",
        "retrieved_context_items": rag_bundle.get("items") or [],
        "cached_counterparty_profile": (profile_bundle or {}).get("profile") if profile_bundle else None,
        "counterparty_profile_confidence": (profile_bundle or {}).get("confidence") if profile_bundle else None,
        "context_ingest_stats": ingest_stats,
        "evidence_items": deduped_evidence,
        "context_brief": context_brief,
    }


@router.post("/api/coach/analyze", response_model=CoachAnalyzeResponse)
def post_coach_analyze(
    body: CoachAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = None
    merged_request = body
    extra_context: dict = {}
    try:
        room, _ = get_room_for_user(db=db, room_id=body.room_id, user_id=current_user.id)
        merged_context = _merge_context(request_context=body.context, room=room)
        merged_request = CoachAnalyzeRequest(room_id=body.room_id, context=merged_context, message=body.message)
        try:
            extra_context = _build_extra_context(
                db=db,
                room_id=room.id,
                current_user=current_user,
                draft_text=body.message.my_draft,
                their_last_message=body.message.their_last_message,
                thread_summary=body.message.thread_summary,
                attachment_ids=body.message.attachment_ids,
            )
        except Exception:
            extra_context = {}
    except HTTPException:
        raise
    except Exception:
        extra_context = {}

    try:
        result = engine.analyze(merged_request, extra_context=extra_context)
    except Exception:
        result = engine.analyze(merged_request)
    if not result.evidence_items:
        result.evidence_items = [str(item) for item in extra_context.get("evidence_items", []) if str(item).strip()][:3]

    if room is not None:
        snapshot = CoachSnapshot(
            room_id=room.id,
            user_id=current_user.id,
            message_id=None,
            request_payload=merged_request.model_dump(),
            result_payload=result.model_dump(),
        )
        db.add(snapshot)
        db.commit()

    return result


