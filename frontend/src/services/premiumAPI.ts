// frontend/src/services/premiumAPI.ts - 프리미엄 백엔드 연동
export const PREMIUM_API_CONFIG = {
  BASE_URL: '',  // ✅ 상대경로만 사용 (Proxy/CDN이 라우팅 처리)
  HEADERS: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-API-Key': 'premium-eft-ai-moodtalk-2025!'
  }
};

export interface ChatRequest {
  message: string;
  temperature?: number;
  max_tokens?: number;
  sessionId?: string;
  userId?: string;
}

export interface ChatResponse {
  response: string;
  model: string;
  processing_time: number;
  success: boolean;
  session_id?: string;
  timestamp: string;
}

export const callPremiumChat = async (request: ChatRequest): Promise<ChatResponse> => {
  const response = await fetch(`${PREMIUM_API_CONFIG.BASE_URL}/api/chat`, {
    method: 'POST',
    headers: PREMIUM_API_CONFIG.HEADERS,
    body: JSON.stringify({
      message: request.message,
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens || 300,
      sessionId: request.sessionId,
      userId: request.userId
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
};

export const validatePremiumKey = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${PREMIUM_API_CONFIG.BASE_URL}/api/validate`, {
      method: 'GET',
      headers: PREMIUM_API_CONFIG.HEADERS
    });
    return response.ok;
  } catch {
    return false;
  }
};