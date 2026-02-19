/**
 * 통찰 시스템 공통 데이터 (설계서 32개 공통 통찰 + AI 개인 맞춤 통찰)
 * Dashboard, InsightsPage 등에서 공유
 */

export interface CommonInsight {
  id: number;
  title: string;
  progress: number;
  category: string;
  description?: string;
}

export interface PersonalInsight {
  id: string;
  title: string;
  confidence: number;
  category: string;
  description?: string;
}

// 통찰 데이터 (설계서의 32개 공통 통찰 예시)
export const COMMON_INSIGHTS: CommonInsight[] = [
  { id: 1, title: '미루기 습관 완전 끝내는 법', progress: 100, category: 'productivity', description: '미루는 패턴을 인식하고 작은 단계로 나누어 실행력을 높이는 방법을 알아봅니다.' },
  { id: 2, title: '나의 기본 성격 패턴 분석', progress: 100, category: 'personality', description: '200문항 검사 기반으로 나의 성격 특성과 강점을 파악합니다.' },
  { id: 3, title: '스트레스를 힘으로 바꾸는 법', progress: 100, category: 'stress', description: '스트레스 반응을 이해하고 EFT로 에너지로 전환하는 연습을 합니다.' },
  { id: 4, title: '연애 패턴 분석', progress: 82, category: 'relationship', description: '반복되는 관계 패턴을 발견하고 건강한 관계를 위한 통찰을 얻습니다.' },
  { id: 5, title: '돈 걱정 해결법', progress: 15, category: 'finance', description: '돈에 대한 감정과 신념을 다루고 현실적인 마음가짐을 갖도록 돕습니다.' },
  { id: 6, title: '갈등→기회 대화법', progress: 8, category: 'communication', description: '갈등 상황을 성장의 기회로 바꾸는 대화 기술을 익힙니다.' },
];

// 개인 맞춤 통찰 데이터 (설계서 기반)
export const PERSONAL_INSIGHTS: PersonalInsight[] = [
  { id: 'p1', title: '권위자 관계 치유법', confidence: 89, category: 'personal', description: '상사·부모 등 권위자와의 관계에서 반복되는 패턴을 치유하는 맞춤 통찰입니다.' },
  { id: 'p2', title: '완벽주의 극복 나만의 방법', confidence: 76, category: 'personal', description: '완벽을 추구하다 지치는 패턴을 인식하고, 충분히 좋음을 받아들이는 방법을 찾습니다.' },
];

export function getCommonInsightById(id: number): CommonInsight | undefined {
  return COMMON_INSIGHTS.find((i) => i.id === id);
}

export function getPersonalInsightById(id: string): PersonalInsight | undefined {
  return PERSONAL_INSIGHTS.find((i) => i.id === id);
}

export function getInsightTitle(id: string | number): string {
  if (typeof id === 'number') {
    return getCommonInsightById(id)?.title ?? `통찰 #${id}`;
  }
  return getPersonalInsightById(id)?.title ?? `통찰 ${id}`;
}
