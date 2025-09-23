// 중간 미니 인사이트 제공 시스템

export interface MiniInsight {
  trigger: number; // 몇 번째 문항에서 트리거되는지
  title: string;
  content: string;
  icon: string;
  category: 'personality' | 'behavior' | 'strength' | 'pattern';
}

export interface ResponseAnalysis {
  responses: Record<string, string>;
  patterns: {
    cautious: number; // 신중함
    optimistic: number; // 낙관적
    social: number; // 사교적
    organized: number; // 체계적
    emotional: number; // 감정적
    practical: number; // 실용적
    creative: number; // 창의적
    competitive: number; // 경쟁적
  };
}

export class MiniInsightSystem {
  private insightTriggers: number[] = [20, 50, 100, 150];
  private deliveredInsights: Set<number> = new Set();

  // 응답 패턴 분석
  analyzeResponses(responses: Record<string, string>, currentIndex: number): ResponseAnalysis {
    const patterns = {
      cautious: 0,
      optimistic: 0, 
      social: 0,
      organized: 0,
      emotional: 0,
      practical: 0,
      creative: 0,
      competitive: 0
    };

    // 실제로는 질문별 옵션 매핑이 필요하지만, 
    // 여기서는 간단한 패턴 분석 예시
    const responseCount = Object.keys(responses).length;
    
    // 응답 패턴 기반 점수 계산 (예시)
    Object.values(responses).forEach((optionId, index) => {
      // optionId 기반으로 각 성향 점수 증가
      // 실제로는 질문-옵션 매핑 테이블 필요
      const optionNum = parseInt(optionId.split('_')[1] || '3');
      
      if (optionNum <= 2) {
        patterns.cautious += 0.1;
        patterns.practical += 0.05;
      } else if (optionNum >= 4) {
        patterns.optimistic += 0.1;
        patterns.social += 0.05;
      }
      
      if (optionNum === 1 || optionNum === 5) {
        patterns.emotional += 0.1;
      } else {
        patterns.organized += 0.05;
      }
    });

    return { responses, patterns };
  }

  // 미니 인사이트 생성
  generateInsight(analysis: ResponseAnalysis, questionIndex: number): MiniInsight | null {
    if (!this.insightTriggers.includes(questionIndex) || 
        this.deliveredInsights.has(questionIndex)) {
      return null;
    }

    const { patterns } = analysis;
    let insight: MiniInsight;

    // 가장 높은 점수의 패턴 찾기
    const dominantTrait = Object.entries(patterns)
      .sort(([,a], [,b]) => b - a)[0];
    
    const [trait, score] = dominantTrait;

    // 질문 단계별 인사이트 생성
    if (questionIndex === 20) {
      insight = this.getEarlyInsight(trait, score);
    } else if (questionIndex === 50) {
      insight = this.getMidInsight(trait, score);
    } else if (questionIndex === 100) {
      insight = this.getHalfwayInsight(trait, score);
    } else if (questionIndex === 150) {
      insight = this.getLateInsight(trait, score);
    } else {
      return null;
    }

    this.deliveredInsights.add(questionIndex);
    return insight;
  }

  private getEarlyInsight(trait: string, score: number): MiniInsight {
    const insights = {
      cautious: {
        title: "신중한 성향 감지",
        content: "지금까지의 답변을 보면, 결정을 내리기 전에 충분히 고민하는 편이네요.",
        icon: "🤔"
      },
      optimistic: {
        title: "긍정적 마인드 발견", 
        content: "어려운 상황에서도 밝은 면을 찾으려는 성향이 보여요.",
        icon: "☀️"
      },
      social: {
        title: "사교적 면모 확인",
        content: "사람들과의 관계를 중요하게 생각하는 모습이 드러나네요.",
        icon: "👥"
      },
      organized: {
        title: "체계적 접근법 인식",
        content: "일을 순서대로 정리해서 처리하는 성향이 엿보여요.",
        icon: "📋"
      },
      emotional: {
        title: "감정 표현력 관찰",
        content: "자신의 감정을 솔직하게 표현하는 편인 것 같아요.",
        icon: "❤️"
      },
      practical: {
        title: "실용적 사고 패턴",
        content: "현실적이고 실용적인 선택을 선호하는 경향이 있네요.",
        icon: "⚡"
      },
      creative: {
        title: "창의적 면모 포착",
        content: "새로운 아이디어나 방법을 시도하는 것을 좋아하는군요.",
        icon: "🎨"
      },
      competitive: {
        title: "성취 지향성 확인",
        content: "목표를 설정하고 달성하려는 의지가 강해 보여요.",
        icon: "🏆"
      }
    };

    return {
      ...insights[trait],
      trigger: 20,
      category: 'personality'
    };
  }

  private getMidInsight(trait: string, score: number): MiniInsight {
    const insights = {
      cautious: {
        title: "심사숙고하는 스타일",
        content: "중요한 결정일수록 더 신중하게 접근하는 패턴이 일관되네요.",
        icon: "🧭"
      },
      optimistic: {
        title: "낙관주의자의 면모",
        content: "어떤 상황이든 희망적으로 바라보는 시각이 인상적이에요.",
        icon: "🌈"
      },
      social: {
        title: "관계 중심적 사고",
        content: "결정을 내릴 때 다른 사람들과의 관계를 많이 고려하시는군요.",
        icon: "🤝"
      },
      organized: {
        title: "계획적 성격 확인",
        content: "체계적으로 정리하고 단계별로 접근하는 방식이 뚜렷해요.",
        icon: "📊"
      },
      emotional: {
        title: "감성적 판단 경향",
        content: "논리보다는 직감과 감정을 믿고 따르는 편이네요.",
        icon: "💫"
      },
      practical: {
        title: "현실주의자의 모습",
        content: "이상보다는 현실 가능한 선택을 우선시하는 성향이 강해요.",
        icon: "🎯"
      },
      creative: {
        title: "독창성 추구 성향",
        content: "남들과 다른 방법을 시도하는 것을 즐기는 모습이 보여요.",
        icon: "💡"
      },
      competitive: {
        title: "도전 정신 강화",
        content: "어려울수록 더 도전하고 싶어하는 성격이 드러나고 있어요.",
        icon: "🔥"
      }
    };

    return {
      ...insights[trait],
      trigger: 50,
      category: 'behavior'
    };
  }

  private getHalfwayInsight(trait: string, score: number): MiniInsight {
    const insights = {
      cautious: {
        title: "신중함이 강점",
        content: "실수를 최소화하려는 당신의 신중함이 큰 장점으로 작용하고 있어요.",
        icon: "🛡️"
      },
      optimistic: {
        title: "긍정 에너지의 힘",
        content: "어떤 어려움도 기회로 바꿔보려는 당신만의 특별한 능력이 돋보여요.",
        icon: "⭐"
      },
      social: {
        title: "소통의 달인",
        content: "사람들과 자연스럽게 어울리고 관계를 만들어가는 재능이 있네요.",
        icon: "🌟"
      },
      organized: {
        title: "체계성의 힘",
        content: "복잡한 일도 단계별로 정리해서 해결하는 능력이 뛰어나요.",
        icon: "🏗️"
      },
      emotional: {
        title: "감정 지능 발달",
        content: "자신과 타인의 감정을 잘 이해하고 공감하는 능력이 높아요.",
        icon: "🌺"
      },
      practical: {
        title: "실용적 지혜",
        content: "복잡한 이론보다 실제로 작동하는 방법을 찾는 능력이 탁월해요.",
        icon: "⚙️"
      },
      creative: {
        title: "창의적 사고력",
        content: "기존 방식에 만족하지 않고 새로운 가능성을 찾는 능력이 뛰어나요.",
        icon: "🚀"
      },
      competitive: {
        title: "성취 동력",
        content: "목표를 향해 꾸준히 나아가는 추진력이 당신의 큰 무기네요.",
        icon: "💪"
      }
    };

    return {
      ...insights[trait],
      trigger: 100,
      category: 'strength'
    };
  }

  private getLateInsight(trait: string, score: number): MiniInsight {
    const insights = {
      cautious: {
        title: "깊은 사고의 패턴",
        content: "모든 영역에서 일관되게 깊이 있게 사고하는 패턴이 완성되었네요.",
        icon: "🧠"
      },
      optimistic: {
        title: "희망의 메신저",
        content: "어떤 상황에서도 긍정적 가능성을 찾아내는 일관된 패턴이 인상적이에요.",
        icon: "🌅"
      },
      social: {
        title: "인간관계의 전문가",
        content: "모든 상황에서 사람과의 연결을 우선시하는 성향이 확실해요.",
        icon: "🌐"
      },
      organized: {
        title: "체계적 사고 완성",
        content: "어떤 분야든 체계적으로 접근하는 사고 패턴이 완전히 자리잡았어요.",
        icon: "🏛️"
      },
      emotional: {
        title: "감정의 나침반",
        content: "감정과 직감을 신뢰하고 따르는 일관된 의사결정 패턴이 뚜렷해요.",
        icon: "🧭"
      },
      practical: {
        title: "현실적 해결사",
        content: "어떤 문제든 실용적이고 현실적인 해법을 찾는 능력이 확고해요.",
        icon: "🔧"
      },
      creative: {
        title: "혁신적 사고 완성",
        content: "모든 영역에서 창의적이고 독창적인 접근을 일관되게 보여주고 있어요.",
        icon: "🎪"
      },
      competitive: {
        title: "승리의 DNA",
        content: "어떤 분야든 최고를 추구하는 성취 지향적 성격이 완전히 드러났어요.",
        icon: "👑"
      }
    };

    return {
      ...insights[trait],
      trigger: 150,
      category: 'pattern'
    };
  }

  // 인사이트 초기화 (새로운 검사 시작 시)
  reset(): void {
    this.deliveredInsights.clear();
  }

  // 이미 전달된 인사이트 확인
  hasDeliveredInsight(questionIndex: number): boolean {
    return this.deliveredInsights.has(questionIndex);
  }
}

// 싱글톤 인스턴스
export const miniInsightSystem = new MiniInsightSystem();