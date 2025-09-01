/**
 * 200문항 심리검사 시스템 타입 정의
 * 
 * 목적: 
 * - 200문항.md → personality-quest-200.json으로 변환된 데이터 구조에 맞는 타입 정의
 * - 기존 personalityQuest.ts와는 별도로 운영 (추후 통합 예정)
 * 
 * 특징:
 * - 5개 카테고리: 직장생활, 인간관계, 감정조절, 스트레스갈등, 개인가치관, 자기인식
 * - 카테고리별 5개 척도로 점수 산출
 * - A,B,C,D,E 5지선다 방식
 * 
 * 사용처:
 * - Questionnaire200 컴포넌트에서 사용
 * - 200문항 심리검사 진행 및 결과 분석
 * 
 * 작성일: 2025-08-18
 * 작성자: Claude (EFT-AI-App 프로젝트)
 */

// 메인 설문지 구조
export interface Questionnaire200 {
  questionnaire: QuestionnaireInfo;
  questions: Question[];
}

export interface QuestionnaireInfo {
  title: string;
  description: string;
  version: string;
  totalQuestions: number;
  categories: Record<string, Category>;
  scoringSystem: ScoringSystem;
}

export interface Category {
  description: string;
  scales: string[];
}

export interface ScoringSystem {
  scaleRange: [number, number];
  description: string;
}

export interface Question {
  id: number;
  category: string;
  question: string;
  options: Option[];
}

export interface Option {
  id: string; // A, B, C, D, E
  text: string;
  scores: Record<string, number>; // 척도별 점수 (예: {"리더십": 4, "협업성": 5, ...})
}

// 사용자 응답 관리
export interface UserResponse200 {
  questionId: number;
  optionId: string;
  timestamp: Date;
  scores: Record<string, number>;
}

export interface QuestionnaireProgress200 {
  userId: string;
  startedAt: Date;
  lastUpdatedAt: Date;
  currentQuestionIndex: number;
  responses: UserResponse200[];
  isCompleted: boolean;
  totalQuestions: number;
}

// 결과 분석
export interface QuestionnaireResult200 {
  userId: string;
  completedAt: Date;
  categoryScores: Record<string, CategoryScore>; // 카테고리별 점수
  scaleScores: Record<string, number>; // 척도별 총 점수
  totalResponseTime: number; // 총 소요 시간 (초)
  insights: ResultInsight[];
  recommendations: string[];
}

export interface CategoryScore {
  category: string;
  scaleScores: Record<string, number>; // 해당 카테고리의 척도별 점수
  averageScore: number;
  totalQuestions: number;
  percentile?: number;
}

export interface ResultInsight {
  type: 'strength' | 'growth_area' | 'pattern' | 'recommendation';
  title: string;
  description: string;
  relatedScales: string[];
  score?: number;
}

// 진행률 저장/복원용
export interface QuestionnaireSaveData {
  userId: string;
  sessionId: string;
  currentQuestionIndex: number;
  responses: UserResponse200[];
  startedAt: Date;
  lastSavedAt: Date;
  categoryProgress: Record<string, number>; // 카테고리별 완료된 문항 수
  totalElapsedTime: number; // 총 경과 시간 (초)
}

// 게임화된 진행률 메시지
export interface ProgressMilestone {
  percentage: number;
  title: string;
  message: string;
  emoji: string;
  animation?: 'bounce' | 'pulse' | 'confetti';
}

export interface MotivationalMessage {
  type: 'encouragement' | 'achievement' | 'milestone' | 'celebration';
  title: string;
  message: string;
  icon: string;
  triggerAt: number; // 문항 번호 또는 진행률
}

// 성향 타입 정의
export type PersonalityType = 
  | '승부욕성취형' 
  | '관계중심공감형' 
  | '논리적분석형' 
  | '감성적직관형' 
  | '신중완벽형' 
  | '빠름효율덕후형' 
  | '균형형';

// 성향별 맞춤 메시지
export interface PersonalizedMessage {
  personalityType: PersonalityType;
  stage: 'early' | 'middle' | 'late';  // 초반/중반/후반
  questionRange: [number, number];     // 문항 범위
  message: string;
  intensity: 'mild' | 'strong' | 'intense'; // 메시지 강도
}

// 미니 인사이트
export interface MiniInsight {
  id: string;
  triggerAt: number;                   // 트리거될 문항 번호
  condition: 'any' | PersonalityType;  // 조건 (전체 또는 특정 성향)
  category: string;                    // 분석 카테고리
  insight: string;                     // 인사이트 내용
  scaleReference?: string;             // 참조하는 척도
  thresholdScore?: number;             // 임계 점수
  icon: string;                        // 표시 아이콘
}

// 테스트 및 개발용
export interface QuestionnaireTestMode {
  enabled: boolean;
  showScores: boolean; // 점수를 실시간으로 표시
  skipQuestions: number[]; // 건너뛸 문항 번호들
  fastMode: boolean; // 빠른 테스트 모드
  autoAnswer: boolean; // 자동 응답 (랜덤)
}