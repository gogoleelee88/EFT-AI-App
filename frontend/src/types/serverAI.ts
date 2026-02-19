/**
 * 서버 AI 관련 타입 정의
 * FastAPI 서버의 Pydantic 모델과 일치하도록 설계
 */

// 감정 타입 열거형
export type EmotionType =
  | 'joy' | '기쁨'
  | 'sadness' | '슬픔'
  | 'anger' | '분노'
  | 'fear' | '두려움'
  | 'surprise' | '놀람'
  | 'disgust' | '혐오'
  | 'stress' | '스트레스'
  | 'anxiety' | '불안'
  | 'love' | '사랑'
  | 'loneliness' | '외로움'
  | 'frustration' | '좌절'
  | 'neutral' | '중립'
  | 'unknown' | '알 수 없음';

// 감정 라벨 매핑 (다국어 지원)
export const EmotionLabelMap: Record<EmotionType, { ko: string; en: string }> = {
  joy: { ko: '기쁨', en: 'Joy' },
  기쁨: { ko: '기쁨', en: 'Joy' },
  sadness: { ko: '슬픔', en: 'Sadness' },
  슬픔: { ko: '슬픔', en: 'Sadness' },
  anger: { ko: '분노', en: 'Anger' },
  분노: { ko: '분노', en: 'Anger' },
  fear: { ko: '두려움', en: 'Fear' },
  두려움: { ko: '두려움', en: 'Fear' },
  surprise: { ko: '놀람', en: 'Surprise' },
  놀람: { ko: '놀람', en: 'Surprise' },
  disgust: { ko: '혐오', en: 'Disgust' },
  혐오: { ko: '혐오', en: 'Disgust' },
  stress: { ko: '스트레스', en: 'Stress' },
  스트레스: { ko: '스트레스', en: 'Stress' },
  anxiety: { ko: '불안', en: 'Anxiety' },
  불안: { ko: '불안', en: 'Anxiety' },
  love: { ko: '사랑', en: 'Love' },
  사랑: { ko: '사랑', en: 'Love' },
  loneliness: { ko: '외로움', en: 'Loneliness' },
  외로움: { ko: '외로움', en: 'Loneliness' },
  frustration: { ko: '좌절', en: 'Frustration' },
  좌절: { ko: '좌절', en: 'Frustration' },
  neutral: { ko: '중립', en: 'Neutral' },
  중립: { ko: '중립', en: 'Neutral' },
  unknown: { ko: '알 수 없음', en: 'Unknown' },
  '알 수 없음': { ko: '알 수 없음', en: 'Unknown' },
};

// EFT 탭핑 포인트
export type EFTPoint =
  | 'crown' | '정수리'
  | 'eyebrow' | '눈썹'
  | 'side_of_eye' | '눈 옆'
  | 'under_eye' | '눈 아래'
  | 'under_nose' | '코 아래'
  | 'chin' | '턱'
  | 'collarbone' | '쇄골'
  | 'under_arm' | '겨드랑이'
  | 'wrist' | '손목'
  // ARHolisticTest.tsx 호환용 추가 포인트
  | 'TH' | 'EB' | 'SE' | 'SE-L' | 'SE-R' | 'UE' | 'UN' | 'CH' | 'CB';

// 대화 메시지
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  metadata?: {
    emotion_analysis?: EmotionAnalysis;
    eft_recommendations?: EFTRecommendation[];
    confidence?: number;
    processing_time?: number;
    emergency_detected?: boolean;
    professional_referral?: boolean;
    conversationState?: string;
    turnCount?: number;
    [key: string]: any;
  };
}

// 사용자 프로필
export interface UserProfile {
  user_id?: string;
  age_group?: string;
  communication_style?: 'formal' | 'casual' | 'empathetic' | 'direct' | 'balanced';
  preferred_language?: string;
  eft_experience_level?: 'beginner' | 'intermediate' | 'advanced';
  emotional_sensitivity?: number; // 0.0 ~ 1.0
  previous_sessions?: number;
}

/** STRICT6 인테이크 타입 (백엔드 StrictIntakeInput과 동기화) */
export interface StrictIntakeInput {
  core_emotion: string;
  situation_context: string;
  automatic_thought: string;
  physical_sensation?: string | null;
  behavioral_reaction?: string | null;
  intensity: number;
  available_time?: number | null;
  immediate_goal?: string | null;
  face_data?: Record<string, unknown> | null;
  posture_data?: Record<string, unknown> | null;
  guide_tone?: string | null;
  arousal_level?: number | null;
  /** 커스텀 음성 프로필 ID (없으면 기본 가이드 음성 사용) */
  voice_id?: string | null;
}

// 감정 분석 결과
export interface EmotionAnalysis {
  primary_emotion: EmotionType;
  secondary_emotion?: EmotionType | null;
  intensity: number; // 0.0 ~ 1.0
  confidence: number; // 0.0 ~ 1.0
  triggers?: string[]; // 감정 유발 요인들
  emotional_keywords?: string[];
  context_analysis?: {
    [key: string]: any;
  };
}

// EFT 기법 추천
export interface EFTRecommendation {
  technique_name: string;
  tapping_points: EFTPoint[];
  setup_phrase: string;
  reminder_phrase: string;
  duration_minutes: number;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  effectiveness_score: number; // 0.0 ~ 1.0
  additional_notes?: string;

  // 🔥 AI 연동용 확장 필드 (선택적) - 기존 코드 영향 없음
  emotion?: string;     // AI가 분석한 감정 (e.g., 'anxiety', 'stress')
  intensity?: number;   // 감정 강도 (0-100)
}

// 제안 액션
export interface SuggestedAction {
  action_type: 'eft_session' | 'breathing' | 'reflection' | 'professional_help';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_time_minutes: number;
}


// ========================================
// STRICT6 관련 타입 정의
// ========================================

/** STRICT6 구조화 감정 입력 모델 */
export interface StrictIntakeInput {
  /** 핵심 감정 (불안, 분노, 슬픔 등) */
  core_emotion: string;
  /** 상황 맥락 */
  situation_context: string;
  /** 자동사고 (한 문장 기준) */
  automatic_thought: string;
  /** 신체 감각 (선택) */
  physical_sensation?: string;
  /** 행동 반응 (선택) */
  behavioral_reaction?: string;
  /** 0~10 SUDS 강도 */
  intensity: number;
  /** 사용 가능 시간 (분, 선택) */
  available_time?: number;
  /** 즉시 목표 (선택) */
  immediate_goal?: string;
}

/** EFT 스크립트 출력 모델 */
export interface EFTScript {
  /** 셋업 문장 */
  setup_phrase: string;
  /** 탭핑 중 반복할 짧은 구절들 */
  focus_words: string[];
  /** 약함/중간/강함 */
  intensity_label: string;
  /** 현재 감정 상태 요약 (UI용) */
  situation_summary: string;
  /** 분 단위 권장 시간 */
  recommended_duration: number;
  /** core_emotion 그대로 */
  target_emotion: string;
}

// 채팅 요청 (클라이언트 → 서버)
export interface ChatRequest {
  message: string;
  conversation_history?: ConversationMessage[];
  user_profile?: UserProfile;
  
  // 생성 파라미터
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  
  // EFT 관련 설정
  include_eft_recommendations?: boolean;
  
  // STRICT6 구조화 인풋 (선택)
  strict_intake?: StrictIntakeInput;
  emergency_check?: boolean;
  
  // 메타데이터
  session_id?: string;
  request_id?: string;
  client_timestamp?: string;
}

// 채팅 응답 (서버 → 클라이언트)
export interface ActionItem {
  type: string;
  payload?: Record<string, any>;
}

export interface ChatResponse {
  response: string;
  emotion_analysis: EmotionAnalysis;
  eft_recommendations: EFTRecommendation[];
  suggested_actions: SuggestedAction[];
  
  // 메타데이터
  confidence_score: number;
  processing_time: number;
  model_version?: string;
  timestamp: string;
  tier?: 'free' | 'premium' | 'enterprise'; // AI 티어 정보
  
  // 플래그들
  requires_followup: boolean;
  emergency_detected: boolean;
  professional_referral: boolean;
  
  // 세션 관리
  session_id?: string;
  response_id: string;
  actions?: ActionItem[];
  
  // STRICT6 기반 EFT 스크립트 (선택)
  eft_script?: EFTScript;
}

// 스트리밍 응답 청크
export interface StreamChunk {
  chunk_type: 'text' | 'emotion' | 'eft' | 'action' | 'metadata' | 'error' | 'end';
  content: string;
  sequence_number: number;
  is_final?: boolean;
  metadata?: {
    [key: string]: any;
  };
}

// 에러 응답
export interface ErrorResponse {
  error_code: string;
  error_message: string;
  error_type: 'validation' | 'model' | 'system' | 'timeout' | 'rate_limit';
  timestamp: string;
  request_id?: string;
  suggestions?: string[];
}

// 감정 분석 요청
export interface EmotionAnalysisRequest {
  text: string;
  context?: string;
  detailed_analysis?: boolean;
}

// EFT 추천 요청
export interface EFTRecommendationRequest {
  emotion_analysis: EmotionAnalysis;
  user_profile?: UserProfile;
  session_context?: string;
}

// 서버 상태 응답
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    [key: string]: string;
  };
  timestamp: string;
  version: string;
  uptime_seconds: number;
}

// 모델 성능 통계
export interface ModelStats {
  model_name: string;
  total_requests: number;
  successful_requests: number;
  average_response_time: number;
  memory_usage_gb: number;
  gpu_utilization?: number;
  uptime_hours: number;
  last_updated: string;
}

// API 응답 래퍼 (일반적인 응답 형태)
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
  message?: string;
  timestamp: string;
}

// WebSocket 메시지 타입들
export interface WebSocketMessage {
  type: 'chat' | 'emotion_analysis' | 'eft_recommendation' | 'error' | 'ping' | 'pong';
  payload: any;
  message_id: string;
  timestamp: string;
}

// 실시간 감정 추적
export interface EmotionTrack {
  timestamp: string;
  emotion: EmotionType;
  intensity: number;
  trigger?: string;
  context?: string;
}

// 세션 정보
export interface SessionInfo {
  session_id: string;
  user_id?: string;
  start_time: string;
  last_activity: string;
  message_count: number;
  dominant_emotions: EmotionType[];
  eft_techniques_used: string[];
  overall_progress: number; // 0.0 ~ 1.0
}

// 개인화 설정
export interface PersonalizationSettings {
  response_style: 'concise' | 'detailed' | 'conversational';
  eft_preference: 'guided' | 'independent' | 'mixed';
  feedback_frequency: 'high' | 'medium' | 'low';
  cultural_context: 'korean' | 'international' | 'auto';
  language_formality: 'formal' | 'casual' | 'adaptive';
}

// 클라이언트 설정
export interface ClientConfig {
  server_url: string;
  api_version: string;
  timeout: number;
  retry_attempts: number;
  auto_reconnect: boolean;
  debug_mode: boolean;
}

// 연결 상태
export interface ConnectionStatus {
  connected: boolean;
  server_url: string;
  last_ping: string;
  latency_ms: number;
  model_loaded: boolean;
  server_version?: string;
}

// 기본 export 제거 - 모든 export는 named export로 처리됨
