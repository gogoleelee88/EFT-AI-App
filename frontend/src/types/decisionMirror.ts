export type DecisionStyle = 'logical' | 'emotional' | 'mixed';
export type ToneStyle = 'short_direct' | 'formal_polite' | 'warm';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DecisionMirrorContext {
  email_thread_text: string;
  chat_log_text: string;
  attachments_text?: string;
}

export interface DecisionMirrorProfile {
  decision_style: DecisionStyle;
  risk_aversion: number;
  approval_speed: number;
  price_sensitivity: number;
  pushback_intensity: number;
  common_objections: string[];
  approval_triggers: string[];
  tone_style: ToneStyle;
  rejection_patterns: string[];
}

export interface DecisionMirrorProfileResponse {
  profile: DecisionMirrorProfile;
  evidence: { quotes: string[] };
}

export interface DecisionMirrorMessageSuggestion {
  id: 'A' | 'B' | 'C';
  title: string;
  message: string;
}

export interface DecisionMirrorMessagesResponse {
  suggestions: DecisionMirrorMessageSuggestion[];
}

export interface DecisionMirrorMessagesRequestPayload {
  context: DecisionMirrorContext;
  goal: string;
  constraints?: string;
  question_attachments_text?: string;
}

export interface DecisionMirrorScoreResponse {
  score: number;
  reasons: string[];
  risk_points: string[];
  improve_edits: string[];
}

export interface DecisionMirrorTranscriptTurn {
  speaker: 'me' | 'them';
  text: string;
}

export interface DecisionMirrorCallReport {
  call_success_score: number;
  top_risks: string[];
  power_lines: string[];
  must_ask: string[];
  revised_message: string;
  revised_score: number;
}

export interface DecisionMirrorCallResponse {
  next_turn?: { speaker: 'them'; text: string } | null;
  done?: boolean;
  report?: DecisionMirrorCallReport | null;
}
