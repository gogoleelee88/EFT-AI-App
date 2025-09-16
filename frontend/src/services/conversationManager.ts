// 대화 상태 관리 구현체
// conversationState.ts의 타입을 기반으로 한 실제 비즈니스 로직

import {
  ConversationState,
  ConversationSlot,
  SafetyCheck,
  RepetitionDamping,
  ContextRestoration,
  ConversationStateManager,
  CONTEXT_PATTERNS,
  SAFETY_KEYWORDS,
  REPETITION_CHECK_PHRASES,
  EFFECT_CHECK_TRIGGERS,
  TWO_TURN_RULE
} from '@/types/conversationState';

export class ConversationManager implements ConversationStateManager {
  // 상태 관리
  currentState: ConversationState = 'S1';
  turnCount: number = 0;
  lastUserMessage: string = '';
  lastAiResponse: string = '';

  // 데이터 슬롯
  slots: ConversationSlot = {};

  // 안전성 시스템
  safety: SafetyCheck = {
    selfHarm: false,
    otherHarm: false,
    escalation: false,
    duplicateWarning: false,
    actionRequired: 'none'
  };

  // 반복 방지
  repetition: RepetitionDamping = {
    phraseCount: new Map(),
    lastResetTime: Date.now(),
    dampingActive: true
  };

  // 컨텍스트 복원
  contextRestore: ContextRestoration = {
    brokenSentences: [],
    coreNouns: [],
    contextTemplates: new Map(Object.entries(CONTEXT_PATTERNS.restoration_templates))
  };

  // S3/S4 상태 전환 조건
  canOfferIntervention: boolean = false;
  interventionRequested: boolean = false;
  interventionOffered: boolean = false;
  effectCheckNeeded: boolean = false;

  // 상태 업데이트 메인 로직
  updateState(userMessage: string, aiResponse: string): ConversationState {
    this.lastUserMessage = userMessage;
    this.lastAiResponse = aiResponse;
    this.turnCount++;

    // 슬롯 추출
    const newSlots = this.extractSlots(userMessage);
    this.slots = { ...this.slots, ...newSlots };

    // 안전성 검사
    this.safety = this.checkSafety(userMessage);

    // 상태 전환 로직
    const newState = this.determineNextState(userMessage);
    this.currentState = newState;

    return newState;
  }

  // 슬롯 추출 (핵심 정보 파싱)
  extractSlots(message: string): Partial<ConversationSlot> {
    const slots: Partial<ConversationSlot> = {};

    // 핵심 명사 추출
    for (const [context, nouns] of Object.entries(CONTEXT_PATTERNS.core_noun_extraction)) {
      for (const noun of nouns) {
        if (message.includes(noun)) {
          slots.coreNoun = noun;
          slots.context = context.replace('_context', '');
          break;
        }
      }
      if (slots.coreNoun) break;
    }

    // 감정 키워드 추출
    const emotionKeywords = {
      '불안': ['불안', '걱정', '초조', '떨림'],
      '우울': ['우울', '슬픔', '절망', '무기력'],
      '분노': ['화', '짜증', '분노', '빡침'],
      '스트레스': ['스트레스', '압박', '부담', '힘듦']
    };

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      if (keywords.some(keyword => message.includes(keyword))) {
        slots.emotion = emotion;
        break;
      }
    }

    // 강도 추출 (숫자 또는 정도 부사)
    const intensityPatterns = [
      { pattern: /(\d+)점/, intensity: (match: string) => parseInt(match) },
      { pattern: /아주|매우|정말|너무/, intensity: () => 8 },
      { pattern: /조금|약간|살짝/, intensity: () => 4 },
      { pattern: /심하게|극심/, intensity: () => 9 }
    ];

    for (const { pattern, intensity } of intensityPatterns) {
      const match = message.match(pattern);
      if (match) {
        slots.intensity = intensity(match[0]);
        break;
      }
    }

    // 말투 감지 (존댓말/반말)
    slots.userStyle = message.includes('요') || message.includes('습니다') ? 'formal' : 'casual';

    return slots;
  }

  // 안전성 검사
  checkSafety(message: string): SafetyCheck {
    const lowerMessage = message.toLowerCase().replace(/\s/g, '');

    // 자해 위험 감지
    const selfHarm = SAFETY_KEYWORDS.self_harm.some(keyword =>
      lowerMessage.includes(keyword.replace(/\s/g, ''))
    );

    // 타해 위험 감지
    const otherHarm = SAFETY_KEYWORDS.other_harm.some(keyword =>
      lowerMessage.includes(keyword.replace(/\s/g, ''))
    );

    // 상황 악화 패턴
    const escalation = SAFETY_KEYWORDS.escalation_patterns.some(keyword =>
      lowerMessage.includes(keyword.replace(/\s/g, ''))
    );

    // 중복 위험 신호 (연속된 위험 메시지)
    const duplicateWarning = (selfHarm || otherHarm) && this.safety.selfHarm || this.safety.otherHarm;

    // 조치 필요성 결정
    let actionRequired: 'none' | 'gentle' | 'urgent' = 'none';
    if (duplicateWarning || (selfHarm && escalation)) {
      actionRequired = 'urgent';
    } else if (selfHarm || otherHarm) {
      actionRequired = 'gentle';
    }

    return {
      selfHarm,
      otherHarm,
      escalation,
      duplicateWarning,
      actionRequired
    };
  }

  // 반복 방지 (24시간 캐시)
  dampRepetition(response: string): string {
    // 24시간마다 리셋
    const now = Date.now();
    if (now - this.repetition.lastResetTime > 24 * 60 * 60 * 1000) {
      this.repetition.phraseCount.clear();
      this.repetition.lastResetTime = now;
    }

    if (!this.repetition.dampingActive) return response;

    let modifiedResponse = response;

    for (const phrase of REPETITION_CHECK_PHRASES) {
      if (response.includes(phrase)) {
        const count = this.repetition.phraseCount.get(phrase) || 0;
        this.repetition.phraseCount.set(phrase, count + 1);

        // 3회 이상 사용 시 대체 표현으로 변경
        if (count >= 2) {
          const alternatives = this.getAlternativePhrase(phrase);
          modifiedResponse = modifiedResponse.replace(phrase, alternatives);
        }
      }
    }

    return modifiedResponse;
  }

  // 대체 표현 생성
  private getAlternativePhrase(originalPhrase: string): string {
    const alternatives: Record<string, string[]> = {
      '함께 이야기해봐요': ['더 들어보고 싶어요', '자세히 말씀해 주세요', '계속 나누어요'],
      '어떤 기분인가요': ['지금 어떠신가요', '마음이 어떠세요', '현재 상태는 어떠신지요'],
      '힘드시겠어요': ['어려우셨을 거예요', '쉽지 않으셨을 텐데요', '많이 지치셨을 것 같아요'],
      '공감합니다': ['이해해요', '그런 마음 충분히 알겠어요', '그 느낌 알 것 같아요'],
      '이해합니다': ['알겠어요', '그렇군요', '충분히 그럴 수 있어요']
    };

    const options = alternatives[originalPhrase];
    if (options) {
      return options[Math.floor(Math.random() * options.length)];
    }
    return originalPhrase;
  }

  // 컨텍스트 복원 (핵심 명사 기반)
  restoreContext(response: string, userMessage: string): string {
    // 끊어진 문장 패턴 감지
    for (const pattern of CONTEXT_PATTERNS.broken_sentence_starters) {
      if (pattern.test(response)) {
        // 사용자 메시지에서 핵심 명사 추출
        const coreNoun = this.slots.coreNoun || this.extractCoreNounFromMessage(userMessage);

        if (coreNoun) {
          // 적절한 문맥 복원 템플릿 선택
          const template = this.selectRestorationTemplate(coreNoun);
          // 끊어진 부분을 완성된 문장으로 대체
          return response.replace(pattern, template + ' ');
        }
      }
    }

    return response;
  }

  // 메시지에서 핵심 명사 추출
  private extractCoreNounFromMessage(message: string): string | null {
    for (const nouns of Object.values(CONTEXT_PATTERNS.core_noun_extraction)) {
      for (const noun of nouns) {
        if (message.includes(noun)) {
          return noun;
        }
      }
    }
    return null;
  }

  // 복원 템플릿 선택
  private selectRestorationTemplate(coreNoun: string): string {
    // 핵심 명사에 따른 컨텍스트 매핑
    const contextMap: Record<string, string> = {
      '잠': 'sleep',
      '수면': 'sleep',
      '불면': 'sleep',
      '직장': 'work',
      '업무': 'work',
      '상사': 'work',
      '스트레스': 'stress'
    };

    const context = contextMap[coreNoun] || 'default';
    return this.contextRestore.contextTemplates.get(context) || CONTEXT_PATTERNS.restoration_templates.default;
  }

  // 개입 제안 가능 여부 판단
  shouldOfferIntervention(): boolean {
    // 2-turn 규칙 체크
    if (this.turnCount < 2 && !TWO_TURN_RULE.exceptions.user_directly_asks) {
      return false;
    }

    // 사용자 직접 요청 체크
    const helpRequests = ['도와주세요', '도움', '방법', '어떻게', '해결'];
    const userRequestsHelp = helpRequests.some(req => this.lastUserMessage.includes(req));

    // 안전 상황에서는 즉시 개입
    if (this.safety.actionRequired !== 'none') {
      return true;
    }

    return this.turnCount >= 2 && userRequestsHelp;
  }

  // S4 상태 트리거 (효과 확인 모드)
  triggerEffectCheck(): void {
    this.effectCheckNeeded = true;
    this.currentState = 'S4';
  }

  // 상태 전환 결정 로직
  private determineNextState(userMessage: string): ConversationState {
    // 안전 위험 시 즉시 개입 모드
    if (this.safety.actionRequired === 'urgent') {
      return 'S3';
    }

    // EFT 기법 실행 감지 → S4
    const triedIntervention = EFFECT_CHECK_TRIGGERS.some(trigger =>
      this.lastAiResponse.includes(trigger)
    );
    if (triedIntervention && this.currentState === 'S3') {
      return 'S4';
    }

    // 현재 상태별 전환 로직
    switch (this.currentState) {
      case 'S1':
        // 의미있는 응답 → S2
        if (userMessage.length > 10 && !this.isMinimalResponse(userMessage)) {
          return 'S2';
        }
        return 'S1';

      case 'S2':
        // 2턴 + 도움 요청 → S3
        if (this.shouldOfferIntervention()) {
          return 'S3';
        }
        // 주제 완전 변경 → S1
        if (this.isTopicChange(userMessage)) {
          this.resetConversation();
          return 'S1';
        }
        return 'S2';

      case 'S3':
        // 기법 거부 → S2
        if (this.isInterventionDeclined(userMessage)) {
          return 'S2';
        }
        return 'S3';

      case 'S4':
        // 효과 확인 완료 → S2
        if (this.isEffectConfirmed(userMessage)) {
          return 'S2';
        }
        // 추가 기법 필요 → S3
        if (this.needsAdditionalTechnique(userMessage)) {
          return 'S3';
        }
        return 'S4';

      default:
        return 'S1';
    }
  }

  // 헬퍼 메서드들
  private isMinimalResponse(message: string): boolean {
    const minimalPatterns = ['네', '아니요', 'ㅠㅠ', 'ㅜㅜ', '그냥', '모르겠어'];
    return minimalPatterns.some(pattern => message.trim() === pattern);
  }

  private isTopicChange(message: string): boolean {
    // 이전 핵심 명사와 완전히 다른 주제인지 확인
    if (!this.slots.coreNoun) return false;

    const newSlots = this.extractSlots(message);
    return newSlots.coreNoun && newSlots.coreNoun !== this.slots.coreNoun;
  }

  private isInterventionDeclined(message: string): boolean {
    const declinePatterns = ['안 해도', '괜찮아요', '됐어요', '필요없어', '싫어'];
    return declinePatterns.some(pattern => message.includes(pattern));
  }

  private isEffectConfirmed(message: string): boolean {
    const confirmPatterns = ['좋아졌어', '나아졌어', '도움됐어', '편해졌어', '시원해'];
    return confirmPatterns.some(pattern => message.includes(pattern));
  }

  private needsAdditionalTechnique(message: string): boolean {
    const needMorePatterns = ['더 해볼래', '다른 방법', '아직도', '계속'];
    return needMorePatterns.some(pattern => message.includes(pattern));
  }

  private resetConversation(): void {
    this.turnCount = 0;
    this.slots = {};
    this.canOfferIntervention = false;
    this.interventionRequested = false;
    this.interventionOffered = false;
    this.effectCheckNeeded = false;
  }

  // 현재 상태 정보 요약
  getStateInfo() {
    return {
      state: this.currentState,
      turn: this.turnCount,
      canIntervene: this.shouldOfferIntervention(),
      safety: this.safety.actionRequired,
      slots: this.slots
    };
  }
}