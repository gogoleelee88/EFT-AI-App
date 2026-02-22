from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy import JSON

from backend.database import Base


class AspirationProfile(Base):
    __tablename__ = "aspiration_profile"

    aspiration_profile_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), nullable=False, unique=True, index=True)
    aspiration_statement = Column(Text, nullable=False)
    target_identity = Column(String(255), nullable=True)
    north_star_goal = Column(String(255), nullable=True)
    horizon_90d = Column(JSON, nullable=True)
    values = Column(JSON, nullable=True)
    constraints = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CapabilityProfile(Base):
    __tablename__ = "capability_profile"

    capability_profile_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), nullable=False, unique=True, index=True)
    strengths = Column(JSON, nullable=True)
    experience_highlights = Column(JSON, nullable=True)
    domain_focus = Column(JSON, nullable=True)
    certifications = Column(JSON, nullable=True)
    tool_stack = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Signal(Base):
    __tablename__ = "signal"

    signal_id = Column(String(36), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    signal_type = Column(String(32), nullable=False, index=True)
    source = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    metadata_json = Column(JSON, nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Proposal(Base):
    __tablename__ = "proposal"

    proposal_id = Column(String(36), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    proposal_date = Column(Date, nullable=True, index=True)
    phase = Column(String(16), nullable=False, default="phase1")
    role_inference = Column(String(255), nullable=False)
    confidence = Column(Float, nullable=False, default=0.0)
    raw_package = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ProposalTask(Base):
    __tablename__ = "task"

    task_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(64), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=False)
    priority = Column(Integer, nullable=False, default=3)
    dependency_task_ids = Column(JSON, nullable=True)
    status = Column(String(32), nullable=False, default="todo")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Draft(Base):
    __tablename__ = "draft"

    draft_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    draft_type = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(String(32), nullable=False, default="generated")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ChecklistItem(Base):
    __tablename__ = "checklist_item"

    checklist_item_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    item_text = Column(String(255), nullable=False)
    category = Column(String(64), nullable=True)
    is_required = Column(Boolean, nullable=False, default=True)
    is_done = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class RiskFlag(Base):
    __tablename__ = "risk_flag"

    risk_flag_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    severity = Column(String(16), nullable=False)
    category = Column(String(64), nullable=False)
    message = Column(String(512), nullable=False)
    check_question = Column(String(512), nullable=True)
    needs_review = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ProofLog(Base):
    __tablename__ = "prooflog"

    prooflog_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("task.task_id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(String(64), nullable=False, index=True)
    proof_url = Column(Text, nullable=False)
    note = Column(Text, nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_event"

    audit_event_id = Column(Integer, primary_key=True, autoincrement=True)
    entity_type = Column(String(64), nullable=False, index=True)
    entity_id = Column(String(64), nullable=False, index=True)
    action = Column(String(64), nullable=False)
    actor = Column(String(64), nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ResearchJob(Base):
    __tablename__ = "research_job"

    research_job_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="queued")
    prompt_bundle = Column(JSON, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ResearchResult(Base):
    __tablename__ = "research_result"

    research_result_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    research_job_id = Column(Integer, ForeignKey("research_job.research_job_id", ondelete="SET NULL"), nullable=True, index=True)
    topic = Column(String(255), nullable=False)
    summary = Column(Text, nullable=False)
    links = Column(JSON, nullable=True)
    evidence = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ArtifactVersion(Base):
    __tablename__ = "artifact_version"

    artifact_version_id = Column(Integer, primary_key=True, autoincrement=True)
    proposal_id = Column(String(36), ForeignKey("proposal.proposal_id", ondelete="CASCADE"), nullable=False, index=True)
    artifact_type = Column(String(64), nullable=False)
    artifact_id = Column(String(64), nullable=True)
    version_no = Column(Integer, nullable=False, default=1)
    content = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


