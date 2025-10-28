/**
 * 서버 기반 AI 클라이언트
 * FastAPI 기반 EFT 전문 AI 서버와 통신
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🚨 절대 URL 금지 원칙 (Absolute URL Prohibition Policy)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1. 모든 API 호출은 상대경로(Relative Path)만 사용
 *    예: '/api/chat', '/api/health' (✅)
 *    금지: 'http://127.0.0.1:8000/api/chat' (❌)
 *
 * 2. 절대 URL은 인프라 계층에서 처리 (Proxy/CDN)
 *    - 개발: vite.config.ts의 proxy 설정
 *    - 운영: Cloudflare Workers 리다이렉트
 *
 * 3. 이 원칙을 위반하는 코드 변경은 즉시 거부됨
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import type { ActionItem, ConversationMessage, EmotionAnalysis, EFTRecommendation, SuggestedAction } from '../types/serverAI';
import { API_CONFIG, ENDPOINTS } from '../config/api';
import { createApiHeaders, apiFetch } from './http';

// API 키 가져오기 유틸리티 (localStorage 우선순위)
const getApiKey = () =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('PREMIUM_API_KEY')) ||
  (import.meta as any).env?.VITE_API_KEY ||
  '';

const getPremiumApiKey = () =>
  (typeof localStorage !== 'undefined' && localStorage.getItem('PREMIUM_API_KEY')) ||
  (import.meta as any).env?.VITE_PREMIUM_API_KEY ||
  '';

// 임시 호환 래퍼: 과거 시그니처 대응
function headersCompat(
  isPremium = false,
  extra: Record<string, string> = {}
): Headers {
  // isPremium true면 localStorage 또는 VITE_PREMIUM_API_KEY 우선
  const premiumKey =
    (typeof localStorage !== 'undefined' && localStorage.getItem('PREMIUM_API_KEY')) ||
    (import.meta as any).env?.VITE_PREMIUM_API_KEY ||
    undefined;

  const h = createApiHeaders(isPremium ? premiumKey : undefined);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}


// Provider 타입 및 설정
export type Provider = 'local_vllm' | 'openai' | 'anthropic' | 'qwen';
const provider: Provider = (import.meta.env.VITE_PROVIDER as Provider) ?? 'local_vllm';

const NEGATIVE_SUDS_KEYWORDS = [
  '불안', '스트레스', '힘들', '힘들어', '힘들어요', '우울', '우울해', '우울하다',
  '짜증', '화나', '화나요', '화가', '걱정', '걱정돼', '걱정돼요', '슬퍼', '슬퍼요',
  '외로워', '외롭다', '외로움', '무서워', '두려워', '답답해', '답답하다', '괴로워',
  '상처', '서러워', '절망', '힘들었습니다', '지쳤', 'burned out', 'stressed', 'anxious',
  'depressed', 'sad', 'angry', 'afraid', 'scared', 'lonely', 'frustrated', 'overwhelmed'
];

// EFT 전문 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 EFT(감정자유기법) 전문 심리상담사입니다.

역할:
- 공감적이고 따뜻한 상담사
- EFT 기법을 활용한 감정 치유 전문가
- 한국 문화에 맞는 상담 제공

금지사항:
- 의학적 진단이나 처방 제공
- 약물 복용 권유
- 즉각적인 해결책 강요

목표:
- 내담자의 감정을 이해하고 공감
- EFT 기법으로 감정 완화 도움
- 안전하고 지지적인 환경 조성
- 점진적인 치유 과정 안내

상담 접근:
1. 경청과 공감 우선
2. 감정 상태 파악
3. 적절한 EFT 기법 제안
4. 지속적인 격려와 지지`;

// ✅ 상대경로 기반 BASE_URL (빈 문자열 = 동일 오리진)
// 프록시/CDN이 /api/* 요청을 백엔드로 라우팅함
// 절대 URL 하드코딩 금지 (보안 및 배포 유연성)
const BASE_URL = '';

// 🔧 내부 전용 ChatResponse 확장 (외부 반환 시 model_version 제거)
interface InternalChatResponse extends ChatResponse {
  model_version?: string; // 내부 처리용 (외부 노출 금지)
  tier?: 'free' | 'premium'; // 내부 티어 표시
}

// 외부 반환용 정리 함수
function toPublicChatResponse(internal: InternalChatResponse): ChatResponse {
  const { model_version, tier, ...publicResponse } = internal;
  return publicResponse as ChatResponse;
}

// ComparisonResponse → ChatResponse 안전 어댑터 (실제 스키마 기준)
function toChatResponseFromComparison(comp: any): ChatResponse {
  const text =
    comp?.winner?.response ??
    comp?.winner_response?.response ??
    comp?.response ??
    comp?.reply ??
    'No response available';

  return {
    response: String(text),
    emotion_analysis: {
      primary_emotion: 'neutral' as any,
      secondary_emotion: null,
      intensity: typeof comp?.emotion_analysis?.intensity === 'number'
        ? comp.emotion_analysis.intensity
        : 0.0,
      confidence: 0.0
    },
    // ChatResponse 인터페이스 필수 필드 (복수형 배열)
    eft_recommendations: [],
    suggested_actions: [],

    // ChatResponse 인터페이스 필수 메타 필드 (평탄화)
    confidence_score: typeof comp?.confidence_score === 'number'
      ? comp.confidence_score
      : 0.5,
    processing_time: typeof comp?.comparison_time === 'number'
      ? comp.comparison_time
      : (typeof comp?.processing_time === 'number' ? comp.processing_time : 0),
    timestamp: comp?.timestamp ?? new Date().toISOString(),
    requires_followup: false,
    emergency_detected: false,
    professional_referral: false,
    response_id: comp?.response_id ?? `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,

    // ChatResponse 인터페이스 선택 필드
    session_id: comp?.session_id,
    usage: comp?.usage ?? undefined
  };
}

interface ChatRequest {
  message: string;
  conversation_history?: ConversationMessage[];
  user_profile?: {
    user_id?: string;
    eft_experience_level?: string;
    communication_style?: string;
    emotional_sensitivity?: number;
    previous_sessions?: number;
  };
  max_tokens?: number;
  temperature?: number;
  include_eft_recommendations?: boolean;
  session_id?: string;
}

interface ChatResponse {
  response: string;
  emotion_analysis: EmotionAnalysis;
  eft_recommendations: EFTRecommendation[];
  suggested_actions: SuggestedAction[];
  confidence_score: number;
  processing_time: number;
  timestamp: string;
  requires_followup: boolean;
  emergency_detected: boolean;
  professional_referral: boolean;
  session_id?: string;
  response_id: string;
  usage?: Record<string, any>;
}

// 새로운 병렬 비교 응답 인터페이스
interface ComparisonResponse {
  llama3_response: {
    model: string;
    response: string;
    processing_time: number;
    success: boolean;
    error?: string;
  };
  qwen25_response: {
    model: string;
    response: string;
    processing_time: number;
    success: boolean;
    error?: string;
  };
  comparison_time: number;
  faster_model: 'llama3' | 'qwen25' | 'none';
  timestamp: string;
  actions?: ActionItem[];  // 표준 액션 배열
}

interface ServerStatus {
  status: string;
  model_loaded: boolean;
  ai_engine: string;
  uptime: number;
}

class ServerAI {
  private baseURL: string;
  private sessionId: string | null = null;
  private conversationHistory: ConversationMessage[] = [];

  constructor() {
    // ✅ 상대경로 원칙 준수 (절대 URL 계산 로직 제거됨)
    this.baseURL = BASE_URL;
    this.sessionId = this.generateSessionId();
  }

  public buildUrl(path: string): string {
    // 🚨 보완 1: 절대 URL 차단 가드
    if (/^https?:\/\//i.test(path)) {
      throw new Error(
        `[serverAI] 절대 URL 사용 금지됨: "${path}"\n` +
        `상대경로만 허용됨 (예: "/api/chat"). 인프라 설정을 확인하세요.`
      );
    }

    // ✅ 보완 2: 이중 슬래시 제거 + 정규화
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const combined = this.baseURL
      ? `${this.baseURL}${normalizedPath}`
      : normalizedPath;

    // 이중 슬래시 제거 (단, 프로토콜 :// 제외)
    return combined.replace(/([^:]\/)\/+/g, '$1');
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 서버 상태 확인
   */
  async checkServerStatus(): Promise<ServerStatus> {
    // /api/health 시도, 실패 시 /health 폴백
    let response: Response | null = null;
    let lastError: Error | null = null;

    try {
      const healthPaths = ['/api/health', '/health'];
      let lastError: unknown;

      for (const path of healthPaths) {
        try {
          const endpointUrl = this.buildUrl(path);
          const response = await fetch(endpointUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            lastError = new Error(`서버 응답 오류: ${response.status}`);
            continue;
          }

          const data = await response.json();
          return {
            status: data.status,
            model_loaded: data.ai_engine === 'loaded',
            ai_engine: data.ai_engine,
            uptime: data.uptime || 0
          };
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError ?? new Error('서버 상태 확인 실패');
    } catch (error) {
      console.error('서버 상태 확인 실패:', error);
      return {
        status: 'offline',
        model_loaded: false,
        ai_engine: 'not_available',
        uptime: 0
      };
    }
  }

  /**
   * 병렬 비교 채팅 (Llama-3 vs Qwen-2.5) - DialoGPT 대체!
   */
  async chatCompare(
    userMessage: string,
    options: {
      userId?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<ComparisonResponse> {

    const request = {
      message: userMessage,
      max_tokens: options.maxTokens || 512,
      temperature: options.temperature || 0.7
    };

    try {
      console.log('🤖 병렬 비교 요청:', { message: userMessage, baseURL: this.baseURL });

      const response = await fetch(this.buildUrl('/api/chat/compare'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`비교 API 오류 (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const comparisonResponse: ComparisonResponse = data;

      // 대화 히스토리에 사용자 메시지만 추가 (응답은 두 개이므로 별도 처리)
      this.addToHistory('user', userMessage);

      // 성공한 응답이 있으면 히스토리에 추가 (더 빠른 것을 우선)
      if (comparisonResponse.faster_model !== 'none') {
        const winnerResponse = comparisonResponse.faster_model === 'llama3'
          ? comparisonResponse.llama3_response
          : comparisonResponse.qwen25_response;

        if (winnerResponse.success) {
          this.addToHistory('assistant', winnerResponse.response);
        }
      }

      // 🎬 P11 휴리스틱: actions 처리 + A-option 폴백
      const rawActions = Array.isArray(data.actions) ? data.actions : [];
      const normalizedActions: ActionItem[] = rawActions
        .filter((action: any) => action && typeof action.type === 'string' && action.type.trim().length > 0)
        .map((action: any) => ({
          type: action.type.trim(),
          payload: action.payload ?? {},
        }));

      const debugActions = response.headers.get('X-Debug-Actions');
      const debugHash = response.headers.get('X-Actions-Hash');
      if (debugActions) {
        console.log('[actions] server types:', debugActions);
      }
      if (debugHash) {
        console.log('[actions] server hash:', debugHash);
      }

      // A-option 폴백: 백엔드에서 actions가 없으면 프론트에서 휴리스틱 적용
      const enableFallback = (import.meta.env.VITE_ENABLE_SUDS_FALLBACK ?? 'true') === 'true';
      if (normalizedActions.length === 0 && enableFallback) {
        const winnerText = comparisonResponse.faster_model === 'llama3'
          ? comparisonResponse.llama3_response.response
          : comparisonResponse.qwen25_response.response;

        const shouldEmitSuds = this.checkSudsHeuristic(userMessage, winnerText);
        if (shouldEmitSuds) {
          if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
            console.log('🎬 A-option 폴백: 클라이언트에서 ask_suds 합성');
          }
          normalizedActions.push({
            type: 'ask_suds',
            payload: { measurement_type: 'check' },
          });
        }
      }

      // SUDS 배너 이벤트 발송 (중복 방지 가드)
      const seen = new Set<string>();
      for (const action of normalizedActions) {
        if (action.type === 'ask_suds') {
          // 중복 방지: 동일한 action은 한 번만 처리
          const key = JSON.stringify(action);
          if (seen.has(key)) {
            if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
              console.warn('⚠️ 중복 SUDS 액션 스킵:', action);
            }
            continue;
          }
          seen.add(key);

          if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
            console.log('🎬 액션 토큰 수신(or 합성):', action);
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('show-suds-banner', {
                detail: action.payload || { measurement_type: 'check' }
              })
            );
          }
        }
      }

      console.log('✅ 병렬 비교 응답:', {
        faster_model: comparisonResponse.faster_model,
        llama3_time: comparisonResponse.llama3_response.processing_time,
        qwen25_time: comparisonResponse.qwen25_response.processing_time,
        total_time: comparisonResponse.comparison_time,
        actions_count: normalizedActions.length,
        actions_types: normalizedActions.map((a) => a.type)
      });

      return { ...comparisonResponse, actions: normalizedActions };

    } catch (error) {
      console.error('❌ 병렬 비교 실패:', error);
      throw error;
    }
  }

  /**
   * SUDS 휴리스틱 체크 (A-option 폴백용)
   * 사용자 입력 또는 AI 응답이 SUDS 측정을 요구하는지 판단
   */
  private checkSudsHeuristic(userText: string, aiText: string): boolean {
    const userLower = (userText || '').toLowerCase().trim();
    const aiLower = (aiText || '').toLowerCase().trim();

    const hasNegativeCue = NEGATIVE_SUDS_KEYWORDS.some((keyword) => userLower.includes(keyword));
    if (hasNegativeCue) {
      if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
        console.log('[P11 A-option] 부정 감정 키워드 감지:', userText);
      }
      return true;
    }

    // 패턴 1: AI 응답에 "0~10", "0에서 10", "0-10" 포함
    if (/0\s*[-~]\s*10|0에서\s*10|0\s*~\s*10/.test(aiLower)) {
      if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
        console.log('[P11 A-option] 패턴 1 매칭: AI 0~10 유도');
      }
      return true;
    }

    // 패턴 2: 사용자 키워드 - "평가", "점수", "몇 점", "suds"
    if (/(평가|점수|몇\s*점|suds)/.test(userLower)) {
      if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
        console.log('[P11 A-option] 패턴 2 매칭: 평가 키워드');
      }
      return true;
    }

    return false;
  }

  /**
   * AI 채팅 (Engine A/B 병렬 비교) - DialoGPT 완전 대체!
   */
  async chat(
    userMessage: string, 
    options: {
      userId?: string;
      maxTokens?: number;
      temperature?: number;
      includeEFTRecommendations?: boolean;
    } = {}
  ): Promise<ChatResponse> {
    
    try {
      console.log('🤖 Engine A/B 병렬 비교 시작:', { message: userMessage, baseURL: this.baseURL });

      // Engine A/B 병렬 비교 수행
      const comparisonResult = await this.chatCompare(userMessage, {
        userId: options.userId,
        maxTokens: options.maxTokens,
        temperature: options.temperature
      });

      const comparisonActions = Array.isArray(comparisonResult.actions)
        ? comparisonResult.actions
        : [];

      // 병렬 비교 결과를 ChatResponse 형태로 변환
      const winnerResponse = comparisonResult.faster_model === 'llama3' 
        ? comparisonResult.llama3_response 
        : comparisonResult.qwen25_response;

      // 성공한 응답이 있는지 확인
      if (!winnerResponse.success) {
        throw new Error(`Engine A/B 모두 실패: ${winnerResponse.error}`);
      }

      // 기본 ChatResponse 형태로 반환
      const chatResponse: InternalChatResponse = {
        response: winnerResponse.response,
        emotion_analysis: {
          primary_emotion: 'neutral' as any,
          secondary_emotion: null,
          intensity: 0.7,
          confidence: 0.8,
          emotional_keywords: []
        },
        eft_recommendations: [],
        suggested_actions: [],
        confidence_score: 0.85,
        processing_time: comparisonResult.comparison_time,
        model_version: `Engine ${comparisonResult.faster_model === 'llama3' ? 'A (Llama-3)' : 'B (Qwen-2.5)'}`,
        timestamp: comparisonResult.timestamp,
        tier: 'free',
        requires_followup: false,
        emergency_detected: false,
        professional_referral: false,
        response_id: `ab_${Date.now()}`,
        actions: comparisonActions
      };

      console.log('✅ Engine A/B 병렬 응답 완료:', {
        winner: comparisonResult.faster_model,
        response: chatResponse.response.substring(0, 100) + '...',
        processingTime: comparisonResult.comparison_time,
        llama3_time: comparisonResult.llama3_response.processing_time,
        qwen25_time: comparisonResult.qwen25_response.processing_time
      });

      // 외부 반환 직전 model_version 제거
      const publicResponse = toPublicChatResponse(chatResponse);
      return { ...publicResponse, actions: comparisonActions };

    } catch (error) {
      console.error('❌ Engine A/B 병렬 비교 실패:', error);

      // ✅ /api/chat/compare 실패 시 즉시 폴백 메시지 반환
      console.warn('⚠️ Engine A/B 실패, 폴백 메시지 표시');

      // 최종 폴백 응답 생성
      return this.createFallbackResponse(userMessage, error as Error);
    }
  }

  /**
   * 스트리밍 채팅 (실시간 응답)
   */
  async chatStream(
    userMessage: string,
    onChunk: (chunk: string) => void,
    options: { userId?: string } = {}
  ): Promise<void> {
    
    const request: ChatRequest = {
      message: userMessage,
      conversation_history: this.conversationHistory.slice(-10),
      user_profile: {
        user_id: options.userId,
        eft_experience_level: 'beginner',
        communication_style: 'empathetic'
      },
      session_id: this.sessionId || undefined
    };

    try {
      const response = await fetch(this.buildUrl('/api/chat/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`스트리밍 요청 실패: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('응답 스트림을 사용할 수 없습니다');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.chunk_type === 'text') {
                onChunk(data.content);
                fullResponse += data.content;
              } else if (data.error) {
                throw new Error(data.error);
              }
              
            } catch (e) {
              console.warn('스트림 청크 파싱 실패:', line);
            }
          }
        }
      }

      // 대화 히스토리 업데이트
      this.addToHistory('user', userMessage);
      this.addToHistory('assistant', fullResponse);

    } catch (error) {
      console.error('스트리밍 채팅 실패:', error);
      onChunk(`죄송합니다. 서버와 연결에 문제가 있습니다: ${(error as Error).message}`);
    }
  }

  /**
   * 감정 분석만 수행
   */
  async analyzeEmotion(text: string): Promise<EmotionAnalysis | null> {
    try {
      const response = await fetch(this.buildUrl('/api/analyze/emotion'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          detailed_analysis: true
        }),
      });

      if (!response.ok) {
        throw new Error(`감정 분석 실패: ${response.status}`);
      }

      const data = await response.json();
      return data.emotion_analysis;

    } catch (error) {
      console.error('감정 분석 실패:', error);
      return null;
    }
  }

  /**
   * EFT 기법 추천
   */
  async recommendEFT(emotionAnalysis: EmotionAnalysis): Promise<EFTRecommendation[]> {
    try {
      const response = await fetch(this.buildUrl('/api/recommend/eft'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emotion_state: emotionAnalysis
        }),
      });

      if (!response.ok) {
        throw new Error(`EFT 추천 실패: ${response.status}`);
      }

      const data = await response.json();
      return data.recommendations || [];

    } catch (error) {
      console.error('EFT 추천 실패:', error);
      return [];
    }
  }

  /**
   * 대화 히스토리에 메시지 추가
   */
  private addToHistory(role: 'user' | 'assistant', content: string): void {
    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date().toISOString()
    };

    this.conversationHistory.push(message);

    // 히스토리 크기 제한 (최근 20개만 유지)
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }
  }

  /**
   * 폴백 응답 생성 (서버 오류 시)
   */
  private createFallbackResponse(userMessage: string, error: Error): ChatResponse {
    const fallbackMessages = [
      "죄송합니다. 잠시 서버와 연결이 불안정합니다. 곧 다시 시도해 주세요.",
      "현재 AI 서버에 일시적인 문제가 있습니다. 잠시 후 다시 말씀해 주세요.",
      "서버 응답에 문제가 있어 임시로 기본 응답을 드립니다. 곧 정상화될 예정입니다."
    ];

    const randomMessage = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];

    return {
      response: randomMessage,
      emotion_analysis: {
        primary_emotion: 'neutral' as any,
        secondary_emotion: null,
        intensity: 0.5,
        confidence: 0.3,
        emotional_keywords: []
      },
      eft_recommendations: [],
      suggested_actions: [],
      confidence_score: 0.3,
      processing_time: 0,
      timestamp: new Date().toISOString(),
      requires_followup: false,
      emergency_detected: false,
      professional_referral: false,
      response_id: `fallback_${Date.now()}`
    };
  }

  /**
   * 대화 히스토리 초기화
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.sessionId = this.generateSessionId();
  }

  /**
   * 현재 대화 히스토리 반환
   */
  getHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * 서버 연결 상태 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      const status = await this.checkServerStatus();
      return status.status === 'healthy' && status.model_loaded;
    } catch {
      return false;
    }
  }
}

// === local_vllm Provider 전용 함수들 ===

// Firestore 헬퍼 함수 import (있다고 가정)
// import { fsUpdateTurn } from './fs';

/**
 * A/B 요청 + 텔레메트리 수집
 * - 기본 반환: 백엔드 /ab/chat 결과(JSON)
 * - logCtx(sessionId, turnId)를 넘기면 Firestore의 해당 턴 문서에 텔레메트리를 저장
 */
export async function generateReplyAB(
  message: string,
  logCtx?: { sessionId: string; turnId: string },
  isPremium: boolean = false
) {
  if (provider !== "local_vllm") throw new Error("Not local_vllm provider");

  const payload = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
    temperature: 0.6,
    max_tokens: 512,
  };

  // 상대경로 직접 사용
  const endpoint = isPremium ? '/api/chat/premium' : '/ab/chat';
  const targetUrl = endpoint;

  // 총 소요 시간
  const T0 = performance.now();
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: headersCompat(isPremium),
    body: JSON.stringify(payload),
  });
  const T1 = performance.now();
  const totalLatencyMs = Math.round(T1 - T0);

  if (!res.ok) {
    const errText = await (async () => {
      try {
        const j = await res.json();
        return j?.detail || j?.error || JSON.stringify(j);
      }
      catch {
        return await res.text();
      }
    })();

    // 실패도 텔레메트리 남길 수 있게
    if (logCtx) {
      // Firestore 업데이트 함수가 있다면 사용
      // await fsUpdateTurn(logCtx.sessionId, logCtx.turnId, {
      //   ab: {
      //     overallOk: false,
      //     httpStatus: res.status,
      //     totalLatencyMs,
      //     error: errText,
      //   },
      // });
      console.log('텔레메트리 저장 (실패):', { logCtx, error: errText, totalLatencyMs });
    }
    throw new Error(`AB chat failed: ${res.status} ${errText}`);
  }

  const json = await res.json();
  // 백엔드 반환: { llama3_response, qwen25_response, faster_model, comparison_time ... }
  const a = json.llama3_response ?? {};
  const b = json.qwen25_response ?? {};

  // vLLM 표준 응답에서 본문/usage 꺼내기
  const contentA = a?.choices?.[0]?.message?.content ?? a?.response ?? "";
  const usageA = a?.usage ?? null;

  const contentB = b?.choices?.[0]?.message?.content ?? b?.response ?? "";
  const usageB = b?.usage ?? null;

  // 빠른 모델(백엔드가 정해줬으면 그 값, 없으면 단순 길이/OK로 추정)
  const fasterModel = json.faster_model ??
    (contentA && !contentB ? "llama3" : !contentA && contentB ? "qwen25" : "unknown");

  // 텔레메트리 페이로드 (UI/대시보드에서 쓰기 좋게 정규화)
  const telemetry = {
    totalLatencyMs,
    fasterModel,
    a: {
      ok: !!contentA,
      model: "engine-a",
      tokens: usageA ? {
        prompt: usageA.prompt_tokens ?? null,
        completion: usageA.completion_tokens ?? null,
        total: usageA.total_tokens ?? null,
      } : null,
      preview: contentA.slice(0, 200),
    },
    b: {
      ok: !!contentB,
      model: "engine-b",
      tokens: usageB ? {
        prompt: usageB.prompt_tokens ?? null,
        completion: usageB.completion_tokens ?? null,
        total: usageB.total_tokens ?? null,
      } : null,
      preview: contentB.slice(0, 200),
    },
  };

  // Firestore에 저장 (세션/턴을 알고 있을 때만)
  if (logCtx) {
    // Firestore 업데이트 함수가 있다면 사용
    // await fsUpdateTurn(logCtx.sessionId, logCtx.turnId, {
    //   textAI_A: contentA,
    //   textAI_B: contentB,
    //   ab: telemetry,
    // });
    console.log('텔레메트리 저장 (성공):', { logCtx, telemetry });
  }

  // 타입 안전 반환
  return toChatResponseFromComparison(json);
}

/**
 * 간단한 A/B 응답 호출 (텔레메트리 없음)
 */
export async function generateReplyAB_simple(message: string, isPremium: boolean = false) {
  if (provider !== "local_vllm") throw new Error("Not local_vllm provider");

  const payload = {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: message }
    ],
    temperature: 0.6,
    max_tokens: 512
  };

  // 상대경로 직접 사용
  const endpoint = isPremium ? '/api/chat/premium' : '/ab/chat';
  const targetUrl = endpoint;

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: headersCompat(isPremium),
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`AB chat failed: ${res.status}`);
  const json = await res.json();
  return toChatResponseFromComparison(json);
}

// 싱글톤 인스턴스
let serverAIInstance: ServerAI | null = null;

export function getServerAI(): ServerAI {
  if (!serverAIInstance) {
    serverAIInstance = new ServerAI();
  }
  return serverAIInstance;
}

// === 유틸리티 함수들 ===

// 새로운 프리미엄 서비스 통합을 위한 임포트 (서비스 통합 후 활성화)
// import { PremiumAuthManager } from '@/utils/premiumAuth';
// import { premiumService } from '@/services/premiumService';

/**
 * 프리미엄 API 키 가져오기 (레거시 호환)
 * 우선순위: 로컬스토리지 → 환경변수(Vite)
 */
function getPremiumKey(): string {
  // 새로운 PremiumAuthManager로 마이그레이션 예정
  // return PremiumAuthManager.getPremiumKey() || '';

  const ls = typeof window !== "undefined" ? localStorage.getItem("premiumKey") ?? "" : "";
  const env = import.meta?.env?.VITE_PREMIUM_API_KEY ?? "";
  return (ls || env).trim();
}


/**
 * 프리미엄 서비스 통합 래퍼 (새로운 API)
 * 기존 ServerAI 클래스와 새로운 PremiumService 연동
 */
export class EnhancedServerAI extends ServerAI {
  /**
   * 자동 티어 감지 채팅 (프리미엄 키 있으면 프리미엄, 없으면 무료)
   */
  async chatWithAutoTier(message: string, options: any = {}): Promise<ChatResponse> {
    const hasPremium = getPremiumKey().length > 0;

    if (hasPremium) {
      try {
        // 프리미엄 시도
        return await this.chatPremiumDirect(message, options);
      } catch (error: any) {
        // 인증 실패 시 무료로 폴백
        if (error.status === 401 || error.status === 403) {
          console.warn('Premium auth failed, falling back to free tier');
          if (typeof window !== 'undefined') {
            localStorage.removeItem('premiumKey');
          }
          return await this.chat(message, options);
        }
        throw error;
      }
    }

    // 무료 티어
    return await this.chat(message, options);
  }

  /**
   * 프리미엄 직접 호출 (에러 핸들링 강화)
   */
  async chatPremiumDirect(message: string, options: any = {}): Promise<ChatResponse> {
    const headers = headersCompat(true);

    if (!headers.get('X-API-Key')) {
      throw new Error('Premium key required but not found');
    }

    try {
      const response = await fetch(this.buildUrl('/api/chat/premium'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 700,
          system_prompt: options.systemPrompt,
          sessionId: options.sessionId,
          userId: options.userId,
          tier: 'premium'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw {
          status: response.status,
          message: errorData.detail || 'Premium chat failed',
          data: errorData
        };
      }

      const data = await response.json();

      const internalResponse: InternalChatResponse = {
        response: data.response || 'No response available',
        emotion_analysis: {
          primary_emotion: 'neutral' as any,
          secondary_emotion: null,
          intensity: 0.7,
          confidence: 0.8,
          emotional_keywords: []
        },
        eft_recommendations: [],
        suggested_actions: [],
        confidence_score: 0.9,
        processing_time: data.processing_time || 0,
        model_version: data.model || 'Premium Model',
        timestamp: data.timestamp || new Date().toISOString(),
        tier: 'premium',
        requires_followup: false,
        emergency_detected: false,
        professional_referral: false,
        response_id: `premium_${Date.now()}`
      };

      // 외부 반환 직전 model_version과 tier 제거
      return toPublicChatResponse(internalResponse);

    } catch (error: any) {
      console.error('Premium chat error:', error);
      throw error;
    }
  }

  /**
   * 프리미엄 키 검증
   */
  async validatePremiumKey(): Promise<boolean> {
    const key = getPremiumKey();
    if (!key) return false;

    try {
      const response = await fetch(this.buildUrl('/api/premium/validate'), {
        method: 'GET',
        headers: {
          'X-API-Key': key
        }
      });

      return response.status === 200;
    } catch (error) {
      console.warn('Premium key validation failed:', error);
      return false;
    }
  }

  /**
   * 현재 티어 정보
   */
  getTierInfo(): { tier: 'free' | 'premium'; hasKey: boolean } {
    const hasKey = getPremiumKey().length > 0;
    return {
      tier: hasKey ? 'premium' : 'free',
      hasKey
    };
  }
}

/**
 * SUDS 점수 기록 함수
 * 백엔드 /suds 엔드포인트 호출 (레거시 /api/suds/record 1회 폴백 포함)
 *
 * 중복 제출 방지: 동일 세션에서 동시에 여러 요청 방지
 */
let sudsSubmitting = false;
const LEGACY_FALLBACK_STATUS_CODES = new Set([404, 405, 308]);

export async function recordSuds(
  payload: {
    score: number;
    type?: 'manual' | 'auto' | 'system';
    source?: string;
    emotion?: string;
    contextId?: string;
    context_id?: string;
    signal?: AbortSignal;
  }
): Promise<{ ok: boolean; actions: ActionItem[]; error?: string }> {
  if (sudsSubmitting) {
    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
      console.warn('⚠️ SUDS 제출 중복 방지: 이미 제출 중입니다');
    }
    return {
      ok: false,
      actions: [],
      error: 'Already submitting SUDS score'
    };
  }

  sudsSubmitting = true;

  try {
    const url = '/suds';
    const requestBody = {
      type: payload.type ?? 'manual',
      score: payload.score,
    };

    const bodyString = JSON.stringify(requestBody);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: bodyString,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      signal: payload.signal,
    });

    const rawText = await response.text();
    let json: any = null;
    try {
      json = rawText ? JSON.parse(rawText) : null;
    } catch (parseError) {
      console.debug('[recordSuds] JSON parse failed, returning raw text');
    }

    console.debug('[recordSuds] request', {
      method: 'POST',
      url,
      contentType: 'application/json',
      bodyLength: bodyString.length,
    });
    console.debug('[recordSuds] response', {
      status: response.status,
      ok: response.ok,
      body: json ?? rawText,
    });

    let effectiveBody: any = json ?? rawText;

    const shouldAttemptLegacy = !response.ok && LEGACY_FALLBACK_STATUS_CODES.has(response.status);

    if (shouldAttemptLegacy) {
      console.warn(
        `⚠️ POST /suds unavailable (status ${response.status}). Retrying with legacy endpoint once.`,
      );
      const legacyUrl = '/api/suds/record';
      const legacyRequestBody: Record<string, any> = {
        value: payload.score,
        score: payload.score,
        source: payload.source ?? 'compare',
      };
      if (payload.emotion) {
        legacyRequestBody.emotion = payload.emotion;
      }
      const contextIdentifier = payload.contextId ?? payload.context_id;
      if (typeof contextIdentifier === 'string' && contextIdentifier.length > 0) {
        legacyRequestBody.context_id = contextIdentifier;
      }

      const legacyBodyString = JSON.stringify(legacyRequestBody);
      const legacyResponse = await fetch(legacyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: legacyBodyString,
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        signal: payload.signal,
      });
      const legacyText = await legacyResponse.text();
      let legacyJson: any = null;
      try {
        legacyJson = legacyText ? JSON.parse(legacyText) : null;
      } catch (fallbackError) {
        console.debug('[recordSuds] legacy fallback JSON parse failed, returning raw text');
      }
      console.debug('[recordSuds] fallback request', {
        method: 'POST',
        url: legacyUrl,
        contentType: 'application/json',
        bodyLength: legacyBodyString.length,
      });
      console.debug('[recordSuds] fallback response', {
        status: legacyResponse.status,
        ok: legacyResponse.ok,
        body: legacyJson ?? legacyText,
      });
      // TODO(migration): remove legacy fallback after 2024-11-07 once all clients use /suds.
      if (!legacyResponse.ok) {
        const legacyErrorDetailRaw = legacyJson ?? legacyText ?? legacyResponse.statusText;
        const legacyErrorDetail =
          typeof legacyErrorDetailRaw === 'string'
            ? legacyErrorDetailRaw
            : JSON.stringify(legacyErrorDetailRaw);
        throw new Error(
          `Legacy SUDS record fallback failed: HTTP ${legacyResponse.status} ${legacyErrorDetail}`,
        );
      }
      effectiveBody = legacyJson ?? legacyText;
    } else if (!response.ok) {
      const errorDetailRaw = json ?? rawText ?? response.statusText;
      const errorDetail =
        typeof errorDetailRaw === 'string' ? errorDetailRaw : JSON.stringify(errorDetailRaw);
      throw new Error(`SUDS record failed: HTTP ${response.status} ${errorDetail}`);
    }

    const parsedJson = typeof effectiveBody === 'string' ? null : effectiveBody;

    const actions: ActionItem[] = Array.isArray((parsedJson ?? {})?.actions)
      ? parsedJson.actions
          .filter((action: any) => action && typeof action.type === 'string' && action.type.trim().length > 0)
          .map((action: any) => ({
            type: action.type.trim(),
            payload: action.payload ?? {},
          }))
      : [];

    if (parsedJson?.ok === false) {
      return {
        ok: false,
        actions,
        error: typeof parsedJson.error === 'string' ? parsedJson.error : undefined,
      };
    }

    if (import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true') {
      console.log('✅ SUDS 기록 성공:', { score: payload.score, actions });
    }

    return {
      ok: true,
      actions,
    };
  } catch (error) {
    console.error('SUDS 기록 실패:', error);
    return {
      ok: false,
      actions: [],
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    sudsSubmitting = false;
  }
}

export default ServerAI;
export type { ChatResponse, ComparisonResponse };