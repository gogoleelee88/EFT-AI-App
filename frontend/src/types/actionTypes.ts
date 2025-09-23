/**
 * AI 액션 토큰 시스템 타입 정의
 * 확장 가능한 액션 타입 및 페이로드 구조
 */

// 🎯 액션 타입 열거형 (확장 가능)
export type ActionType =
  | 'SUDS_MEASURE'           // SUDS 측정 요청
  | 'BREATH_GUIDE'           // 호흡 가이드 표시
  | 'GROUNDING_54321'        // 5-4-3-2-1 그라운딩 기법
  | 'EFT_RECOMMENDATION'     // EFT 세션 추천
  | 'MOOD_CHECK'             // 기분 체크 요청
  | 'RESOURCE_OFFER';        // 리소스 제공

// 🔥 SUDS 측정 액션 페이로드
export interface SudsActionPayload {
  measurementType: 'pre' | 'post' | 'check';
  prompt: string;
  context?: string;
  turnId?: string;
  sessionId?: string;
}

// 🌬️ 호흡 가이드 액션 페이로드 (추후 구현)
export interface BreathGuidePayload {
  type: 'box_breathing' | 'calm_breathing' | 'energizing_breathing';
  duration: number; // 초
  inhale: number;   // 들이쉬기 시간
  hold: number;     // 멈추기 시간
  exhale: number;   // 내쉬기 시간
  cycles: number;   // 반복 횟수
  instruction: string;
}

// 🏃 그라운딩 기법 액션 페이로드 (추후 구현)
export interface GroundingPayload {
  technique: '54321' | 'body_scan' | 'mindful_observation';
  steps: string[];
  estimatedDuration: number; // 분
  guidance: string;
}

// 💆 EFT 추천 액션 페이로드 (추후 구현)
export interface EftRecommendationPayload {
  technique: string;
  reason: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedDuration: number; // 분
  setupPhrase: string;
  tappingPoints: string[];
  navigationTarget: string; // 예: "/eft/basic_tapping"
}

// 😊 기분 체크 액션 페이로드 (추후 구현)
export interface MoodCheckPayload {
  checkType: 'quick' | 'detailed' | 'periodic';
  questions: string[];
  scale: {
    min: number;
    max: number;
    labels: string[];
  };
}

// 📚 리소스 제공 액션 페이로드 (추후 구현)
export interface ResourceOfferPayload {
  resourceType: 'article' | 'video' | 'audio' | 'exercise' | 'contact';
  title: string;
  description: string;
  url?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

// 🎯 통합 액션 페이로드 타입
export type ActionPayload =
  | SudsActionPayload
  | BreathGuidePayload
  | GroundingPayload
  | EftRecommendationPayload
  | MoodCheckPayload
  | ResourceOfferPayload;

// 📦 액션 객체 전체 구조
export interface ActionObject {
  type: ActionType;
  payload: ActionPayload;
  priority?: number;
  metadata?: {
    turnId?: string;
    sessionId?: string;
    timestamp?: string;
    source?: 'ai_token' | 'user_request' | 'system_trigger';
  };
}

// 🎭 액션 실행 결과
export interface ActionResult {
  actionType: ActionType;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: string;
}

// 📋 액션 상태 관리용 타입
export interface ActionState {
  pendingSuds: SudsActionPayload | null;
  pendingBreathGuide: BreathGuidePayload | null;
  pendingGrounding: GroundingPayload | null;
  pendingEftRecommendation: EftRecommendationPayload | null;
  pendingMoodCheck: MoodCheckPayload | null;
  pendingResource: ResourceOfferPayload | null;
}

// 🔧 액션 처리 함수 타입
export type ActionHandler<T extends ActionPayload> = (payload: T) => Promise<void> | void;

// 📊 액션 통계 타입 (디버깅/분석용)
export interface ActionStats {
  totalActions: number;
  actionsByType: Record<ActionType, number>;
  successRate: number;
  averageProcessingTime: number;
  lastActionTimestamp?: string;
}