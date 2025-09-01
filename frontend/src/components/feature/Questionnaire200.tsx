/**
 * 200문항 심리검사 컴포넌트
 * 
 * 목적:
 * - personality-quest-200.json 파일을 읽어와서 200문항 심리검사 진행
 * - 기존 personalityQuest 시스템과는 별도로 구현 (추후 통합 예정)
 * 
 * 주요 기능:
 * - 200문항 순차 진행
 * - 진행률 표시 및 저장/복원
 * - 카테고리별 점수 실시간 계산
 * - 응답 결과 분석 및 인사이트 제공
 * 
 * 데이터 구조:
 * - JSON: 5개 카테고리 (직장생활, 인간관계, 감정조절, 스트레스갈등, 개인가치관, 자기인식)
 * - 카테고리별 5개 척도로 점수 산출
 * - A,B,C,D,E 5지선다 선택지
 * 
 * 사용 방법:
 * - <Questionnaire200 /> 컴포넌트를 렌더링
 * - onComplete 콜백으로 결과 수신
 * - testMode prop으로 개발/테스트 모드 활성화
 * 
 * 작성일: 2025-08-18
 * 담당자: Claude (EFT-AI-App 프로젝트)
 * 
 * TODO:
 * - [ ] 진행률 저장/복원 기능
 * - [ ] 결과 분석 알고리즘 고도화
 * - [ ] 접근성 개선 (키보드 네비게이션, 스크린 리더)
 * - [ ] 다국어 지원
 * - [ ] 기존 personalityQuest 시스템과 통합
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import type { 
  Questionnaire200, 
  Question, 
  UserResponse200, 
  QuestionnaireProgress200, 
  QuestionnaireResult200,
  QuestionnaireTestMode,
  QuestionnaireSaveData,
  ProgressMilestone,
  MotivationalMessage,
  PersonalityType,
  PersonalizedMessage,
  MiniInsight
} from '../../types/questionnaire200';

interface Questionnaire200Props {
  onComplete?: (result: QuestionnaireResult200) => void;
  onProgress?: (progress: QuestionnaireProgress200) => void;
  testMode?: QuestionnaireTestMode;
  userId?: string;
  className?: string;
}

// 게임화된 진행률 마일스톤 정의
const PROGRESS_MILESTONES: ProgressMilestone[] = [
  { percentage: 10, title: "첫 발견!", message: "나에 대한 첫 번째 단서를 발견했어요!", emoji: "🔍", animation: 'bounce' },
  { percentage: 25, title: "성격의 25% 발견!", message: "벌써 1/4이나 알아가고 있어요! 대단해요!", emoji: "⭐", animation: 'pulse' },
  { percentage: 40, title: "절반에 가까워졌어요!", message: "꾸준히 잘 하고 있어요. 계속 화이팅!", emoji: "💪", animation: 'bounce' },
  { percentage: 50, title: "반환점 돌파!", message: "와! 벌써 절반을 통과했어요! 남은 반도 화이팅!", emoji: "🎉", animation: 'confetti' },
  { percentage: 65, title: "2/3 완주!", message: "정말 대단해요! 조금만 더 힘내봐요!", emoji: "🚀", animation: 'pulse' },
  { percentage: 75, title: "3/4 달성!", message: "75% 완성! 거의 다 왔어요! 끝까지 화이팅!", emoji: "🏆", animation: 'bounce' },
  { percentage: 85, title: "막바지 스퍼트!", message: "이제 정말 얼마 안 남았어요! 마지막까지!", emoji: "⚡", animation: 'pulse' },
  { percentage: 95, title: "거의 완성!", message: "5%만 더! 곧 나만의 심리 프로필이 완성돼요!", emoji: "🎯", animation: 'bounce' }
];

// 일반 격려 메시지 (담백하게)
const ENCOURAGEMENT_MESSAGES: MotivationalMessage[] = [
  { type: 'encouragement', title: "", message: "차근차근 진행하고 있어요", icon: "😊", triggerAt: 20 },
  { type: 'encouragement', title: "", message: "꾸준히 잘하고 있습니다", icon: "👍", triggerAt: 50 },
  { type: 'encouragement', title: "", message: "중간 지점을 지나고 있어요", icon: "📍", triggerAt: 100 },
  { type: 'encouragement', title: "", message: "마무리가 가까워지고 있어요", icon: "🏁", triggerAt: 150 }
];

// 성향별 맞춤 메시지 (강력한 동기부여)
const PERSONALIZED_MESSAGES: PersonalizedMessage[] = [
  // 승부욕/성취지향형
  { personalityType: '승부욕성취형', stage: 'early', questionRange: [20, 40], message: "이 정도에서 포기하는 사람이 성공할 수 있을까요?", intensity: 'intense' },
  { personalityType: '승부욕성취형', stage: 'middle', questionRange: [80, 120], message: "지금까지 이긴 것들도 많은데, 겨우 설문지에서 질 건가요?", intensity: 'intense' },
  { personalityType: '승부욕성취형', stage: 'late', questionRange: [160, 180], message: "99%까지 왔는데 1%에서 멈추는 사람... 그런 사람이 되고 싶나요?", intensity: 'intense' },

  // 관계중심/공감형
  { personalityType: '관계중심공감형', stage: 'early', questionRange: [15, 35], message: "또 다른 사람 기분만 챙기고 계세요? 내 기분은 언제 챙길 건가요?", intensity: 'strong' },
  { personalityType: '관계중심공감형', stage: 'middle', questionRange: [70, 90], message: "다들 '괜찮다'고 하는데... 정말 괜찮으신가요? 솔직해져도 돼요", intensity: 'strong' },
  { personalityType: '관계중심공감형', stage: 'late', questionRange: [150, 170], message: "이제까지 남을 위해 살았다면, 마지막 40문항은 나를 위해 살아봐요", intensity: 'intense' },

  // 논리적/분석형
  { personalityType: '논리적분석형', stage: 'early', questionRange: [30, 50], message: "이 검사 하나로 앞으로 10년간 똑같은 실수 패턴을 피할 수 있어요", intensity: 'strong' },
  { personalityType: '논리적분석형', stage: 'middle', questionRange: [80, 110], message: "불완전한 데이터로 살아왔던 과거... 이제 정확한 나를 알아볼 시간이에요", intensity: 'strong' },
  { personalityType: '논리적분석형', stage: 'late', questionRange: [140, 160], message: "여기서 멈추면 평생 '만약에'만 생각하며 살 수도 있어요", intensity: 'intense' },

  // 감성적/직관형
  { personalityType: '감성적직관형', stage: 'early', questionRange: [25, 45], message: "마음 깊은 곳에 숨겨둔 진짜 감정... 무서워서 못 꺼내고 있나요?", intensity: 'strong' },
  { personalityType: '감성적직관형', stage: 'middle', questionRange: [100, 120], message: "이렇게 솔직해진 건 언제가 마지막이었나요? 계속 해봐요", intensity: 'strong' },
  { personalityType: '감성적직관형', stage: 'late', questionRange: [170, 190], message: "진짜 나를 만나는 순간이 바로 코앞이에요. 놓치지 마세요", intensity: 'intense' },

  // 신중/완벽형
  { personalityType: '신중완벽형', stage: 'early', questionRange: [40, 60], message: "이렇게 신중하게 접근하는 사람만이 진짜 완벽한 결과를 얻을 수 있어요", intensity: 'mild' },
  { personalityType: '신중완벽형', stage: 'middle', questionRange: [110, 130], message: "불완전한 채로 끝내는 건 당신 스타일이 아니죠?", intensity: 'strong' },
  { personalityType: '신중완벽형', stage: 'late', questionRange: [170, 190], message: "99% 완벽한 건 완벽한 게 아니에요. 진짜 100%를 봐야죠", intensity: 'intense' },

  // 빠름/효율형 + 덕후형
  { personalityType: '빠름효율덕후형', stage: 'early', questionRange: [10, 25], message: "이 속도와 집중력... 덕질할 때 그 에너지죠? 나한테도 써봐요!", intensity: 'mild' },
  { personalityType: '빠름효율덕후형', stage: 'middle', questionRange: [55, 75], message: "최애 캐릭터 분석하던 그 꼼꼼함으로 나도 완전분석해봐요!", intensity: 'strong' },
  { personalityType: '빠름효율덕후형', stage: 'late', questionRange: [110, 130], message: "완벽한 덕후라면 자기분석도 완벽하게! 마지막 스퍼트!", intensity: 'intense' }
];

// 중간 미니 인사이트 (진행 중 분석 결과 공유)
const MINI_INSIGHTS: MiniInsight[] = [
  // 관계 성향 관련
  { 
    id: 'relationship_focus', 
    triggerAt: 30, 
    condition: 'any', 
    category: '인간관계', 
    insight: '지금까지 보면 당신은 관계를 중시하는 성향이 보여요', 
    scaleReference: '관계지향', 
    thresholdScore: 3.5, 
    icon: '🤝' 
  },
  
  // 감정 처리 방식
  { 
    id: 'emotion_expression', 
    triggerAt: 45, 
    condition: 'any', 
    category: '감정조절', 
    insight: '감정 표현에 신중한 편이네요. 속마음을 표현하는 것을 어려워하시나요?', 
    scaleReference: '감정표현', 
    thresholdScore: 3.0, 
    icon: '💭' 
  },
  
  // 업무 스타일
  { 
    id: 'work_style', 
    triggerAt: 60, 
    condition: 'any', 
    category: '직장생활', 
    insight: '업무에 있어서는 체계적이고 효율적인 접근을 선호하시는군요', 
    scaleReference: '업무지향성', 
    thresholdScore: 3.8, 
    icon: '💼' 
  },
  
  // 스트레스 대처
  { 
    id: 'stress_handling', 
    triggerAt: 80, 
    condition: 'any', 
    category: '스트레스갈등', 
    insight: '스트레스 상황에서 논리적으로 접근하는 스타일이네요', 
    scaleReference: '문제해결', 
    thresholdScore: 3.5, 
    icon: '🧠' 
  },
  
  // 성향별 특화 인사이트
  { 
    id: 'achievement_insight', 
    triggerAt: 90, 
    condition: '승부욕성취형', 
    category: '개인가치관', 
    insight: '목표 달성에 대한 강한 의지가 느껴져요. 완벽주의 성향도 있으시군요', 
    icon: '🎯' 
  },
  
  { 
    id: 'empathy_insight', 
    triggerAt: 90, 
    condition: '관계중심공감형', 
    category: '인간관계', 
    insight: '다른 사람의 감정을 잘 이해하고 배려하는 마음이 크시네요', 
    icon: '❤️' 
  },
  
  { 
    id: 'logic_insight', 
    triggerAt: 90, 
    condition: '논리적분석형', 
    category: '개인성향', 
    insight: '체계적이고 분석적인 사고를 하시는군요. 데이터 기반 판단을 선호하시나요?', 
    icon: '📊' 
  },
  
  { 
    id: 'intuition_insight', 
    triggerAt: 90, 
    condition: '감성적직관형', 
    category: '감정조절', 
    insight: '직감과 감정에 의존해서 판단하는 경우가 많으시네요', 
    icon: '✨' 
  },
  
  // 중후반 종합 인사이트
  { 
    id: 'stability_preference', 
    triggerAt: 120, 
    condition: 'any', 
    category: '개인가치관', 
    insight: '안정감을 추구하는 성향이 강하게 나타나고 있어요', 
    scaleReference: '안정추구', 
    thresholdScore: 4.0, 
    icon: '🛡️' 
  },
  
  { 
    id: 'growth_mindset', 
    triggerAt: 140, 
    condition: 'any', 
    category: '개인가치관', 
    insight: '새로운 도전과 성장을 중요하게 생각하시는군요', 
    scaleReference: '성장지향', 
    thresholdScore: 3.8, 
    icon: '🌱' 
  },
  
  { 
    id: 'leadership_potential', 
    triggerAt: 160, 
    condition: 'any', 
    category: '직장생활', 
    insight: '리더십 역량이 보이네요. 팀을 이끄는 역할을 자주 맡으시나요?', 
    scaleReference: '리더십', 
    thresholdScore: 3.7, 
    icon: '👑' 
  },
  
  // 마지막 단계 특별 인사이트
  { 
    id: 'self_awareness', 
    triggerAt: 180, 
    condition: 'any', 
    category: '자기인식', 
    insight: '자신에 대해 깊이 이해하려는 의지가 강하시네요. 거의 완성이에요!', 
    icon: '🔮' 
  }
];

export const Questionnaire200: React.FC<Questionnaire200Props> = ({
  onComplete,
  onProgress,
  testMode = { enabled: false, showScores: false, skipQuestions: [], fastMode: false, autoAnswer: false },
  userId = 'test-user',
  className = ''
}) => {
  // 상태 관리
  const [questionnaire, setQuestionnaire] = useState<Questionnaire200 | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<UserResponse200[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(new Date());
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [hasRestoredData, setHasRestoredData] = useState(false);
  const [responseTimings, setResponseTimings] = useState<number[]>([]);
  const [currentPersonalityType, setCurrentPersonalityType] = useState<PersonalityType>('균형형');
  const [displayedMessages, setDisplayedMessages] = useState<Set<string>>(new Set());
  
  // JSON 파일 로드
  useEffect(() => {
    const loadQuestionnaire = async () => {
      try {
        setIsLoading(true);
        // public 폴더에 있는 JSON 파일 로드 (개발 중에는 assets/data 경로)
        const response = await fetch('/assets/data/personality-quest-200.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: Questionnaire200 = await response.json();
        setQuestionnaire(data);
        setError(null);
      } catch (err) {
        console.error('설문지 로드 실패:', err);
        setError('설문지를 불러오는데 실패했습니다. 잠시 후 다시 시도해주세요.');
      } finally {
        setIsLoading(false);
      }
    };

    loadQuestionnaire();
  }, []);

  // 초기 로드 시 저장된 진행률 복원 (함수 정의 후에 실행)

  // 저장/복원 함수들
  const getSaveKey = useCallback(() => `questionnaire200_${userId}`, [userId]);

  const saveProgress = useCallback(() => {
    if (!questionnaire) return;

    const categoryProgress: Record<string, number> = {};
    Object.keys(questionnaire.questionnaire.categories).forEach(category => {
      categoryProgress[category] = responses.filter(r => {
        const q = questionnaire.questions.find(quest => quest.id === r.questionId);
        return q?.category === category;
      }).length;
    });

    const saveData: QuestionnaireSaveData = {
      userId,
      sessionId,
      currentQuestionIndex,
      responses,
      startedAt,
      lastSavedAt: new Date(),
      categoryProgress,
      totalElapsedTime: Math.floor((Date.now() - startedAt.getTime()) / 1000)
    };

    try {
      localStorage.setItem(getSaveKey(), JSON.stringify(saveData));
      console.log('✅ 진행률 저장 완료:', { 
        questionIndex: currentQuestionIndex, 
        totalResponses: responses.length 
      });
    } catch (error) {
      console.error('❌ 진행률 저장 실패:', error);
    }
  }, [questionnaire, userId, sessionId, currentQuestionIndex, responses, startedAt, getSaveKey]);

  const loadProgress = useCallback(() => {
    try {
      const savedData = localStorage.getItem(getSaveKey());
      if (savedData) {
        const parseData: QuestionnaireSaveData = JSON.parse(savedData);
        
        // 세션이 너무 오래되었으면 로드하지 않음 (24시간)
        const hoursSinceLastSave = (Date.now() - new Date(parseData.lastSavedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSave > 24) {
          console.log('⏰ 저장된 데이터가 너무 오래되어 삭제합니다.');
          clearSavedProgress();
          return null;
        }

        console.log('📂 저장된 진행률 발견:', {
          questionIndex: parseData.currentQuestionIndex,
          totalResponses: parseData.responses.length,
          lastSaved: parseData.lastSavedAt
        });
        
        return parseData;
      }
    } catch (error) {
      console.error('❌ 진행률 로드 실패:', error);
      clearSavedProgress();
    }
    return null;
  }, [getSaveKey]);

  const clearSavedProgress = useCallback(() => {
    try {
      localStorage.removeItem(getSaveKey());
      console.log('🗑️ 저장된 진행률 삭제 완료');
    } catch (error) {
      console.error('❌ 저장된 진행률 삭제 실패:', error);
    }
  }, [getSaveKey]);

  const restoreProgress = useCallback((saveData: QuestionnaireSaveData) => {
    setCurrentQuestionIndex(saveData.currentQuestionIndex);
    setResponses(saveData.responses.map(r => ({
      ...r,
      timestamp: new Date(r.timestamp)
    })));
    setHasRestoredData(true);
    console.log('♻️ 진행률 복원 완료:', saveData);
  }, []);

  // 초기 로드 시 저장된 진행률 복원
  useEffect(() => {
    if (questionnaire && !hasRestoredData) {
      const savedProgress = loadProgress();
      if (savedProgress) {
        restoreProgress(savedProgress);
      }
    }
  }, [questionnaire, hasRestoredData, loadProgress, restoreProgress]);

  // 성향 판단 로직
  const analyzePersonalityType = useCallback((currentResponses: UserResponse200[], timings: number[]) => {
    if (currentResponses.length < 10 || !questionnaire) return '균형형';

    // 점수 집계
    const scaleScores: Record<string, number> = {};
    const scaleCounts: Record<string, number> = {};

    // 모든 척도 초기화
    Object.values(questionnaire.questionnaire.categories).forEach(category => {
      category.scales.forEach(scale => {
        scaleScores[scale] = 0;
        scaleCounts[scale] = 0;
      });
    });

    // 응답별 점수 집계
    currentResponses.forEach(response => {
      Object.entries(response.scores).forEach(([scale, score]) => {
        if (scaleScores[scale] !== undefined) {
          scaleScores[scale] += score;
          scaleCounts[scale] += 1;
        }
      });
    });

    // 평균 점수 계산
    const avgScores: Record<string, number> = {};
    Object.keys(scaleScores).forEach(scale => {
      avgScores[scale] = scaleCounts[scale] > 0 ? scaleScores[scale] / scaleCounts[scale] : 0;
    });

    // 응답 패턴 분석
    const avgResponseTime = timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 5000;
    const responseVariance = timings.length > 1 ? 
      Math.sqrt(timings.reduce((sum, time) => sum + Math.pow(time - avgResponseTime, 2), 0) / timings.length) / 1000 : 0;

    // 성향 판단 로직
    // 1. 빠름/효율형 + 덕후형 (응답시간 기준)
    if (avgResponseTime < 3000 && responseVariance < 0.7) {
      return '빠름효율덕후형';
    }

    // 2. 성취지향형 (점수 기준)
    const 성취지향 = avgScores['성취지향'] || 0;
    const 관계지향 = avgScores['관계지향'] || 0;
    const 업무지향성 = avgScores['업무지향성'] || 0;

    if (성취지향 > 관계지향 + 0.5 && 업무지향성 > 3.5) {
      return '승부욕성취형';
    }

    // 3. 관계중심형 (점수 기준)
    const 공감능력 = avgScores['공감능력'] || 0;
    const 협력성 = avgScores['협력성'] || 0;

    if (관계지향 > 3.5 && (공감능력 > 3.5 || 협력성 > 3.5)) {
      return '관계중심공감형';
    }

    // 4. 논리분석형 (점수 기준)
    const 문제해결 = avgScores['문제해결'] || 0;
    const 자기조절 = avgScores['자기조절'] || 0;

    if (문제해결 > 3.5 && 자기조절 > 3.5) {
      return '논리적분석형';
    }

    // 5. 감성직관형 (점수 기준)
    const 감정표현 = avgScores['감정표현'] || 0;
    const 감정인식 = avgScores['감정인식'] || 0;

    if ((감정표현 > 3.5 || 감정인식 > 3.5) && 관계지향 > 3.0) {
      return '감성적직관형';
    }

    // 6. 신중완벽형 (응답패턴 기준)
    const 안정추구 = avgScores['안정추구'] || 0;

    if (안정추구 > 3.5 && responseVariance < 0.5 && avgResponseTime > 4000) {
      return '신중완벽형';
    }

    return '균형형';
  }, [questionnaire]);

  // 미니 인사이트 분석
  const analyzeInsight = useCallback((insight: MiniInsight, currentResponses: UserResponse200[]) => {
    // 조건 확인: 성향별 조건
    if (insight.condition !== 'any' && insight.condition !== currentPersonalityType) {
      return false;
    }

    // 점수 기반 조건 확인
    if (insight.scaleReference && insight.thresholdScore && questionnaire) {
      let scaleScore = 0;
      let scaleCount = 0;

      currentResponses.forEach(response => {
        if (response.scores[insight.scaleReference!]) {
          scaleScore += response.scores[insight.scaleReference!];
          scaleCount += 1;
        }
      });

      const avgScore = scaleCount > 0 ? scaleScore / scaleCount : 0;
      
      // 감정표현 척도는 낮은 점수일 때 트리거 (역방향)
      if (insight.scaleReference === '감정표현') {
        return avgScore <= insight.thresholdScore;
      }
      
      return avgScore >= insight.thresholdScore;
    }

    // 점수 조건이 없으면 성향 조건만으로 판단
    return true;
  }, [questionnaire, currentPersonalityType]);

  // 표시할 메시지 결정
  const getCurrentMessage = useCallback(() => {
    const progress = questionnaire ? Math.round((currentQuestionIndex / questionnaire.questionnaire.totalQuestions) * 100) : 0;

    // 1. 마일스톤 메시지 확인
    const milestone = PROGRESS_MILESTONES.find(m => 
      progress >= m.percentage && 
      !displayedMessages.has(`milestone_${m.percentage}`)
    );
    
    if (milestone) {
      setDisplayedMessages(prev => new Set(prev).add(`milestone_${milestone.percentage}`));
      return {
        type: 'milestone' as const,
        title: milestone.title,
        message: milestone.message,
        icon: milestone.emoji,
        animation: milestone.animation
      };
    }

    // 2. 미니 인사이트 확인 (우선순위 높음)
    const availableInsight = MINI_INSIGHTS.find(insight => 
      currentQuestionIndex >= insight.triggerAt &&
      !displayedMessages.has(`insight_${insight.id}`) &&
      analyzeInsight(insight, responses)
    );

    if (availableInsight) {
      setDisplayedMessages(prev => new Set(prev).add(`insight_${availableInsight.id}`));
      return {
        type: 'insight' as const,
        title: `💡 ${availableInsight.category} 분석`,
        message: availableInsight.insight,
        icon: availableInsight.icon,
        category: availableInsight.category
      };
    }

    // 3. 성향별 맞춤 메시지 확인
    const personalizedMsg = PERSONALIZED_MESSAGES.find(msg => 
      msg.personalityType === currentPersonalityType &&
      currentQuestionIndex >= msg.questionRange[0] &&
      currentQuestionIndex <= msg.questionRange[1] &&
      !displayedMessages.has(`personalized_${msg.personalityType}_${msg.stage}`)
    );

    if (personalizedMsg) {
      setDisplayedMessages(prev => new Set(prev).add(`personalized_${personalizedMsg.personalityType}_${personalizedMsg.stage}`));
      return {
        type: 'personalized' as const,
        title: '',
        message: personalizedMsg.message,
        icon: personalizedMsg.intensity === 'intense' ? '🔥' : personalizedMsg.intensity === 'strong' ? '💪' : '😊',
        intensity: personalizedMsg.intensity
      };
    }

    // 4. 일반 격려 메시지 확인
    const encouragement = ENCOURAGEMENT_MESSAGES.find(msg => 
      currentQuestionIndex === msg.triggerAt &&
      !displayedMessages.has(`encouragement_${msg.triggerAt}`)
    );

    if (encouragement) {
      setDisplayedMessages(prev => new Set(prev).add(`encouragement_${encouragement.triggerAt}`));
      return {
        type: 'encouragement' as const,
        title: encouragement.title,
        message: encouragement.message,
        icon: encouragement.icon
      };
    }

    return null;
  }, [questionnaire, currentQuestionIndex, currentPersonalityType, displayedMessages, responses, analyzeInsight]);

  // 현재 문항
  const currentQuestion = useMemo(() => {
    if (!questionnaire || !questionnaire.questions) return null;
    return questionnaire.questions[currentQuestionIndex] || null;
  }, [questionnaire, currentQuestionIndex]);

  // 진행률 계산
  const progress = useMemo(() => {
    if (!questionnaire) return 0;
    return Math.round((currentQuestionIndex / questionnaire.questionnaire.totalQuestions) * 100);
  }, [currentQuestionIndex, questionnaire]);

  // 응답 시간 추적용 상태
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());

  // 문항 변경 시 시작 시간 초기화
  useEffect(() => {
    setQuestionStartTime(Date.now());
  }, [currentQuestionIndex]);

  // 응답 처리
  const handleResponse = useCallback((optionId: string) => {
    if (!currentQuestion) return;

    const selectedOption = currentQuestion.options.find(opt => opt.id === optionId);
    if (!selectedOption) return;

    // 응답 시간 기록
    const responseTime = Date.now() - questionStartTime;
    const updatedTimings = [...responseTimings, responseTime];
    setResponseTimings(updatedTimings);

    const newResponse: UserResponse200 = {
      questionId: currentQuestion.id,
      optionId,
      timestamp: new Date(),
      scores: selectedOption.scores
    };

    const updatedResponses = [...responses, newResponse];
    setResponses(updatedResponses);

    // 성향 분석 (10문항 이상부터)
    if (updatedResponses.length >= 10) {
      const newPersonalityType = analyzePersonalityType(updatedResponses, updatedTimings);
      if (newPersonalityType !== currentPersonalityType) {
        setCurrentPersonalityType(newPersonalityType);
        console.log('🧠 성향 업데이트:', newPersonalityType);
      }
    }

    // 진행률 콜백
    if (onProgress && questionnaire) {
      const progressData: QuestionnaireProgress200 = {
        userId,
        startedAt,
        lastUpdatedAt: new Date(),
        currentQuestionIndex: currentQuestionIndex + 1,
        responses: updatedResponses,
        isCompleted: currentQuestionIndex + 1 >= questionnaire.questionnaire.totalQuestions,
        totalQuestions: questionnaire.questionnaire.totalQuestions
      };
      onProgress(progressData);
    }

    // 다음 문항으로 이동 또는 완료 처리
    if (questionnaire && currentQuestionIndex + 1 >= questionnaire.questionnaire.totalQuestions) {
      // 완료 시 저장된 진행률 삭제
      clearSavedProgress();
      handleComplete(updatedResponses);
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
      // 진행률 자동 저장 (다음 문항으로 이동 후)
      setTimeout(() => saveProgress(), 100);
    }
  }, [currentQuestion, responses, responseTimings, questionStartTime, currentQuestionIndex, questionnaire, userId, startedAt, onProgress, clearSavedProgress, saveProgress, analyzePersonalityType, currentPersonalityType]);

  // 설문 완료 처리
  const handleComplete = useCallback((finalResponses: UserResponse200[]) => {
    if (!questionnaire || !onComplete) return;

    // 점수 집계
    const scaleScores: Record<string, number> = {};
    const categoryScores: Record<string, any> = {};

    // 모든 척도 초기화
    Object.values(questionnaire.questionnaire.categories).forEach(category => {
      category.scales.forEach(scale => {
        scaleScores[scale] = 0;
      });
    });

    // 카테고리별 점수 집계
    Object.keys(questionnaire.questionnaire.categories).forEach(categoryName => {
      categoryScores[categoryName] = {
        category: categoryName,
        scaleScores: {},
        averageScore: 0,
        totalQuestions: 0
      };
      
      questionnaire.questionnaire.categories[categoryName].scales.forEach(scale => {
        categoryScores[categoryName].scaleScores[scale] = 0;
      });
    });

    // 응답별 점수 합산
    finalResponses.forEach(response => {
      const question = questionnaire.questions.find(q => q.id === response.questionId);
      if (question) {
        Object.entries(response.scores).forEach(([scale, score]) => {
          scaleScores[scale] = (scaleScores[scale] || 0) + score;
          if (categoryScores[question.category]) {
            categoryScores[question.category].scaleScores[scale] = 
              (categoryScores[question.category].scaleScores[scale] || 0) + score;
            categoryScores[question.category].totalQuestions++;
          }
        });
      }
    });

    // 카테고리별 평균 계산
    Object.keys(categoryScores).forEach(categoryName => {
      const category = categoryScores[categoryName];
      const totalScore = Object.values(category.scaleScores).reduce((sum: number, score: any) => sum + score, 0);
      category.averageScore = category.totalQuestions > 0 ? totalScore / (category.totalQuestions * 5) : 0;
    });

    // 결과 생성
    const result: QuestionnaireResult200 = {
      userId,
      completedAt: new Date(),
      categoryScores,
      scaleScores,
      totalResponseTime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      insights: [], // TODO: 인사이트 생성 로직 구현
      recommendations: [] // TODO: 추천 생성 로직 구현
    };

    onComplete(result);
  }, [questionnaire, onComplete, userId, startedAt]);

  // 테스트 모드: 자동 응답
  useEffect(() => {
    if (testMode.autoAnswer && currentQuestion) {
      const randomOption = currentQuestion.options[Math.floor(Math.random() * currentQuestion.options.length)];
      setTimeout(() => handleResponse(randomOption.id), 1000);
    }
  }, [testMode.autoAnswer, currentQuestion, handleResponse]);

  // 로딩 상태
  if (isLoading) {
    return (
      <div className={`flex items-center justify-center min-h-64 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">설문지를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (error || !questionnaire) {
    return (
      <div className={`text-center p-6 ${className}`}>
        <div className="text-red-500 mb-4">⚠️ 오류 발생</div>
        <p className="text-gray-600 mb-4">{error || '설문지를 불러올 수 없습니다.'}</p>
        <Button onClick={() => window.location.reload()}>
          다시 시도
        </Button>
      </div>
    );
  }

  // 설문 진행 화면
  return (
    <div className={`max-w-4xl mx-auto p-4 ${className}`}>
      {/* 헤더: 제목 및 진행률 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {questionnaire.questionnaire.title}
        </h1>
        <p className="text-gray-600 mb-4">
          {questionnaire.questionnaire.description}
        </p>
        
        {/* 진행률 바 */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-sm text-gray-500">
          <span>{currentQuestionIndex + 1} / {questionnaire.questionnaire.totalQuestions}</span>
          <div className="flex items-center space-x-2">
            {hasRestoredData && (
              <span className="text-green-600 text-xs flex items-center">
                ♻️ 이어하기
              </span>
            )}
            <span className="text-blue-600 text-xs flex items-center">
              💾 자동저장
            </span>
            <span>{progress}% 완료</span>
          </div>
        </div>

        {/* 동기부여 메시지 표시 영역 */}
        {(() => {
          const message = getCurrentMessage();
          if (!message) return null;

          const getMessageStyle = (type: string, intensity?: string) => {
            if (type === 'milestone') {
              return 'bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-blue-500 text-blue-800';
            }
            if (type === 'insight') {
              return 'bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-purple-500 text-purple-800';
            }
            if (type === 'personalized') {
              if (intensity === 'intense') return 'bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 text-red-800';
              if (intensity === 'strong') return 'bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-500 text-yellow-800';
              return 'bg-gradient-to-r from-green-50 to-blue-50 border-l-4 border-green-500 text-green-800';
            }
            return 'bg-gray-50 border-l-4 border-gray-400 text-gray-700';
          };

          const getAnimation = (animation?: string) => {
            if (animation === 'bounce') return 'animate-bounce';
            if (animation === 'pulse') return 'animate-pulse';
            return '';
          };

          return (
            <div className={`mt-4 p-3 rounded-lg transition-all duration-500 ${getMessageStyle(message.type, message.intensity)}`}>
              <div className="flex items-center space-x-2">
                <span className={`text-lg ${getAnimation(message.animation)}`}>
                  {message.icon}
                </span>
                <div>
                  {message.title && (
                    <div className="font-semibold text-sm mb-1">{message.title}</div>
                  )}
                  <div className="text-sm">{message.message}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 현재 성향 표시 (테스트 모드일 때만) */}
        {testMode.enabled && currentPersonalityType !== '균형형' && (
          <div className="mt-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-xs text-purple-700">
              🧠 감지된 성향: <span className="font-semibold">{currentPersonalityType}</span>
            </div>
          </div>
        )}
      </div>

      {/* 현재 문항 */}
      {currentQuestion && (
        <Card className="p-6">
          <div className="mb-4">
            <div className="text-sm text-blue-600 font-medium mb-2">
              {currentQuestion.category}
            </div>
            <h2 className="text-xl font-semibold text-gray-800 leading-relaxed">
              {currentQuestion.question}
            </h2>
          </div>

          {/* 선택지 */}
          <div className="space-y-3">
            {currentQuestion.options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleResponse(option.id)}
                className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <div className="flex items-start">
                  <span className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-medium mr-3">
                    {option.id}
                  </span>
                  <span className="text-gray-800 flex-1">{option.text}</span>
                </div>
                
                {/* 테스트 모드: 점수 표시 */}
                {testMode.showScores && (
                  <div className="mt-2 ml-11 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    {Object.entries(option.scores).map(([scale, score]) => (
                      <span key={scale} className="inline-block mr-3">
                        {scale}: {score}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* 테스트 모드 정보 */}
          {testMode.enabled && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="text-xs text-yellow-800">
                🧪 테스트 모드 활성화 
                {testMode.autoAnswer && ' | 자동 응답 중...'}
                {testMode.fastMode && ' | 빠른 모드'}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default Questionnaire200;