from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


SignalType = Literal["external", "temporal", "identity_derived"]
ProposalPhase = Literal["phase1", "phase2"]
TaskStatus = Literal["todo", "in_progress", "done", "blocked"]


class AspirationProfileUpsertRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    aspiration_statement: str = Field(..., min_length=3, max_length=2000)
    target_identity: Optional[str] = Field(default=None, max_length=255)
    north_star_goal: Optional[str] = Field(default=None, max_length=255)
    horizon_90d: list[str] = Field(default_factory=list)
    values: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


class AspirationProfileResponse(BaseModel):
    aspiration_profile_id: int
    user_id: str
    aspiration_statement: str
    target_identity: Optional[str]
    north_star_goal: Optional[str]
    horizon_90d: list[str]
    values: list[str]
    constraints: list[str]
    updated_at: datetime

    model_config = {"from_attributes": True}


class CapabilityProfileUpsertRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    strengths: list[str] = Field(default_factory=list)
    experience_highlights: list[str] = Field(default_factory=list)
    domain_focus: list[str] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    tool_stack: list[str] = Field(default_factory=list)


class CapabilityProfileResponse(BaseModel):
    capability_profile_id: int
    user_id: str
    strengths: list[str]
    experience_highlights: list[str]
    domain_focus: list[str]
    certifications: list[str]
    tool_stack: list[str]
    updated_at: datetime

    model_config = {"from_attributes": True}


class SignalIngestRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    signal_type: SignalType
    source: str = Field(..., min_length=1, max_length=64)
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1, max_length=4000)
    occurred_at: Optional[datetime] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SignalResponse(BaseModel):
    signal_id: str
    user_id: str
    signal_type: SignalType
    source: str
    title: str
    body: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class ProposalTodo(BaseModel):
    task_id: Optional[int] = None
    title: str
    description: str
    duration_minutes: int = Field(..., ge=30, le=90)
    priority: int = Field(..., ge=1, le=5)
    dependency_task_ids: list[int] = Field(default_factory=list)
    status: TaskStatus = "todo"


class ProposalDraft(BaseModel):
    draft_id: Optional[int] = None
    draft_type: str
    title: str
    content: str
    status: str = "generated"


class ProposalChecklistItem(BaseModel):
    checklist_item_id: Optional[int] = None
    item_text: str
    category: Optional[str] = None
    is_required: bool = True
    is_done: bool = False


class ProposalRiskFlag(BaseModel):
    risk_flag_id: Optional[int] = None
    severity: Literal["low", "medium", "high"]
    category: str
    message: str
    check_question: Optional[str] = None
    needs_review: bool = True


class ProposalResearchPackItem(BaseModel):
    topic: str
    prompt_bundle: list[str] = Field(default_factory=list)
    status: Literal["queued", "running", "done"] = "queued"


class ProposalContentReco(BaseModel):
    title: str
    url: HttpUrl
    rationale_summary: str


class ProposalEvidenceCard(BaseModel):
    title: str
    source_type: str
    summary: str
    link: Optional[str] = None


class StateCalendarContext(BaseModel):
    condition_note: Optional[str] = None
    available_minutes: Optional[int] = Field(default=None, ge=15, le=720)
    fixed_events: list[str] = Field(default_factory=list)


class ProposalGenerateRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    proposal_date: Optional[date] = None
    context: StateCalendarContext = Field(default_factory=StateCalendarContext)
    seed_signals: list[SignalIngestRequest] = Field(default_factory=list)


class ProposalResponse(BaseModel):
    proposal_id: str
    phase: ProposalPhase
    role_inference: str
    today_todos: list[ProposalTodo]
    drafts: list[ProposalDraft]
    checklist: list[ProposalChecklistItem]
    risk_flags: list[ProposalRiskFlag]
    research_pack: list[ProposalResearchPackItem]
    content_recos: list[ProposalContentReco]
    evidence_cards: list[ProposalEvidenceCard]
    confidence: float = Field(..., ge=0.0, le=1.0)


class SSEEnvelope(BaseModel):
    event: Literal[
        "proposal.phase2_started",
        "evidence.updated",
        "research.completed",
        "draft.updated",
        "checklist.updated",
        "done",
    ]
    data: dict[str, Any] = Field(default_factory=dict)


class ProofLogCreateRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    task_id: Optional[int] = None
    proof_url: str = Field(..., min_length=5, max_length=2000)
    note: Optional[str] = Field(default=None, max_length=4000)


class ProofLogResponse(BaseModel):
    prooflog_id: int
    proposal_id: str
    task_id: Optional[int]
    user_id: str
    proof_url: str
    note: Optional[str]
    submitted_at: datetime

    model_config = {"from_attributes": True}


class ProposalTaskStatusPatchRequest(BaseModel):
    status: TaskStatus


class ProposalDraftPatchRequest(BaseModel):
    content: str = Field(..., min_length=1)
    status: Optional[str] = None
