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
  http.post('/api/chat', async ({ request }) => {
    const sc = getScenario();

    // 요청 본문 파싱
    let requestBody: any = {};
    try {
      requestBody = await request.json();
    } catch (e) {
      // JSON 파싱 실패 시 빈 객체
    }

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

    // STRICT6 인풋이 있으면 eft_script 생성
    let eftScript = null;
    if (requestBody.strict_intake) {
      const si = requestBody.strict_intake;
      eftScript = {
        setup_phrase: `비록 ${si.situation_context} 상황에서 ${si.core_emotion}을(를) 느끼고 '${si.automatic_thought}'라고 생각하지만, 지금 이 순간만큼은 이 마음을 있는 그대로 인정해 보려고 한다.`,
        focus_words: [
          `이 ${si.core_emotion}`,
          "이 마음",
          si.automatic_thought?.substring(0, 18) || "이 생각",
          si.physical_sensation ? `이 ${si.physical_sensation.substring(0, 14)}` : "이 감각"
        ].slice(0, 5),
        intensity_label: si.intensity <= 3 ? "약함" : si.intensity <= 6 ? "중간" : "강함",
        situation_summary: `지금 느끼는 감정: ${si.core_emotion} (강도 ${si.intensity}/10)\n상황: ${si.situation_context}\n떠오르는 생각: '${si.automatic_thought}'`,
        recommended_duration: si.available_time || (si.intensity >= 7 ? 12 : si.intensity >= 4 ? 8 : 5),
        target_emotion: si.core_emotion,
        round_phrases: [
          `이 ${si.core_emotion}`,
          si.automatic_thought?.substring(0, 20) || "이 생각",
          "이 마음을 인정한다"
        ]
      };
    }

    // ChatResponse 형태로 반환
    return HttpResponse.json({
      response: intake,
      actions: [],
      eft_script: eftScript,
      emotion_analysis: {
        primary_emotion: "불안",
        secondary_emotion: null,
        intensity: 0.7,
        confidence: 0.8,
        emotional_keywords: ["불안", "압박"],
        context_analysis: {}
      },
      eft_recommendations: [],
      suggested_actions: [],
      confidence_score: 0.85,
      processing_time: 1.2,
      model_version: "MSW Mock",
      timestamp: new Date().toISOString(),
      tier: "free",
      requires_followup: false,
      emergency_detected: false,
      professional_referral: false,
      session_id: null,
      response_id: `mock_${Date.now()}`
    });
  }),

  // SUDS 엔드포인트 (신규 API)
  http.post('/suds', async ({ request }) => {
    const { score = 0 } = await request.json().catch(() => ({ score: 0 }));
    const n = Number(score) || 0;

    const body = `
[NOTION_RECORD_JSON]
{
  "emotion_primary": "불안",
  "trigger": "시간 압박",
  "thought_pattern": "미상",
  "body_signals": "가슴 두근거림",
  "behavior_response": "미상",
  "context_detail": "로컬 모킹",
  "SUDS_before": ${n},
  "preferred_modality": "미상",
  "plan_modality": ${n >= 7 ? "\"EFT\"" : "\"BREATH\""},
  "rationale": ${n >= 7 ? "\"구체 트리거 및 시간 여유\"" : "\"시간 제약/신체 각성\""},
  "session_notes": "세션 실행은 프론트에서 진행",
  "cbt_action_steps": ["단계1","단계2","단계3"],
  "user_feedback": "미상",
  "timestamp_start": "미상",
  "timestamp_end": "미상",
  "duration": 0
}

[UI_ACTION_JSON]
{
  "action": ${n >= 7 ? "\"start_eftar\"" : "\"start_breath_page\""},
  "route": ${n >= 7 ? "\"/eftar\"" : "\"/tri-modal\""},
  "suds": ${n},
  "rationale": ${n >= 7 ? "\"특정 신념/사건\"" : "\"시간 제약 또는 신체 각성\""}
}
`.trim();

    return HttpResponse.json({
      ok: true,
      score: n,
      response: body,   // 🔴 반드시 이 필드로 본문을 내려보내기
      actions: []       // UI_ACTION_JSON 우선 파싱 위해 비움
    });
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
      // UI_ACTION_JSON만 사용하도록 actions 배열 제거
      return HttpResponse.json(mkReply(body, []));
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
    // UI_ACTION_JSON만 사용하도록 actions 배열 제거
    return HttpResponse.json(mkReply(body, []));
  }),
];
