/**
 * 프리미엄 인증 관리 유틸리티
 * X-API-Key 기반 프리미엄 기능 접근 제어
 */

export interface PremiumKeyConfig {
  key: string;
  expiresAt?: number;
  tier: 'premium' | 'enterprise';
}

export class PremiumAuthManager {
  private static readonly STORAGE_KEY = 'eft_premium_key';
  private static readonly TEMP_KEY = 'eft_temp_premium';

  /**
   * 프리미엄 키 저장 (영구)
   */
  static setPremiumKey(key: string, tier: 'premium' | 'enterprise' = 'premium'): void {
    const config: PremiumKeyConfig = {
      key: key.trim(),
      tier,
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30일
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
    }
  }

  /**
   * 임시 프리미엄 키 설정 (세션용)
   */
  static setTempPremiumKey(key: string): void {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(this.TEMP_KEY, key.trim());
    }
  }

  /**
   * 프리미엄 키 가져오기 (우선순위: 임시 > 영구 > 환경변수)
   */
  static getPremiumKey(): string | null {
    if (typeof window === 'undefined') {
      return import.meta?.env?.VITE_PREMIUM_API_KEY || null;
    }

    // 1. 임시 키 확인
    const tempKey = sessionStorage.getItem(this.TEMP_KEY);
    if (tempKey) return tempKey.trim();

    // 2. 영구 키 확인
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const config: PremiumKeyConfig = JSON.parse(stored);

        // 만료 확인
        if (config.expiresAt && Date.now() > config.expiresAt) {
          this.clearPremiumKey();
          return null;
        }

        return config.key;
      }
    } catch (error) {
      console.warn('[PremiumAuth] Invalid stored key format:', error);
      this.clearPremiumKey();
    }

    // 3. 환경변수 폴백
    return import.meta?.env?.VITE_PREMIUM_API_KEY || null;
  }

  /**
   * 프리미엄 키 존재 여부 확인
   */
  static hasPremiumKey(): boolean {
    return !!this.getPremiumKey();
  }

  /**
   * 프리미엄 키 제거
   */
  static clearPremiumKey(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
      sessionStorage.removeItem(this.TEMP_KEY);
    }
  }

  /**
   * 프리미엄 키 정보 가져오기
   */
  static getPremiumKeyInfo(): PremiumKeyConfig | null {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const config: PremiumKeyConfig = JSON.parse(stored);
        return config;
      }
    } catch (error) {
      console.warn('[PremiumAuth] Invalid key info:', error);
    }

    return null;
  }

  /**
   * API 헤더 생성 (프리미엄 여부 자동 감지)
   */
  static createHeaders(forceBasic: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (!forceBasic) {
      const premiumKey = this.getPremiumKey();
      if (premiumKey) {
        headers.set('X-API-Key', premiumKey);
      }
    }

    return headers;
  }

  /**
   * 프리미엄 키 유효성 검증 (백엔드 호출)
   */
  static async validatePremiumKey(baseUrl: string = 'http://127.0.0.1:8000'): Promise<boolean> {
    const key = this.getPremiumKey();
    if (!key) return false;

    try {
      const response = await fetch(`${baseUrl}/api/chat/premium`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key
        },
        body: JSON.stringify({ message: 'validation_test' })
      });

      return response.status !== 401;
    } catch (error) {
      console.warn('[PremiumAuth] Key validation failed:', error);
      return false;
    }
  }
}

// 편의 함수들 (기존 코드와 호환성)
export const getPremiumApiKey = () => PremiumAuthManager.getPremiumKey() || '';
export const hasPremiumAccess = () => PremiumAuthManager.hasPremiumKey();
export const setPremiumKey = (key: string) => PremiumAuthManager.setPremiumKey(key);
export const clearPremiumAccess = () => PremiumAuthManager.clearPremiumKey();