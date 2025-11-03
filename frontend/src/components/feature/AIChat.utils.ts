/**
 * AI 응답에서 JSON 3종(Intake, Notion Record, UI Action)을 추출하는 파서 유틸리티
 */

export interface IntakeJSON {
  emotion_primary: string;
  trigger: string;
  thought_pattern: string;
  body_signals: string;
  behavior_response: string;
  context_detail: string;
  SUDS_before: number;
  preferred_modality: string;
  contraindications: string;
}

export interface NotionRecordJSON {
  emotion_primary: string;
  trigger: string;
  thought_pattern: string;
  body_signals: string;
  behavior_response: string;
  context_detail: string;
  SUDS_before: number;
  preferred_modality: string;
  plan_modality: 'EFT' | 'BREATH';
  rationale: string;
  session_notes: string;
  cbt_action_steps: string[];
  user_feedback: string;
  timestamp_start: string;
  timestamp_end: string;
  duration: number;
}

export interface UIActionJSON {
  action: 'start_eftar' | 'start_breath_page';
  route: string;
  suds: number;
  rationale: string;
}

export interface ParsedJSONs {
  intake: IntakeJSON | null;
  notion: NotionRecordJSON | null;
  action: UIActionJSON | null;
  cleanedReply: string;
}

/**
 * AI 응답 텍스트에서 JSON 3종을 추출하고 깨끗한 텍스트 반환
 */
export function parseReplyForJson(reply: string): ParsedJSONs {
  let cleanedReply = reply;
  let intake: IntakeJSON | null = null;
  let notion: NotionRecordJSON | null = null;
  let action: UIActionJSON | null = null;

  // Intake JSON 추출
  const intakeMatch = reply.match(/\[?INTAKE[_\s]JSON\]?\s*(\{[\s\S]*?\})/i);
  if (intakeMatch) {
    try {
      intake = JSON.parse(intakeMatch[1]);
      console.log('📊 Intake JSON 추출:', intake);
      cleanedReply = cleanedReply.replace(intakeMatch[0], '').trim();
    } catch (e) {
      console.warn('⚠️ Intake JSON 파싱 실패:', e);
    }
  }

  // Notion Record JSON 추출
  const notionMatch = reply.match(/\[?NOTION[_\s]RECORD[_\s]JSON\]?\s*(\{[\s\S]*?\})/i);
  if (notionMatch) {
    try {
      notion = JSON.parse(notionMatch[1]);
      console.log('📝 Notion Record JSON 추출:', notion);
      cleanedReply = cleanedReply.replace(notionMatch[0], '').trim();

      // 키 누락 검증
      validateNotionRecord(notion);
    } catch (e) {
      console.warn('⚠️ Notion Record JSON 파싱 실패:', e);
    }
  }

  // UI Action JSON 추출
  const uiActionMatch = reply.match(/\[?UI[_\s]ACTION[_\s]JSON\]?\s*(\{[\s\S]*?\})/i);
  if (uiActionMatch) {
    try {
      action = JSON.parse(uiActionMatch[1]);
      console.log('🚀 UI Action JSON 추출:', action);
      cleanedReply = cleanedReply.replace(uiActionMatch[0], '').trim();
    } catch (e) {
      console.warn('⚠️ UI Action JSON 파싱 실패:', e);
    }
  }

  return { intake, notion, action, cleanedReply };
}

/**
 * Notion Record JSON 필수 키 검증
 */
const REQUIRED_KEYS = [
  'emotion_primary',
  'trigger',
  'thought_pattern',
  'body_signals',
  'behavior_response',
  'context_detail',
  'SUDS_before',
  'preferred_modality',
  'plan_modality',
  'rationale',
  'session_notes',
  'cbt_action_steps',
  'user_feedback',
  'timestamp_start',
  'timestamp_end',
  'duration'
];

export function validateNotionRecord(obj: any): boolean {
  const missing = REQUIRED_KEYS.filter(k => !(k in obj));
  if (missing.length) {
    console.warn('⚠️ NotionRecordJSON missing keys:', missing);
  }
  return missing.length === 0;
}
