// 성향분석 퀘스트 게이미피케이션 시스템 타입 정의

export interface PersonalityQuest {
  // 기본 구조
  totalQuestions: number;
  questionsPerStage: number;
  stages: QuestStage[];
  
  // 게이미피케이션 요소
  gamification: GameConfig;
  
  // 저장/복원 기능
  saveSystem: SaveSystemConfig;
}

export interface QuestStage {
  stageId: number;
  title: string;
  description: string;
  questions: QuestionItem[];
  
  // 단계별 리워드
  completionReward: {
    title: string;
    message: string;
    badge?: string;
    insight?: string;
  };
}

export interface QuestionItem {
  id: string;
  questionText: string;
  options: ResponseOption[];
  domain: PersonalityDomain;
  subDomain?: string;
}

export interface ResponseOption {
  id: string;
  text: string;
  scores: {
    [key in PersonalityDomain]?: number;
  };
}

export type PersonalityDomain = 
  | 'openness'
  | 'conscientiousness' 
  | 'extraversion'
  | 'agreeableness'
  | 'neuroticism'
  | 'secure_attachment'
  | 'anxious_attachment'
  | 'avoidant_attachment'
  | 'disorganized_attachment'
  | 'problem_focused_coping'
  | 'emotion_focused_coping'
  | 'avoidant_coping'
  | 'meaning_making_coping'
  | 'social_support_coping'
  | 'emotion_recognition'
  | 'emotion_expression'
  | 'emotion_regulation'
  | 'emotion_utilization'
  | 'communication_style'
  | 'conflict_resolution'
  | 'boundary_setting'
  | 'intimacy_formation'
  | 'adversity_recovery'
  | 'adaptability'
  | 'growth_mindset'
  | 'self_efficacy'
  | 'personal_values'
  | 'social_values'
  | 'spiritual_values';

// 게이미피케이션 설정
export interface GameConfig {
  // 진행률 표시 방식
  progressDisplay: {
    type: 'percentage' | 'stage_based' | 'discovery_based';
    messages: ProgressMessage[];
  };
  
  // 중간 인사이트
  miniInsights: {
    triggers: InsightTrigger[];
    messages: MiniInsightMessage[];
  };
  
  // 격려 메시지 시스템
  encouragementSystem: {
    commonMessages: EncouragementMessage[];
    personalizedMessages: PersonalizedMessageConfig[];
  };
  
  // 소요 시간 안내
  timeEstimation: {
    totalMinutes: number;
    perStageMinutes: number;
    showBreakSuggestions: boolean;
  };
}

export interface ProgressMessage {
  threshold: number; // 진행률 %
  message: string;
  emoji?: string;
  animationType?: 'celebration' | 'progress' | 'achievement';
}

export interface InsightTrigger {
  stageId: number;
  condition: string; // 특정 응답 패턴
  insightType: 'personality_hint' | 'strength_discovery' | 'pattern_notice';
}

export interface MiniInsightMessage {
  id: string;
  trigger: string;
  title: string;
  content: string;
  icon?: string;
}

export interface EncouragementMessage {
  id: string;
  stage: number;
  message: string;
  tone: 'supportive' | 'motivational' | 'playful' | 'inspiring';
}

export interface PersonalizedMessageConfig {
  personalityPattern: string; // 감지된 성향 패턴
  messages: string[];
  examples: string[];
}

// 저장 시스템
export interface SaveSystemConfig {
  autoSaveInterval: number; // 초 단위
  savePoints: number[]; // 저장이 되는 문항 번호들
  resumeOptions: ResumeOption[];
}

export interface ResumeOption {
  stageId: number;
  title: string;
  description: string;
}

// 사용자 진행 상태
export interface UserQuestProgress {
  userId: string;
  startedAt: Date;
  lastUpdatedAt: Date;
  currentStage: number;
  currentQuestionIndex: number;
  
  // 응답 기록
  responses: Record<string, string>; // questionId -> optionId
  
  // 임시 점수 (중간 인사이트용)
  temporaryScores: Record<PersonalityDomain, number>;
  
  // 달성한 마일스톤
  achievedMilestones: string[];
  
  // 받은 인사이트
  receivedInsights: string[];
}

// 결과 분석
export interface QuestResult {
  userId: string;
  completedAt: Date;
  
  // 7개 영역별 점수
  domainScores: Record<PersonalityDomain, number>;
  
  // 상위 3개 강점
  topStrengths: PersonalityStrength[];
  
  // 성장 영역
  growthAreas: PersonalityGrowthArea[];
  
  // EFT 맞춤 추천
  eftRecommendations: EFTRecommendation[];
}

export interface PersonalityStrength {
  domain: PersonalityDomain;
  score: number;
  description: string;
  realLifeExamples: string[];
}

export interface PersonalityGrowthArea {
  domain: PersonalityDomain;
  score: number;
  description: string;
  improvementSuggestions: string[];
}

export interface EFTRecommendation {
  technique: string;
  description: string;
  tappingPoints: string[];
  affirmations: string[];
  frequency: string;
  expectedOutcome: string;
}