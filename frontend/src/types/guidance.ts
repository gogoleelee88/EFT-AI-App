/**
 * Guidance Pipeline API 타입 (백엔드 guidance_schema와 동기화)
 */

import type { StrictIntakeInput } from './serverAI';

/** 테마 추천 1개 (백엔드 ThemeRecommendation) */
export interface ThemeRecommendationFromApi {
  theme_id: string;
  title: string;
  estimated_min: number;
  summary: string;
}

/** 테마 추천 요청/응답 (옵션 B: STRICT6만으로 추천 3가지) */
export interface ThemesRecommendRequest {
  intake: StrictIntakeInput;
}

export interface ThemesRecommendResponse {
  recommendations: ThemeRecommendationFromApi[];
  default_theme_id: string;
  decision_trace: string[];
}

export interface CaptionItem {
  seq: number;
  text: string;
  hold_ms: number;
  type?: string;
}

export interface GuidanceCursor {
  scenario_id: string;
  next_block_index: number;
}

export type GuidanceInterventionType =
  | 'SOFT_CUE'
  | 'POSTURE_RESET'
  | 'BREATH_PACE'
  | 'PAUSE_GUIDE_AUDIO'
  | 'REWIND_GUIDE_AUDIO'
  | 'REPEAT_LAST_CAPTION'
  | 'PAUSE_YOUTUBE'
  | 'SEEK_YOUTUBE'
  | 'RESUME_YOUTUBE';

export interface GuidanceIntervention {
  type: GuidanceInterventionType;
  params?: Record<string, unknown>;
  cooldown_ms?: number;
  reason?: string;
}

export interface CoachingEvent {
  level: 'GREEN' | 'YELLOW' | 'RED';
  timestamp: number;
  actions: string[];
}

export interface GuidanceOutputState {
  guidance_id: string;
  captions: CaptionItem[];
  silence_ms: number;
  voice_profile: string;
  action_context?: Record<string, unknown>;
  next_cursor?: GuidanceCursor | null;
  decision_trace?: string[];
  meta?: Record<string, unknown>;
  interventions?: GuidanceIntervention[];
}

export interface GuidanceGenerateRequest {
  intake: StrictIntakeInput;
  selected_theme_id: string;
  signal_degrade?: boolean;
  confidence?: number;
  cursor?: GuidanceCursor | null;
  selected_video_id?: string;
  posture_data?: Record<string, unknown> | null;
  /** 명상 런 ID. Chunk마다 동일 값 전달 시 TTS 스타일 상태(쿨다운/히스테리시스) 유지 */
  session_id?: string;
}

export interface BestMomentDetail {
  seq: number;
  text?: string;
}

export interface GuidanceFeedbackRequest {
  guidance_id: string;
  best_moments: number[];
  best_moments_detail?: BestMomentDetail[];
  worst_moments?: number[];
  worst_moments_detail?: BestMomentDetail[];
  user_rating: number;
  session_id?: string;
  user_id?: string;
  scenario_id?: string;
  theme_id?: string;
  selected_video_id?: string;
  coaching_events?: CoachingEvent[];
}
