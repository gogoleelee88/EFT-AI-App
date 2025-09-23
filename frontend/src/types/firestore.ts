// frontend/src/types/firestore.ts - Firebase Timestamp 대응 MVP 타입

import type { ConversationState } from './conversationState';
// 1) Firebase Timestamp 타입 import (타입 전용)
import type { Timestamp } from 'firebase/firestore';

// 공통: 서버/클라이언트 어디서든 Date 또는 Timestamp가 올 수 있음
export type FSDate = Date | Timestamp;

// 사용자 프로필
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: FSDate;
  lastLoginAt: FSDate;
  preferences: {
    notifications: boolean;
    dataCollection: boolean;
    aiLearning: boolean;
  };
  eftSettings: {
    preferredTechniques: string[];
    sessionReminders: boolean;
    privacyLevel: 'public' | 'private' | 'anonymous';
  };
}

// EFT 세션
export interface EFTSession {
  id: string;
  uid: string;                 // 보안 규칙과 일치
  startedAt: FSDate;
  endedAt?: FSDate;            // ← 옵셔널
  status: 'active' | 'completed' | 'abandoned';
  conversationState: ConversationState;
  turnCount: number;

  suds?: {
    pre?: number;
    post?: number;
    preNotes?: string;
    postNotes?: string;
    delta?: number;            // pre - post
  };

  // ← MVP에선 일부 필드가 아직 없을 수 있으므로 옵셔널
  metadata?: {
    aiModel?: string;
    totalMessages?: number;
    avgResponseTime?: number;
    emergencyDetected?: boolean;
    interventionsUsed?: string[];
  };
}

// 개별 대화 턴 (sessions/{sessionId}/turns/{turnId})
export interface ConversationTurn {
  id: string;
  sessionId: string;
  uid: string;                 // ← 턴에도 uid 포함 권장 (규칙/쿼리 편함)
  turnIndex: number;
  ts: FSDate;

  userMessage: {
    content: string;
    timestamp: FSDate;
    metadata?: {
      inputMethod: 'text' | 'voice';
      emotionalIntensity?: number;
    };
  };

  aiResponse?: {               // ← 최초엔 없을 수 있음
    content: string;
    timestamp: FSDate;
    metadata?: {
      model?: string;
      processingTime?: number;
      confidence?: number;
      tier?: 'free' | 'premium' | 'enterprise';
    };
  };

  sudsPre?: number;
  sudsPost?: number;
  topEmotion?: string;

  conversationState: ConversationState;
}

// 200문항 결과
export interface Questionnaire200Result {
  uid: string;
  completedAt: FSDate;
  responses: Record<string, string>;
  analysis: {
    scores: Record<string, number>;
    summary: string;
    deltaMean?: number;
  };
}

// 통찰 언락 (insights_unlock/{uid}/{unlockId})
export interface InsightUnlock {
  insightId: string;   // 예: 'L1_intro', 'L2_pattern'
  level: number;
  uid: string;
  progressScore: number;   // 0~1
  evidenceQuotes: string[];
  deltaMean: number;
  unlockedAt: FSDate;
}

// 집계 (insight_agg/{uid})
export interface InsightAggregation {
  uid: string;
  windowDays: number;
  samples: number;
  deltaMean: number;
  topKEmotions: string[];
  updatedAt: FSDate;
}

// 경로 상수
export const FIRESTORE_COLLECTIONS = {
  SESSIONS: 'sessions',               // sessions/{sessionId}
  TURNS: 'turns',                     // sessions/{sessionId}/turns/{turnId}
  QUESTIONNAIRE_200: 'questionnaire_200',
  INSIGHTS_UNLOCK: 'insights_unlock', // insights_unlock/{uid}/{unlockId}
  INSIGHT_AGG: 'insight_agg',         // insight_agg/{uid}
  PROGRESS: 'progress'
} as const;

// 통찰 언락 경로 헬퍼
export const getInsightUnlockPath = (uid: string, unlockId: string) =>
  `${FIRESTORE_COLLECTIONS.INSIGHTS_UNLOCK}/${uid}/${unlockId}`;

export const getInsightAggPath = (uid: string) =>
  `${FIRESTORE_COLLECTIONS.INSIGHT_AGG}/${uid}`;