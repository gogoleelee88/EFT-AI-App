from __future__ import annotations

import asyncio
import json
import queue
import threading
import time
from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.database import SessionLocal, get_db
from jobs.worker import worker
from backend.models.proposal_os import (
    ArtifactVersion,
    AspirationProfile,
    AuditEvent,
    CapabilityProfile,
    ChecklistItem,
    Draft,
    ProofLog,
    Proposal,
    ProposalTask,
    ResearchJob,
    ResearchResult,
    RiskFlag,
    Signal,
)
from schemas.proposal_os import (
    ProofLogCreateRequest,
    ProofLogResponse,
    ProposalDraftPatchRequest,
    ProposalGenerateRequest,
    ProposalResponse,
    ProposalTaskStatusPatchRequest,
    SSEEnvelope,
    SignalResponse,
)
from services.content_reco import persist_content_recos
from services.proposal_engine import ProposalEngine
from services.research_pack import run_phase2_research

router = APIRouter(tags=["proposal-os-proposals"])
proposal_engine = ProposalEngine()


class ProposalEventBroker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: dict[str, list[queue.Queue[SSEEnvelope]]] = {}
        self._history: dict[str, list[SSEEnvelope]] = {}

    def publish(self, proposal_id: str, event: str, data: dict) -> None:
        envelope = SSEEnvelope(event=event, data=data)
        with self._lock:
            history = self._history.setdefault(proposal_id, [])
            history.append(envelope)
            if len(history) > 100:
                del history[:-100]
            for subscriber in self._subscribers.get(proposal_id, []):
                subscriber.put(envelope)

    def subscribe(self, proposal_id: str) -> tuple[queue.Queue[SSEEnvelope], list[SSEEnvelope]]:
        subscriber: queue.Queue[SSEEnvelope] = queue.Queue()
        with self._lock:
            self._subscribers.setdefault(proposal_id, []).append(subscriber)
            history = list(self._history.get(proposal_id, []))
        return subscriber, history

    def unsubscribe(self, proposal_id: str, subscriber: queue.Queue[SSEEnvelope]) -> None:
        with self._lock:
            subscribers = self._subscribers.get(proposal_id, [])
            if subscriber in subscribers:
                subscribers.remove(subscriber)
            if not subscribers:
                self._subscribers.pop(proposal_id, None)


event_broker = ProposalEventBroker()


def _sse_message(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _to_signal_response(row: Signal) -> SignalResponse:
    return SignalResponse(
        signal_id=row.signal_id,
        user_id=row.user_id,
        signal_type=row.signal_type,  # type: ignore[arg-type]
        source=row.source,
        title=row.title,
        body=row.body,
        metadata=row.metadata_json or {},
        occurred_at=row.occurred_at,
        created_at=row.created_at,
    )


def _proposal_from_row(row: Proposal) -> ProposalResponse:
    if not row.raw_package:
        raise HTTPException(status_code=404, detail="proposal payload not found")
    return ProposalResponse.model_validate(row.raw_package)


def _append_audit(
    db: Session,
    entity_type: str,
    entity_id: str,
    action: str,
    actor: str,
    payload: dict | None = None,
) -> None:
    db.add(
        AuditEvent(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor=actor,
            payload=payload or {},
        )
    )


def _phase2_handler(payload: dict[str, object]) -> None:
    proposal_id = str(payload.get("proposal_id"))
    user_id = str(payload.get("user_id"))
    db = SessionLocal()
    try:
        row = db.query(Proposal).filter(Proposal.proposal_id == proposal_id).one_or_none()
        if row is None or not row.raw_package:
            return

        response = ProposalResponse.model_validate(row.raw_package)
        event_broker.publish(
            proposal_id,
            "proposal.phase2_started",
            {"proposal_id": proposal_id, "phase": "phase2"},
        )

        research_job = ResearchJob(
            proposal_id=proposal_id,
            status="running",
            prompt_bundle=[item.model_dump(mode="json") for item in response.research_pack],
            started_at=datetime.now(timezone.utc),
        )
        db.add(research_job)
        db.commit()
        db.refresh(research_job)

        time.sleep(0.35)
        phase2 = run_phase2_research(
            role_inference=response.role_inference,
            research_pack=response.research_pack,
        )

        response.research_pack = phase2["research_pack"]  # type: ignore[assignment]
        response.evidence_cards.extend(phase2["evidence_cards"])  # type: ignore[arg-type]

        for research_item in response.research_pack:
            db.add(
                ResearchResult(
                    proposal_id=proposal_id,
                    research_job_id=research_job.research_job_id,
                    topic=research_item.topic,
                    summary="Phase-2 챘짝짭챙챙쨔??챘짙",
                    links=[],
                    evidence={"prompt_bundle": research_item.prompt_bundle},
                )
            )

        for draft_item in phase2["drafts"]:  # type: ignore[index]
            draft_row = Draft(
                proposal_id=proposal_id,
                draft_type=draft_item.draft_type,
                title=draft_item.title,
                content=draft_item.content,
                status=draft_item.status,
            )
            db.add(draft_row)
            db.flush()
            draft_item.draft_id = draft_row.draft_id
            response.drafts.append(draft_item)

        for checklist_item in phase2["checklist"]:  # type: ignore[index]
            checklist_row = ChecklistItem(
                proposal_id=proposal_id,
                item_text=checklist_item.item_text,
                category=checklist_item.category,
                is_required=checklist_item.is_required,
                is_done=checklist_item.is_done,
            )
            db.add(checklist_row)
            db.flush()
            checklist_item.checklist_item_id = checklist_row.checklist_item_id
            response.checklist.append(checklist_item)

        response.phase = "phase2"
        response.confidence = round(min(0.99, response.confidence + 0.08), 2)

        row.phase = "phase2"
        row.confidence = response.confidence
        row.raw_package = response.model_dump(mode="json")
        research_job.status = "done"
        research_job.completed_at = datetime.now(timezone.utc)
        db.add(
            ArtifactVersion(
                proposal_id=proposal_id,
                artifact_type="proposal_phase2",
                artifact_id=proposal_id,
                version_no=2,
                content=row.raw_package,
            )
        )
        _append_audit(
            db,
            entity_type="proposal",
            entity_id=proposal_id,
            action="phase2_completed",
            actor=user_id,
            payload={"research_job_id": research_job.research_job_id},
        )
        db.commit()

        event_broker.publish(
            proposal_id,
            "evidence.updated",
            {"proposal_id": proposal_id, "evidence_cards": [e.model_dump(mode="json") for e in response.evidence_cards]},
        )
        event_broker.publish(
            proposal_id,
            "research.completed",
            {"proposal_id": proposal_id, "research_pack": [r.model_dump(mode="json") for r in response.research_pack]},
        )
        event_broker.publish(
            proposal_id,
            "draft.updated",
            {"proposal_id": proposal_id, "drafts": [d.model_dump(mode="json") for d in response.drafts]},
        )
        event_broker.publish(
            proposal_id,
            "checklist.updated",
            {"proposal_id": proposal_id, "checklist": [c.model_dump(mode="json") for c in response.checklist]},
        )
        event_broker.publish(
            proposal_id,
            "done",
            {"proposal_id": proposal_id, "proposal": response.model_dump(mode="json")},
        )
    except Exception:
        db.rollback()
        event_broker.publish(
            proposal_id,
            "done",
            {"proposal_id": proposal_id, "error": "phase2_failed"},
        )
    finally:
        db.close()


worker.register_handler("proposal_phase2", _phase2_handler)


@router.post("/proposal/generate", response_model=ProposalResponse)
@router.post("/api/proposal/generate", response_model=ProposalResponse)
def generate_proposal(body: ProposalGenerateRequest, db: Session = Depends(get_db)) -> ProposalResponse:
    proposal_id = str(uuid4())
    proposal_date = body.proposal_date or date.today()

    for seed_signal in body.seed_signals:
        row = Signal(
            signal_id=str(uuid4()),
            user_id=seed_signal.user_id,
            signal_type=seed_signal.signal_type,
            source=seed_signal.source,
            title=seed_signal.title,
            body=seed_signal.body,
            metadata_json=seed_signal.metadata,
            occurred_at=seed_signal.occurred_at,
        )
        db.add(row)

    aspiration = (
        db.query(AspirationProfile)
        .filter(AspirationProfile.user_id == body.user_id)
        .one_or_none()
    )
    capability = (
        db.query(CapabilityProfile)
        .filter(CapabilityProfile.user_id == body.user_id)
        .one_or_none()
    )
    if aspiration is None:
        aspiration = AspirationProfile(
            user_id=body.user_id,
            aspiration_statement="챙짠??챗째?짜챠 ?짚챠?짜챙 챗째챙쨋 ?챘짭쨍 ?짚챘짭쨈?챗? ?챘짚.",
            target_identity="Please set an identity goal.",
            horizon_90d=[],
            values=[],
            constraints=[],
        )
        db.add(aspiration)
        db.flush()
    if capability is None:
        capability = CapabilityProfile(
            user_id=body.user_id,
            strengths=[],
            experience_highlights=[],
            domain_focus=[],
            certifications=[],
            tool_stack=[],
        )
        db.add(capability)
        db.flush()

    signals = (
        db.query(Signal)
        .filter(Signal.user_id == body.user_id)
        .order_by(Signal.created_at.desc())
        .limit(20)
        .all()
    )
    signal_models = [_to_signal_response(row) for row in signals]

    role_inference = proposal_engine.infer_role(
        aspiration_statement=aspiration.aspiration_statement,
        target_identity=aspiration.target_identity,
        strengths=capability.strengths or [],
        domains=capability.domain_focus or [],
    )
    phase1 = proposal_engine.build_phase1(
        proposal_id=proposal_id,
        role_inference=role_inference,
        context=body.context,
        signals=signal_models,
    )

    proposal_row = Proposal(
        proposal_id=proposal_id,
        user_id=body.user_id,
        proposal_date=proposal_date,
        phase="phase1",
        role_inference=phase1.role_inference,
        confidence=phase1.confidence,
        raw_package=phase1.model_dump(mode="json"),
    )
    db.add(proposal_row)
    db.flush()

    task_rows: list[ProposalTask] = []
    for todo in phase1.today_todos:
        row = ProposalTask(
            proposal_id=proposal_id,
            user_id=body.user_id,
            title=todo.title,
            description=todo.description,
            duration_minutes=todo.duration_minutes,
            priority=todo.priority,
            dependency_task_ids=todo.dependency_task_ids,
            status=todo.status,
        )
        db.add(row)
        db.flush()
        todo.task_id = row.task_id
        task_rows.append(row)

    for idx, todo in enumerate(phase1.today_todos):
        deps = [
            task_rows[dep_idx].task_id
            for dep_idx in todo.dependency_task_ids
            if 0 <= dep_idx < len(task_rows)
        ]
        task_rows[idx].dependency_task_ids = deps
        todo.dependency_task_ids = deps

    for draft in phase1.drafts:
        row = Draft(
            proposal_id=proposal_id,
            draft_type=draft.draft_type,
            title=draft.title,
            content=draft.content,
            status=draft.status,
        )
        db.add(row)
        db.flush()
        draft.draft_id = row.draft_id

    for checklist_item in phase1.checklist:
        row = ChecklistItem(
            proposal_id=proposal_id,
            item_text=checklist_item.item_text,
            category=checklist_item.category,
            is_required=checklist_item.is_required,
            is_done=checklist_item.is_done,
        )
        db.add(row)
        db.flush()
        checklist_item.checklist_item_id = row.checklist_item_id

    for risk in phase1.risk_flags:
        row = RiskFlag(
            proposal_id=proposal_id,
            severity=risk.severity,
            category=risk.category,
            message=risk.message,
            check_question=risk.check_question,
            needs_review=risk.needs_review,
        )
        db.add(row)
        db.flush()
        risk.risk_flag_id = row.risk_flag_id

    persist_content_recos(db, proposal_id=proposal_id, content_recos=phase1.content_recos)
    db.add(
        ArtifactVersion(
            proposal_id=proposal_id,
            artifact_type="proposal_phase1",
            artifact_id=proposal_id,
            version_no=1,
            content=phase1.model_dump(mode="json"),
        )
    )
    _append_audit(
        db,
        entity_type="proposal",
        entity_id=proposal_id,
        action="generated_phase1",
        actor=body.user_id,
        payload={"role_inference": phase1.role_inference},
    )
    proposal_row.raw_package = phase1.model_dump(mode="json")
    db.commit()

    worker.enqueue("proposal_phase2", {"proposal_id": proposal_id, "user_id": body.user_id})
    return phase1


@router.get("/proposal/{proposal_id}", response_model=ProposalResponse)
@router.get("/api/proposal/{proposal_id}", response_model=ProposalResponse)
def get_proposal(proposal_id: str, db: Session = Depends(get_db)) -> ProposalResponse:
    row = db.query(Proposal).filter(Proposal.proposal_id == proposal_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="proposal not found")
    return _proposal_from_row(row)


@router.get("/proposal/{proposal_id}/stream")
@router.get("/api/proposal/{proposal_id}/stream")
async def stream_proposal(proposal_id: str):
    subscriber, history = event_broker.subscribe(proposal_id)

    async def event_generator():
        try:
            for envelope in history:
                yield _sse_message(envelope.event, envelope.data)
                if envelope.event == "done":
                    return

            while True:
                try:
                    envelope = await asyncio.to_thread(subscriber.get, True, 20)
                except queue.Empty:
                    yield ": keep-alive\n\n"
                    continue

                yield _sse_message(envelope.event, envelope.data)
                if envelope.event == "done":
                    return
        finally:
            event_broker.unsubscribe(proposal_id, subscriber)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.patch("/proposal/{proposal_id}/task/{task_id}", response_model=ProposalResponse)
@router.patch("/api/proposal/{proposal_id}/task/{task_id}", response_model=ProposalResponse)
def patch_task_status(
    proposal_id: str,
    task_id: int,
    body: ProposalTaskStatusPatchRequest,
    db: Session = Depends(get_db),
) -> ProposalResponse:
    task_row = (
        db.query(ProposalTask)
        .filter(ProposalTask.proposal_id == proposal_id, ProposalTask.task_id == task_id)
        .one_or_none()
    )
    if task_row is None:
        raise HTTPException(status_code=404, detail="task not found")

    task_row.status = body.status
    proposal_row = db.query(Proposal).filter(Proposal.proposal_id == proposal_id).one_or_none()
    if proposal_row is None:
        raise HTTPException(status_code=404, detail="proposal not found")
    proposal = _proposal_from_row(proposal_row)
    for todo in proposal.today_todos:
        if todo.task_id == task_id:
            todo.status = body.status
            break
    proposal_row.raw_package = proposal.model_dump(mode="json")
    _append_audit(
        db,
        entity_type="task",
        entity_id=str(task_id),
        action="status_patch",
        actor=task_row.user_id,
        payload={"status": body.status},
    )
    db.commit()
    return proposal


@router.patch("/proposal/{proposal_id}/draft/{draft_id}", response_model=ProposalResponse)
@router.patch("/api/proposal/{proposal_id}/draft/{draft_id}", response_model=ProposalResponse)
def patch_draft(
    proposal_id: str,
    draft_id: int,
    body: ProposalDraftPatchRequest,
    db: Session = Depends(get_db),
) -> ProposalResponse:
    draft_row = (
        db.query(Draft)
        .filter(Draft.proposal_id == proposal_id, Draft.draft_id == draft_id)
        .one_or_none()
    )
    if draft_row is None:
        raise HTTPException(status_code=404, detail="draft not found")

    draft_row.content = body.content
    if body.status:
        draft_row.status = body.status

    proposal_row = db.query(Proposal).filter(Proposal.proposal_id == proposal_id).one_or_none()
    if proposal_row is None:
        raise HTTPException(status_code=404, detail="proposal not found")
    proposal = _proposal_from_row(proposal_row)
    for draft in proposal.drafts:
        if draft.draft_id == draft_id:
            draft.content = body.content
            if body.status:
                draft.status = body.status
            break
    proposal_row.raw_package = proposal.model_dump(mode="json")
    _append_audit(
        db,
        entity_type="draft",
        entity_id=str(draft_id),
        action="content_patch",
        actor="user",
    )
    db.commit()
    return proposal


@router.post("/proposal/{proposal_id}/prooflog", response_model=ProofLogResponse)
@router.post("/api/proposal/{proposal_id}/prooflog", response_model=ProofLogResponse)
def create_prooflog(
    proposal_id: str,
    body: ProofLogCreateRequest,
    db: Session = Depends(get_db),
) -> ProofLogResponse:
    proposal_row = db.query(Proposal).filter(Proposal.proposal_id == proposal_id).one_or_none()
    if proposal_row is None:
        raise HTTPException(status_code=404, detail="proposal not found")

    if body.task_id is not None:
        task_row = (
            db.query(ProposalTask)
            .filter(ProposalTask.proposal_id == proposal_id, ProposalTask.task_id == body.task_id)
            .one_or_none()
        )
        if task_row is None:
            raise HTTPException(status_code=404, detail="task not found")

    row = ProofLog(
        proposal_id=proposal_id,
        task_id=body.task_id,
        user_id=body.user_id,
        proof_url=body.proof_url,
        note=body.note,
    )
    db.add(row)
    _append_audit(
        db,
        entity_type="prooflog",
        entity_id=proposal_id,
        action="create",
        actor=body.user_id,
        payload={"task_id": body.task_id, "proof_url": body.proof_url},
    )
    db.commit()
    db.refresh(row)
    return ProofLogResponse.model_validate(row)


@router.get("/proposal/{proposal_id}/prooflog", response_model=list[ProofLogResponse])
@router.get("/api/proposal/{proposal_id}/prooflog", response_model=list[ProofLogResponse])
def list_prooflogs(proposal_id: str, db: Session = Depends(get_db)) -> list[ProofLogResponse]:
    rows = (
        db.query(ProofLog)
        .filter(ProofLog.proposal_id == proposal_id)
        .order_by(ProofLog.submitted_at.desc())
        .all()
    )
    return [ProofLogResponse.model_validate(row) for row in rows]


