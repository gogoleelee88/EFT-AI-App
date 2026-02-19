export type SignalType = "external" | "temporal" | "identity_derived";
export type ProposalPhase = "phase1" | "phase2";
export type ProposalTaskStatus = "todo" | "in_progress" | "done" | "blocked";

export interface ProposalTodo {
  task_id?: number;
  title: string;
  description: string;
  duration_minutes: number;
  priority: number;
  dependency_task_ids: number[];
  status: ProposalTaskStatus;
}

export interface ProposalDraft {
  draft_id?: number;
  draft_type: string;
  title: string;
  content: string;
  status: string;
}

export interface ProposalChecklistItem {
  checklist_item_id?: number;
  item_text: string;
  category?: string;
  is_required: boolean;
  is_done: boolean;
}

export interface ProposalRiskFlag {
  risk_flag_id?: number;
  severity: "low" | "medium" | "high";
  category: string;
  message: string;
  check_question?: string;
  needs_review: boolean;
}

export interface ProposalResearchPackItem {
  topic: string;
  prompt_bundle: string[];
  status: "queued" | "running" | "done";
}

export interface ProposalContentReco {
  title: string;
  url: string;
  rationale_summary: string;
}

export interface ProposalEvidenceCard {
  title: string;
  source_type: string;
  summary: string;
  link?: string;
}

export interface ProposalResponse {
  proposal_id: string;
  phase: ProposalPhase;
  role_inference: string;
  today_todos: ProposalTodo[];
  drafts: ProposalDraft[];
  checklist: ProposalChecklistItem[];
  risk_flags: ProposalRiskFlag[];
  research_pack: ProposalResearchPackItem[];
  content_recos: ProposalContentReco[];
  evidence_cards: ProposalEvidenceCard[];
  confidence: number;
}

export interface AspirationProfilePayload {
  user_id: string;
  aspiration_statement: string;
  target_identity?: string;
  north_star_goal?: string;
  horizon_90d: string[];
  values: string[];
  constraints: string[];
}

export interface CapabilityProfilePayload {
  user_id: string;
  strengths: string[];
  experience_highlights: string[];
  domain_focus: string[];
  certifications: string[];
  tool_stack: string[];
}

export interface SignalIngestPayload {
  user_id: string;
  signal_type: SignalType;
  source: string;
  title: string;
  body: string;
  occurred_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ProposalGeneratePayload {
  user_id: string;
  proposal_date?: string;
  context?: {
    condition_note?: string;
    available_minutes?: number;
    fixed_events?: string[];
  };
}

export interface ProofLogPayload {
  user_id: string;
  task_id?: number;
  proof_url: string;
  note?: string;
}

export type ProposalSSEEventType =
  | "proposal.phase2_started"
  | "evidence.updated"
  | "research.completed"
  | "draft.updated"
  | "checklist.updated"
  | "done";
