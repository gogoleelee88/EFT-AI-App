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

export type RecoveryEntryPoint = "schedule_start" | "progress_blocked" | "distraction_detected";
export type RecoverySessionState = "start" | "in_progress";
export type RecoveryAction = "open_web" | "ignore";

export interface RecoveryEventIn {
  user_id?: string;
  focus_session_id?: string;
  schedule_id?: string;
  schedule_name?: string;
  session_state?: RecoverySessionState;
  entry_point: RecoveryEntryPoint;
  blocked_min?: number;
  distraction_type?: string;
  confidence?: number;
  source?: string;
  timestamp?: string;
  cooldown_minutes?: number;
}

export interface RecoveryEventOut {
  event_id: string;
  action: RecoveryAction;
  entry_sentence: string;
  recovery_url?: string | null;
  suppressed_reason?: string | null;
  focus_session_id?: string | null;
  schedule_id?: string | null;
  entry_point: RecoveryEntryPoint;
  created_at: string;
}

export interface IosSignalIn {
  user_id?: string;
  focus_session_id?: string;
  schedule_id?: string;
  schedule_name?: string;
  signal_type: "background" | "screen_off";
  confidence?: number;
  timestamp?: string;
  cooldown_minutes?: number;
}

export interface RecoveryJournalEventItem {
  event_id: string;
  created_at: string;
  entry_point: RecoveryEntryPoint;
  session_state: RecoverySessionState;
  schedule_id?: string | null;
  schedule_name?: string | null;
  distraction_type?: string | null;
  blocked_min?: number | null;
  action: RecoveryAction;
  entry_sentence: string;
}

export interface RecoveryJournalOut {
  user_id: string;
  from_ts: string;
  to_ts: string;
  total_events: number;
  open_web_count: number;
  ignored_count: number;
  entry_point_counts: Record<string, number>;
  distraction_type_counts: Record<string, number>;
  schedule_counts: Record<string, number>;
  summary_lines: string[];
  events: RecoveryJournalEventItem[];
}
