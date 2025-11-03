import { describe, it, expect } from 'vitest';
import { parseReplyForJson, validateNotionRecord } from '../AIChat.utils';

describe('parseReplyForJson', () => {
  it('extracts Intake JSON correctly', () => {
    const reply = `
라포 형성 멘트…
[INTAKE_JSON]
{
  "emotion_primary": "불안",
  "trigger": "마감 압박",
  "thought_pattern": "나는 실패할 거야",
  "body_signals": "가슴 두근",
  "behavior_response": "야근",
  "context_detail": "새벽 작업",
  "SUDS_before": 7,
  "preferred_modality": "미상",
  "contraindications": "미상"
}
`;

    const { intake, notion, action, cleanedReply } = parseReplyForJson(reply);

    expect(intake).not.toBeNull();
    expect(intake?.emotion_primary).toBe('불안');
    expect(intake?.SUDS_before).toBe(7);
    expect(notion).toBeNull();
    expect(action).toBeNull();
    expect(cleanedReply).not.toContain('[INTAKE_JSON]');
  });

  it('extracts Notion Record + UI Action JSON (EFT branch)', () => {
    const reply = `
특정 신념을 EFT로 다루는 게 적절해 보여요.
[NOTION_RECORD_JSON]
{
  "emotion_primary": "분노",
  "trigger": "상사의 무시",
  "thought_pattern": "나는 인정받지 못한다",
  "body_signals": "가슴 답답",
  "behavior_response": "회피",
  "context_detail": "회의 중 의견 무시",
  "SUDS_before": 8,
  "preferred_modality": "미상",
  "plan_modality": "EFT",
  "rationale": "특정 신념 고정",
  "session_notes": "세션 실행은 프론트에서 진행",
  "cbt_action_steps": ["탭핑 포인트","셋업 구문","SUDS 재측정"],
  "user_feedback": "미상",
  "timestamp_start": "미상",
  "timestamp_end": "미상",
  "duration": 0
}
[UI_ACTION_JSON]
{
  "action": "start_eftar",
  "route": "/eftar",
  "suds": 8,
  "rationale": "특정 신념 고정"
}
`;

    const { intake, notion, action, cleanedReply } = parseReplyForJson(reply);

    expect(intake).toBeNull();
    expect(notion).not.toBeNull();
    expect(notion?.plan_modality).toBe('EFT');
    expect(notion?.SUDS_before).toBe(8);
    expect(action).not.toBeNull();
    expect(action?.action).toBe('start_eftar');
    expect(action?.route).toBe('/eftar');
    expect(action?.suds).toBe(8);
    expect(cleanedReply).not.toContain('[NOTION_RECORD_JSON]');
    expect(cleanedReply).not.toContain('[UI_ACTION_JSON]');
  });

  it('extracts Notion Record + UI Action JSON (Breath branch)', () => {
    const reply = `
좋아요. 빠른 진정이 먼저네요.
[NOTION_RECORD_JSON]
{
  "emotion_primary": "불안",
  "trigger": "미상",
  "thought_pattern": "미상",
  "body_signals": "가슴 두근",
  "behavior_response": "미상",
  "context_detail": "급한 상황",
  "SUDS_before": 7,
  "preferred_modality": "미상",
  "plan_modality": "BREATH",
  "rationale": "시간 제약 5분 이내",
  "session_notes": "세션 실행은 프론트에서 진행",
  "cbt_action_steps": ["3초 들숨","3초 멈춤","6초 날숨"],
  "user_feedback": "미상",
  "timestamp_start": "미상",
  "timestamp_end": "미상",
  "duration": 0
}
[UI_ACTION_JSON]
{
  "action": "start_breath_page",
  "route": "/tri-modal",
  "suds": 7,
  "rationale": "시간 제약 5분 이내"
}
`;

    const { intake, notion, action, cleanedReply } = parseReplyForJson(reply);

    expect(notion?.plan_modality).toBe('BREATH');
    expect(action?.action).toBe('start_breath_page');
    expect(action?.route).toBe('/tri-modal');
    expect(action?.suds).toBe(7);
  });

  it('handles malformed JSON gracefully', () => {
    const reply = `
[INTAKE_JSON]
{ invalid json }
`;

    const { intake, notion, action } = parseReplyForJson(reply);

    expect(intake).toBeNull();
    expect(notion).toBeNull();
    expect(action).toBeNull();
  });
});

describe('validateNotionRecord', () => {
  it('returns true for complete record', () => {
    const record = {
      emotion_primary: "분노",
      trigger: "상사",
      thought_pattern: "무시당함",
      body_signals: "답답함",
      behavior_response: "회피",
      context_detail: "회의",
      SUDS_before: 8,
      preferred_modality: "미상",
      plan_modality: "EFT",
      rationale: "신념 고정",
      session_notes: "진행",
      cbt_action_steps: ["단계1"],
      user_feedback: "미상",
      timestamp_start: "미상",
      timestamp_end: "미상",
      duration: 0
    };

    expect(validateNotionRecord(record)).toBe(true);
  });

  it('returns false and warns for incomplete record', () => {
    const record = {
      emotion_primary: "분노",
      SUDS_before: 8
    };

    expect(validateNotionRecord(record)).toBe(false);
  });
});
