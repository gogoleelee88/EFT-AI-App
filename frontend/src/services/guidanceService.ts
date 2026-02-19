/**
 * Guidance Pipeline API 서비스
 * /api/guidance/generate, /api/guidance/feedback
 */

import type {
  GuidanceGenerateRequest,
  GuidanceOutputState,
  GuidanceFeedbackRequest,
  GuidanceCursor,
  ThemesRecommendRequest,
  ThemesRecommendResponse,
} from '../types/guidance';

const GUIDANCE_GENERATE = '/api/guidance/generate';
const GUIDANCE_FEEDBACK = '/api/guidance/feedback';
const GUIDANCE_GENERATE_AUDIO = '/api/guidance/generate_audio';
const GUIDANCE_THEMES_RECOMMEND = '/api/guidance/themes/recommend';

/** 명세: quality < 0.5 → face_data 생략(저조도·얼굴 인식 불안정 시 숫자 미전송) */
const QUALITY_GATE = 0.5;
const POSTURE_CONFIDENCE_GATE = 0.4;

/** intake 필드 매핑 (프론트 coping_attempt → 백엔드 behavioral_reaction, face_data 포함) */
function toBackendIntake(
  intake: GuidanceGenerateRequest['intake'],
  faceData?: Record<string, unknown> | null,
  postureData?: Record<string, unknown> | null
) {
  const payload: Record<string, unknown> = {
    core_emotion: intake.core_emotion,
    situation_context: intake.situation_context,
    automatic_thought: intake.automatic_thought,
    physical_sensation: intake.physical_sensation ?? null,
    behavioral_reaction: intake.behavioral_reaction ?? (intake as any).coping_attempt ?? null,
    intensity: intake.intensity,
    immediate_goal: intake.immediate_goal ?? null,
    available_time: intake.available_time ?? null,
  };
  if (faceData && Object.keys(faceData).length > 0) {
    const q = faceData.quality;
    if (!(typeof q === 'number' && q < QUALITY_GATE)) {
      payload.face_data = faceData;
    }
  }
  const posture = postureData ?? intake.posture_data ?? null;
  if (posture && Object.keys(posture).length > 0) {
    const confidence = posture.confidence;
    if (!(typeof confidence === 'number' && confidence < POSTURE_CONFIDENCE_GATE)) {
      payload.posture_data = posture;
    }
  }
  return payload;
}

export async function generateGuidance(
  req: GuidanceGenerateRequest & {
    face_data?: Record<string, unknown> | null;
    posture_data?: Record<string, unknown> | null;
  }
): Promise<GuidanceOutputState> {
  const body = {
    intake: toBackendIntake(req.intake, req.face_data ?? null, req.posture_data ?? null),
    selected_theme_id: req.selected_theme_id,
    signal_degrade: req.signal_degrade ?? false,
    confidence: req.confidence ?? undefined,
    cursor: req.cursor ?? undefined,
    selected_video_id: req.selected_video_id ?? undefined,
    session_id: req.session_id ?? undefined,
  };
  const res = await fetch(GUIDANCE_GENERATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Guidance generate failed: ${res.status} ${err}`);
  }
  return res.json();
}

export async function submitGuidanceFeedback(
  req: GuidanceFeedbackRequest
): Promise<{ ok: boolean; trace_id?: string; saved_at?: string }> {
  const res = await fetch(GUIDANCE_FEEDBACK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Guidance feedback failed: ${res.status} ${err}`);
  }
  return res.json();
}

/** Guidance + TTS 오디오를 한 번에 요청하는 API (MVP: 한 Chunk 기준 전체 문장 오디오). */
export async function generateGuidanceAudio(
  req: GuidanceGenerateRequest & {
    face_data?: Record<string, unknown> | null;
    posture_data?: Record<string, unknown> | null;
  }
): Promise<{ blob: Blob; cursor: GuidanceCursor | null }> {
  const body = {
    intake: toBackendIntake(req.intake, req.face_data ?? null, req.posture_data ?? null),
    selected_theme_id: req.selected_theme_id,
    signal_degrade: req.signal_degrade ?? false,
    confidence: req.confidence ?? undefined,
    cursor: req.cursor ?? undefined,
    selected_video_id: req.selected_video_id ?? undefined,
    session_id: req.session_id ?? undefined,
  };
  const res = await fetch(GUIDANCE_GENERATE_AUDIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const err = await res.text();
    throw new Error(`Guidance audio failed: ${res.status} ${err}`);
  }
  const blob = await res.blob();
  // 서버에서 cursor 정보는 현재 텍스트 응답에만 포함되므로,
  // 오디오 전용 API에서는 한 Chunk 단위로만 사용하는 것을 전제로 cursor는 null 처리.
  return { blob, cursor: null };
}

/** STRICT6 인테이크 기반 테마 추천 (점수 순 정렬된 3종 + default_theme_id). 옵션 B. */
export async function recommendThemes(
  req: ThemesRecommendRequest
): Promise<ThemesRecommendResponse> {
  const body = {
    intake: {
      core_emotion: req.intake.core_emotion,
      situation_context: req.intake.situation_context,
      automatic_thought: req.intake.automatic_thought,
      physical_sensation: req.intake.physical_sensation ?? null,
      behavioral_reaction: req.intake.behavioral_reaction ?? (req.intake as any).coping_attempt ?? null,
      intensity: req.intake.intensity,
      immediate_goal: req.intake.immediate_goal ?? null,
      available_time: req.intake.available_time ?? null,
    },
  };
  const res = await fetch(GUIDANCE_THEMES_RECOMMEND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Themes recommend failed: ${res.status} ${err}`);
  }
  return res.json();
}
