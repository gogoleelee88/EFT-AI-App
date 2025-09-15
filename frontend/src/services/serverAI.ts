/**
 * 서버 기반 AI 클라이언트
 * FastAPI 기반 EFT 전문 AI 서버와 통신
 */

import type { ConversationMessage, EmotionAnalysis, EFTRecommendation, SuggestedAction } from '../types/serverAI';

// 환경변수에서 서버 URL 가져오기 (Vite 환경변수 사용)
const SERVER_URL = import.meta.env.VITE_AI_SERVER_URL || 'http://localhost:8000';

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
    this.baseURL = SERVER_URL;
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 서버 상태 확인
   */
  async checkServerStatus(): Promise<ServerStatus> {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`서버 응답 오류: ${response.status}`);
      }

      const data = await response.json();
      return {
        status: data.status,
        model_loaded: data.ai_engine === 'loaded',
        ai_engine: data.ai_engine,
        uptime: data.uptime || 0
      };

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

      const response = await fetch(`${this.baseURL}/api/chat/compare`, {
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

      const comparisonResponse: ComparisonResponse = await response.json();

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

      console.log('✅ 병렬 비교 응답:', {
        faster_model: comparisonResponse.faster_model,
        llama3_time: comparisonResponse.llama3_response.processing_time,
        qwen25_time: comparisonResponse.qwen25_response.processing_time,
        total_time: comparisonResponse.comparison_time
      });

      return comparisonResponse;

    } catch (error) {
      console.error('❌ 병렬 비교 실패:', error);
      throw error;
    }
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

      // 병렬 비교 결과를 ChatResponse 형태로 변환
      const winnerResponse = comparisonResult.faster_model === 'llama3' 
        ? comparisonResult.llama3_response 
        : comparisonResult.qwen25_response;

      // 성공한 응답이 있는지 확인
      if (!winnerResponse.success) {
        throw new Error(`Engine A/B 모두 실패: ${winnerResponse.error}`);
      }

      // 기본 ChatResponse 형태로 반환
      const chatResponse: ChatResponse = {
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
        response_id: `ab_${Date.now()}`
      };

      console.log('✅ Engine A/B 병렬 응답 완료:', {
        winner: comparisonResult.faster_model,
        response: chatResponse.response.substring(0, 100) + '...',
        processingTime: comparisonResult.comparison_time,
        llama3_time: comparisonResult.llama3_response.processing_time,
        qwen25_time: comparisonResult.qwen25_response.processing_time
      });

      return chatResponse;

    } catch (error) {
      console.error('❌ Engine A/B 병렬 비교 실패:', error);
      
      // 폴백 응답 생성
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
      const response = await fetch(`${this.baseURL}/api/chat/stream`, {
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
      const response = await fetch(`${this.baseURL}/api/analyze/emotion`, {
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
      const response = await fetch(`${this.baseURL}/api/recommend/eft`, {
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

// 싱글톤 인스턴스
let serverAIInstance: ServerAI | null = null;

export function getServerAI(): ServerAI {
  if (!serverAIInstance) {
    serverAIInstance = new ServerAI();
  }
  return serverAIInstance;
}

export default ServerAI;
export type { ChatResponse, ComparisonResponse };