export type BehaviorLabel = "work" | "rest" | "move" | "exercise" | "other";

export type BehaviorQuestionStatus = "asked" | "answered" | "dismissed" | "expired";

export interface ActivityCandidateIn {
  user_id?: string;
  day_id?: number | null;
  ts_start: string;
  ts_end: string;
  top1: string;
  activity_topk?: Array<Record<string, unknown>>;
  confidence?: number;
  margin_top1_top2?: number;
  screen_state?: string;
  orientation?: string;
  pickup_flag?: boolean;
  mismatch_score?: number;
  trigger_reasons?: string[];
  dedupe_key?: string;
}

export interface ActivityCandidateOut {
  candidate_id: number;
  dedupe_hit: boolean;
  user_id?: string | null;
  day_id?: number | null;
  ts_start: string;
  ts_end: string;
  top1: string;
  confidence?: number;
  margin_top1_top2?: number;
  mismatch_score?: number;
  created_at: string;
}

export interface ClarificationQuestionIn {
  user_id?: string;
  candidate_id: number;
  question_text?: string;
  trigger_reasons?: string[];
  cooldown_key?: string;
  cooldown_minutes?: number;
  expires_minutes?: number;
}

export interface ClarificationQuestionOut {
  question_id: number;
  user_id?: string | null;
  candidate_id: number;
  status: BehaviorQuestionStatus;
  question_text: string;
  trigger_reasons: string[];
  cooldown_key: string;
  asked_at: string;
  expires_at?: string | null;
  cooldown_skipped: boolean;
}

export interface ClarificationAnswerIn {
  user_id?: string;
  label: BehaviorLabel;
  note?: string;
}

export interface ClarificationAnswerOut {
  question_id: number;
  status: BehaviorQuestionStatus;
  label_id: number;
  timeline_segment_id: number;
  final_label: BehaviorLabel;
}

export interface TimelineSegmentOut {
  segment_id: number;
  user_id?: string | null;
  day_id?: number | null;
  candidate_id?: number | null;
  ts_start: string;
  ts_end: string;
  inferred_label?: string | null;
  final_label?: string | null;
  label_source: string;
  mismatch_score_avg?: number | null;
  resume_hint_emitted: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TimelineSegmentListOut {
  items: TimelineSegmentOut[];
}

