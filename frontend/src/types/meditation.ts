/**
 * MoodTalk v2.0 명상 테마 타입 및 상수
 */

export interface ThemeRecommendation {
  theme_id: string;
  title: string;
  estimated_min: number;
  summary: string;
  /** 기대 효과 배지: 안정 / 거리두기 / 에너지 / 집중 / 재진입 */
  effect_badge: '안정' | '거리두기' | '에너지' | '집중' | '재진입';
}

/** 명상 테마 라이브러리 (규칙 기반 1순위 추천용) */
export interface YouTubeCandidate {
  video_id: string;
  title: string;
  channel_title: string;
  duration_sec: number;
  url: string;
  thumbnail_url: string;
  reason: string;
  tags: string[];
}

export const THEME_LIBRARY: ThemeRecommendation[] = [
  {
    theme_id: 'self_compassion',
    title: 'Self-Compassion (자기 자비)',
    estimated_min: 8,
    summary: '타인의 시선에서 벗어나 스스로를 진정시키고, 안전감 회복을 우선합니다.',
    effect_badge: '안정',
  },
  {
    theme_id: 'thought_labeling',
    title: 'Thought Labeling (인지적 거리두기)',
    estimated_min: 6,
    summary: '자동사고를 "생각"으로 분리해 과잉 동일시를 줄이고, 다음 행동을 쉽게 만듭니다.',
    effect_badge: '거리두기',
  },
  {
    theme_id: 'micro_task_bridging',
    title: 'Micro-Task Bridging (실행 트리거)',
    estimated_min: 5,
    summary: '명상 종료 직후 바로 가능한 1개 행동으로 연결해 업무 재진입을 만듭니다.',
    effect_badge: '재진입',
  },
];

/**
 * strict_intake 기반 1순위 테마 ID 추천 (규칙 기반)
 * - 수치심/사회불안 → self_compassion
 * - 불안/걱정/반복사고 → thought_labeling
 * - 무기력/업무복귀 → micro_task_bridging
 */
export function getRecommendedThemeId(core_emotion: string, intensity: number): string {
  const e = (core_emotion || '').toLowerCase();
  if (/수치|부끄|사회|눈치|평가/.test(e)) return 'self_compassion';
  if (/불안|걱정|반복|생각|미래/.test(e)) return 'thought_labeling';
  if (/무기력|지침|밀린|업무|시작|행동/.test(e)) return 'micro_task_bridging';
  if (intensity >= 7) return 'self_compassion';
  return 'thought_labeling';
}

export interface SelectedTheme {
  selected_theme_id: string;
  selected_estimated_min: number;
}

// ========== 세션 설계 (Session Planner) ==========

export type SessionBlockType =
  | 'breath_regulation'
  | 'body_release'
  | 'self_compassion'
  | 'defusion'
  | 'reframing_bridge'
  | 'activation';

export interface SessionBlock {
  type: SessionBlockType;
  duration_s: number;
}

export interface SessionPlan {
  recommended_videos: YouTubeCandidate[];
  selected_video_id?: string;
  total_s: number;
  blocks: SessionBlock[];
}

/** 블록 타입 → 한글 라벨 (UI 표시용) */
export const SESSION_BLOCK_LABELS: Record<SessionBlockType, string> = {
  breath_regulation: '호흡 조절',
  body_release: '몸 이완',
  self_compassion: '자기 자비',
  defusion: '인지적 거리두기',
  reframing_bridge: '인지 재구성',
  activation: '재진입',
};

/** 테마별 기본 세션 블록 (총 시간은 estimated_min에 맞춰 스케일) */
const THEME_PLAN_TEMPLATES: Record<string, SessionBlock[]> = {
  self_compassion: [
    { type: 'breath_regulation', duration_s: 120 },
    { type: 'body_release', duration_s: 120 },
    { type: 'self_compassion', duration_s: 180 },
    { type: 'reframing_bridge', duration_s: 60 },
    { type: 'activation', duration_s: 60 },
  ],
  thought_labeling: [
    { type: 'breath_regulation', duration_s: 90 },
    { type: 'body_release', duration_s: 90 },
    { type: 'defusion', duration_s: 120 },
    { type: 'reframing_bridge', duration_s: 60 },
    { type: 'activation', duration_s: 60 },
  ],
  micro_task_bridging: [
    { type: 'breath_regulation', duration_s: 60 },
    { type: 'body_release', duration_s: 90 },
    { type: 'defusion', duration_s: 60 },
    { type: 'reframing_bridge', duration_s: 90 },
    { type: 'activation', duration_s: 120 },
  ],
};

/**
 * selected_theme_id로 세션 플랜 생성.
 * estimated_min(분)에 맞춰 total_s를 조정하고, 블록 비율은 유지.
 */
export function getSessionPlanForTheme(
  theme_id: string,
  estimated_min: number
): SessionPlan {
  const template =
    THEME_PLAN_TEMPLATES[theme_id] ??
    THEME_PLAN_TEMPLATES.thought_labeling;
  const baseTotal = template.reduce((s, b) => s + b.duration_s, 0);
  const targetTotal = estimated_min * 60;
  const scale = targetTotal / baseTotal;
  const blocks: SessionBlock[] = template.map((b) => ({
    type: b.type,
    duration_s: Math.round(b.duration_s * scale),
  }));
  const total_s = blocks.reduce((s, b) => s + b.duration_s, 0);
  return { total_s, blocks, recommended_videos: [] };
}
