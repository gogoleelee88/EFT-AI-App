// frontend/src/services/premiumAPI.ts - 프리미엄 백엔드 연동
import { http, httpJson } from './http';

const env = (import.meta as any).env ?? {};
export const PREMIUM_API_CONFIG = {
  BASE_URL: env.VITE_API_BASE_URL || env.VITE_BACKEND_URL || 'http://localhost:8000',
  HEADERS: {
    'Content-Type': 'application/json; charset=utf-8',
    'X-API-Key': env.VITE_API_KEY || env.VITE_PREMIUM_API_KEY || 'premium-eft-ai-moodtalk-2025!'
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
  return await httpJson('/api/chat', {
    message: request.message,
    temperature: request.temperature || 0.7,
    max_tokens: request.max_tokens || 300,
    sessionId: request.sessionId,
    userId: request.userId
  });
};

export const validatePremiumKey = async (): Promise<boolean> => {
  try {
    const response = await http('/api/validate');
    return response.ok;
  } catch {
    return false;
  }
};