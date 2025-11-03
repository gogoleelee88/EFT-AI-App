import { http, HttpResponse } from 'msw';

const mkReply = (body: string, actions: any[] = []) => ({ response: body, actions });

// 시나리오 토글: localStorage.getItem('mt_scenario') === 'breath'|'eft'
const getScenario = () => (localStorage.getItem('mt_scenario') ?? 'eft').toLowerCase();

export const handlers = [
  // AI 대화 엔드포인트 모킹 (Engine A/B 병렬 비교)
  http.post('/api/chat/compare', async () => {
    const sc = getScenario();

    // (S2 완료 직후 1회) Intake JSON 포함 응답
    const intake = `라포 형성 멘트…
[INTAKE_JSON]
{
  "emotion_primary": "불안",
  "trigger": "반복 오류/마감 압박",
  "thought_pattern": "나는 결국 실패할 거야",
  "body_signals": "가슴 두근, 어깨 긴장",
  "behavior_response": "야근, 멈추기 어려움",
  "context_detail": "새벽 작업, 마감 임박",
  "SUDS_before": 7,
  "preferred_modality": "미상",
  "contraindications": "미상"
}`;

    // ComparisonResponse 형식으로 반환
    return HttpResponse.json({
      llama3_response: {
        model: "meta-llama/Meta-Llama-3-8B-Instruct",
        response: intake,
        processing_time: 1.5,
        success: true
      },
      qwen25_response: {
        model: "Qwen/Qwen2.5-7B-Instruct",
        response: intake,
        processing_time: 2.0,
        success: true
      },
      faster_model: "llama3",
      comparison_time: 2.1,
      actions: []
    });
  }),

  // 기존 /api/chat도 유지 (호환성)
  http.post('/api/chat', async () => {
    const sc = getScenario();

    const intake = `라포 형성 멘트…
[INTAKE_JSON]
{
  "emotion_primary": "불안",
  "trigger": "반복 오류/마감 압박",
  "thought_pattern": "나는 결국 실패할 거야",
  "body_signals": "가슴 두근, 어깨 긴장",
  "behavior_response": "야근, 멈추기 어려움",
  "context_detail": "새벽 작업, 마감 임박",
  "SUDS_before": 7,
  "preferred_modality": "미상",
  "contraindications": "미상"
}`;

    return HttpResponse.json(mkReply(intake));
  }),

  // SUDS 엔드포인트 (신규 API)
  http.post('/suds', async () => {
    const sc = getScenario();

    if (sc === 'breath') {
      const body = `좋아요. 빠른 진정이 먼저네요.
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
  "rationale": "시간 제약 5분 이내 + 즉각 진정 필요",
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
  "rationale": "시간 제약 5분 이내 + 막연한 불안"
}`;
      const actions = [
        { type: 'start_breath_page', payload: { suds: 7, route: '/tri-modal' } }
      ];
      return HttpResponse.json(mkReply(body, actions));
    }

    // 기본(EFT)
    const body = `특정 신념을 EFT로 다루는 게 적절해 보여요.
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
  "rationale": "특정 신념 고정 - 재구조화 필요",
  "session_notes": "세션 실행은 프론트에서 진행",
  "cbt_action_steps": ["탭핑 포인트 확인","셋업 구문 반복","SUDS 재측정"],
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
}`;
    const actions = [
      { type: 'start_eftar', payload: { suds: 8, route: '/eftar', script: 'standard_relief' } }
    ];
    return HttpResponse.json(mkReply(body, actions));
  }),

  // SUDS 기록 직후에 백엔드가 분기 액션을 돌려준다고 가정 (레거시)
  http.post(/\/api\/memory\/.*\/suds/, async () => {
    const sc = getScenario();

    if (sc === 'breath') {
      const body = `좋아요. 빠른 진정이 먼저네요.
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
  "rationale": "시간 제약 5분 이내 + 즉각 진정 필요",
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
  "rationale": "시간 제약 5분 이내 + 막연한 불안"
}`;
      return HttpResponse.json(mkReply(body));
    }

    // 기본(EFT)
    const body = `특정 신념을 EFT로 다루는 게 적절해 보여요.
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
  "rationale": "특정 신념 고정 - 재구조화 필요",
  "session_notes": "세션 실행은 프론트에서 진행",
  "cbt_action_steps": ["탭핑 포인트 확인","셋업 구문 반복","SUDS 재측정"],
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
}`;
    return HttpResponse.json(mkReply(body));
  }),
];
