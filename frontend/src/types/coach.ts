import type { BannedTone, Goal, ImageGoal, Relationship, SendPolicy } from './chat';

export type RiskType =
  | 'emotional_overheat'
  | 'blame'
  | 'accusation'
  | 'legal_risk'
  | 'ambiguity'
  | 'relationship_risk'
  | 'manipulation_risk';
export type RiskSeverity = 'low' | 'med' | 'high';
export type SimulationReaction = 'accept' | 'pushback' | 'ask_more' | 'ignore' | 'upset';
export type Likelihood = 'high' | 'med' | 'low';
export type ReplyTone = 'soft' | 'neutral' | 'firm';
export type FollowupReaction = 'pushback' | 'ask_more' | 'ignore' | 'upset';
export type ActionType =
  | 'send_now'
  | 'wait_and_send'
  | 'pause_thread'
  | 'ask_clarifying'
  | 'switch_channel';
export type InterestHypothesisLabel =
  | 'engagement_high'
  | 'polite_distance'
  | 'testing_boundaries'
  | 'comfort_building'
  | 'low_investment';

export interface CoachAnalyzeRequest {
  room_id: string;
  context: {
    relationship?: Relationship;
    goal?: Goal;
    image_goal?: ImageGoal[];
    banned_tones?: BannedTone[];
    language?: string;
    default_send_policy?: SendPolicy;
  };
  message: {
    their_last_message: string | null;
    my_draft: string;
    thread_summary: string | null;
    attachment_ids?: string[];
  };
}

export interface CoachRisk {
  type: RiskType;
  severity: RiskSeverity;
  note: string;
}

export interface CoachSimulation {
  reaction: SimulationReaction;
  likelihood: Likelihood;
  why: string;
  confidence: number;
}

export interface CoachReply {
  tone: ReplyTone;
  text: string;
  expected_outcome: string;
  tradeoffs: string[];
  confidence: number;
}

export interface CoachFollowup {
  if_reaction: FollowupReaction;
  text: string;
}

export interface CoachAction {
  type: ActionType;
  recommended_time: string;
  rationale: string[];
  execution_steps: string[];
  fallback_if_user_insists_send_now: {
    text: string;
    note: string;
  };
}

export interface CoachAnalyzeResponse {
  action: CoachAction;
  analysis: {
    politeness_score: number;
    clarity_score: number;
    boundary_strength: number;
    risks: CoachRisk[];
    misread_points: string[];
  };
  simulations: CoachSimulation[];
  replies: CoachReply[];
  followups: CoachFollowup[];
  romance_insights: {
    interest_hypotheses: Array<{
      label: InterestHypothesisLabel;
      likelihood: Likelihood;
      evidence_quotes: string[];
      alternative_explanations: string[];
      what_to_do: string[];
    }>;
    compatibility_notes: {
      my_strengths: string[];
      my_risks: string[];
      watchouts: string[];
    };
    safe_clarifying_questions: string[];
  };
  evidence_items: string[];
  confidence: number;
}
