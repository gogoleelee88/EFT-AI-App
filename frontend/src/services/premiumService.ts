/**
 * 프리미엄 서비스 통합 래퍼
 * 무료/프리미엄 기능 자동 라우팅 및 폴백 처리
 */

import { PremiumAuthManager } from '@/utils/premiumAuth';

export interface ChatRequest {
  message: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  sessionId?: string;
  userId?: string;
}

export interface ChatResponse {
  response: string;
  model_version?: string;
  processing_time?: number;
  tier: 'free' | 'premium';
  success: boolean;
  error?: string;
}

export class PremiumService {
  // 상대경로 사용 (동일 오리진)
  // 개발 환경: vite devServer proxy 또는 .env.development 사용
  private baseUrl: string = '';

  constructor() {
    // baseUrl 파라미터 제거 - 항상 상대경로 사용
  }

  /**
   * 자동 티어 감지 채팅 (프리미엄 키 있으면 프리미엄, 없으면 무료)
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const hasPremium = PremiumAuthManager.hasPremiumKey();

    if (hasPremium) {
      try {
        return await this.premiumChat(request);
      } catch (error: any) {
        // 프리미엄 실패 시 무료로 폴백
        if (error.status === 401 || error.status === 403) {
          console.warn('[PremiumService] Premium auth failed, falling back to free');
          PremiumAuthManager.clearPremiumKey();
          return await this.freeChat(request);
        }
        throw error;
      }
    }

    return await this.freeChat(request);
  }

  /**
   * 프리미엄 채팅 (강제)
   */
  async premiumChat(request: ChatRequest): Promise<ChatResponse> {
    const headers = PremiumAuthManager.createHeaders();

    if (!headers.get('X-API-Key')) {
      throw new Error('Premium key required but not found');
    }

    const response = await fetch(`${this.baseUrl}/api/chat/premium`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: request.message,
        temperature: request.temperature || 0.7,
        max_tokens: request.max_tokens || 700,
        system_prompt: request.system_prompt,
        sessionId: request.sessionId,
        userId: request.userId,
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
    return {
      response: data.response || data.reply || 'No response',
      model_version: data.model || 'Premium Model',
      processing_time: data.processing_time || 0,
      tier: 'premium',
      success: true
    };
  }

  /**
   * 무료 채팅 (Engine A/B 병렬)
   */
  async freeChat(request: ChatRequest): Promise<ChatResponse> {
    const headers = PremiumAuthManager.createHeaders(true); // 무료는 기본 헤더만

    const response = await fetch(`${this.baseUrl}/api/chat/compare`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: request.message,
        temperature: request.temperature || 0.7,
        max_tokens: request.max_tokens || 512
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw {
        status: response.status,
        message: errorData.detail || 'Free chat failed',
        data: errorData
      };
    }

    const data = await response.json();

    // Engine A/B 응답 처리
    const winnerResponse = data.faster_model === 'llama3'
      ? data.llama3_response
      : data.qwen25_response;

    return {
      response: winnerResponse?.response || 'Engine response failed',
      model_version: `Engine ${data.faster_model === 'llama3' ? 'A (Llama-3)' : 'B (Qwen-2.5)'}`,
      processing_time: data.comparison_time || 0,
      tier: 'free',
      success: winnerResponse?.success || false
    };
  }

  /**
   * 프리미엄 키 검증
   */
  async validatePremiumAccess(): Promise<boolean> {
    return await PremiumAuthManager.validatePremiumKey(this.baseUrl);
  }

  /**
   * 현재 티어 정보 가져오기
   */
  getTierInfo(): { tier: 'free' | 'premium'; hasKey: boolean; keyInfo: any } {
    const hasKey = PremiumAuthManager.hasPremiumKey();
    const keyInfo = PremiumAuthManager.getPremiumKeyInfo();

    return {
      tier: hasKey ? 'premium' : 'free',
      hasKey,
      keyInfo
    };
  }

  /**
   * 프리미엄 업그레이드 (키 설정)
   */
  upgradeToPremium(premiumKey: string): void {
    PremiumAuthManager.setPremiumKey(premiumKey);
  }

  /**
   * 무료 티어로 다운그레이드
   */
  downgradeToFree(): void {
    PremiumAuthManager.clearPremiumKey();
  }
}

// 싱글톤 인스턴스
export const premiumService = new PremiumService();

// 편의 함수들
export const chatWithAutoTier = (request: ChatRequest) => premiumService.chat(request);
export const chatPremium = (request: ChatRequest) => premiumService.premiumChat(request);
export const chatFree = (request: ChatRequest) => premiumService.freeChat(request);
export const getCurrentTier = () => premiumService.getTierInfo();