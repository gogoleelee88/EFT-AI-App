// AI 동반자 시스템 - 법적으로 안전한 설계

interface ConversationContext {
  userId: string;
  sessionId: string;
  conversationHistory: Message[];
  emotionState: EmotionState;
  stage: ConversationStage;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  metadata?: {
    stage: ConversationStage;
    confidence: number;
    suggestedActions?: string[];
  };
}

type ConversationStage = 
  | 'greeting' 
  | 'listening' 
  | 'exploring' 
  | 'insight' 
  | 'eft_preparation' 
  | 'session_guide';

interface EmotionState {
  primary: string;
  intensity: number;
  triggers: string[];
  patterns: string[];
  coreTheme?: string;
}

class AICompanion {
  private context: ConversationContext;
  
  constructor(userId: string) {
    this.context = {
      userId,
      sessionId: this.generateSessionId(),
      conversationHistory: [],
      emotionState: this.initEmotionState(),
      stage: 'greeting'
    };
  }

  // 3단계 하이브리드 AI 시스템
  async processMessage(userInput: string): Promise<string> {
    // 법적 안전장치: 전문 치료 권유 체크
    if (this.requiresProfessionalHelp(userInput)) {
      return this.generateProfessionalReferral();
    }

    // Level 1: 규칙 기반 (즉시 응답)
    const quickResponse = this.tryRuleBasedResponse(userInput);
    if (quickResponse) {
      return quickResponse;
    }

    // Level 2: Transformers.js (일반적 대화)
    const aiResponse = await this.generateAIResponse(userInput);
    
    // Level 3: 자체 학습 AI (나중에 구현)
    // const specializedResponse = await this.useSpecializedAI(userInput);

    return aiResponse;
  }

  // === 1단계: 마음 들어주기 ===
  private tryRuleBasedResponse(input: string): string | null {
    const lowerInput = input.toLowerCase();
    
    // 인사 처리
    if (this.isGreeting(lowerInput)) {
      this.context.stage = 'listening';
      return "안녕하세요! 저는 당신의 마음 돌봄을 도와주는 AI 동반자예요. 💙\n\n" +
             "오늘은 어떤 마음으로 오셨나요? 편안하게 이야기해 주세요.\n\n" +
             "*참고: 전문적인 치료가 필요하시면 언제든 전문가와 상담받으시길 권해드려요.*";
    }

    // 감사 표현
    if (this.isGratitude(lowerInput)) {
      return "함께 할 수 있어서 저도 기뻐요! 😊 언제든 마음이 힘드시면 다시 찾아와 주세요.";
    }

    return null;
  }

  // === 2단계: 자체 AI 시스템 (고도화된 상황별 응답) ===
  private async generateAIResponse(userInput: string): Promise<string> {
    try {
      // Transformers.js 비활성화 - 자체 AI 시스템 사용
      console.log('🤖 자체 AI 시스템 사용 (Level 2)');
      
      const intelligentResponse = await this.useIntelligentAI(userInput);
      
      this.updateConversationHistory('user', userInput);
      this.updateConversationHistory('ai', intelligentResponse);
      this.updateEmotionState(userInput);
      
      return intelligentResponse;
    } catch (error) {
      console.log('자체 AI 시스템 에러:', error);
      const fallbackResponse = this.getFallbackResponse();
      return fallbackResponse;
    }
  }

  // === 자체 지능형 AI 시스템 ===
  private async useIntelligentAI(userInput: string): Promise<string> {
    // 1. 상황 분석 (키워드 + 맥락)
    const situationAnalysis = this.analyzeSituation(userInput);
    
    // 2. 감정 상태 분석
    const emotionAnalysis = this.analyzeEmotion(userInput);
    
    // 3. 대화 히스토리 고려
    const conversationContext = this.getConversationContext();
    
    // 4. 종합적 응답 생성
    const response = this.generateContextualResponse(
      userInput, 
      situationAnalysis, 
      emotionAnalysis, 
      conversationContext
    );
    
    console.log('🎯 자체 AI 분석:', {
      situation: situationAnalysis,
      emotion: emotionAnalysis,
      response: response
    });
    
    return response;
  }

  // 상황 분석 (구체적 키워드 기반)
  private analyzeSituation(input: string): any {
    const situations = {
      work: {
        keywords: ['상사', '야근', '회사', '직장', '업무', '동료', '출근', '퇴근', '월급', '승진'],
        subcategories: {
          overtime: ['야근', '밤늦게', '새벽', '집에못가'],
          boss: ['상사', '팀장', '부장', '사장', '윗사람'],
          workload: ['일이많아', '바빠', '과로', '업무량', '마감']
        }
      },
      relationship: {
        keywords: ['남친', '여친', '친구', '가족', '엄마', '아빠', '형제', '연애', '헤어', '싸움'],
        subcategories: {
          breakup: ['헤어', '이별', '차임', '끝났어'],
          fight: ['싸웠', '다퉜', '갈등', '화났어'],
          family: ['엄마', '아빠', '부모', '가족', '형제']
        }
      },
      health: {
        keywords: ['아파', '몸살', '감기', '병원', '약', '건강', '피곤', '잠'],
        subcategories: {
          physical: ['몸아파', '머리아파', '배아파'],
          mental: ['우울', '불안', '스트레스', '힘들어']
        }
      },
      study: {
        keywords: ['시험', '공부', '학교', '수업', '성적', '과제', '졸업', '입시'],
        subcategories: {
          exam: ['시험', '중간고사', '기말고사', '수능'],
          grades: ['성적', '점수', '떨어져', '못해']
        }
      }
    };

    const result = {
      category: 'general',
      subcategory: null,
      keywords: [],
      intensity: 'medium'
    };

    // 카테고리 매칭
    for (const [category, data] of Object.entries(situations)) {
      const matchedKeywords = data.keywords.filter(keyword => 
        input.includes(keyword)
      );
      
      if (matchedKeywords.length > 0) {
        result.category = category;
        result.keywords = matchedKeywords;
        
        // 서브카테고리 찾기
        for (const [sub, subKeywords] of Object.entries(data.subcategories)) {
          if (subKeywords.some(keyword => input.includes(keyword))) {
            result.subcategory = sub;
            break;
          }
        }
        break;
      }
    }

    // 강도 분석
    const intensityKeywords = {
      high: ['너무', '정말', '완전', '진짜', '죽겠', '미치겠', '극도로'],
      low: ['좀', '약간', '살짝', '조금', '그냥']
    };

    if (intensityKeywords.high.some(keyword => input.includes(keyword))) {
      result.intensity = 'high';
    } else if (intensityKeywords.low.some(keyword => input.includes(keyword))) {
      result.intensity = 'low';
    }

    return result;
  }

  // 감정 분석 (기존보다 정교)
  private analyzeEmotion(input: string): any {
    const emotions = {
      anger: {
        keywords: ['화나', '짜증', '열받', '분노', '억울', '빡쳐', '미쳐'],
        intensity: 0
      },
      sadness: {
        keywords: ['슬퍼', '우울', '눈물', '아파', '외로', '허무', '절망'],
        intensity: 0
      },
      anxiety: {
        keywords: ['불안', '걱정', '두려워', '무서워', '긴장', '초조'],
        intensity: 0
      },
      stress: {
        keywords: ['스트레스', '압박', '부담', '힘들어', '지쳐', '고통'],
        intensity: 0
      },
      frustration: {
        keywords: ['답답', '막막', '좌절', '포기', '안돼', '어떻게'],
        intensity: 0
      }
    };

    const result = {
      primary: 'neutral',
      secondary: null,
      intensity: 'medium',
      mixed: false
    };

    // 감정별 매칭 점수 계산
    let maxScore = 0;
    let secondScore = 0;

    for (const [emotion, data] of Object.entries(emotions)) {
      const matches = data.keywords.filter(keyword => input.includes(keyword));
      const score = matches.length;
      
      if (score > maxScore) {
        secondScore = maxScore;
        result.secondary = result.primary !== 'neutral' ? result.primary : null;
        maxScore = score;
        result.primary = emotion;
      } else if (score > secondScore && score > 0) {
        secondScore = score;
        result.secondary = emotion;
      }
    }

    // 복합 감정 체크
    if (secondScore > 0) {
      result.mixed = true;
    }

    return result;
  }

  // 대화 맥락 분석
  private getConversationContext(): any {
    const history = this.context.conversationHistory;
    const recentMessages = history.slice(-4); // 최근 4개 메시지
    
    return {
      messageCount: history.length,
      stage: this.context.stage,
      isFirstTime: history.length === 0,
      recentTopics: this.extractRecentTopics(recentMessages),
      emotionTrend: this.analyzeEmotionTrend(recentMessages)
    };
  }

  private extractRecentTopics(messages: Message[]): string[] {
    // 최근 대화에서 주요 토픽 추출
    const topics = [];
    const userMessages = messages.filter(m => m.role === 'user');
    
    for (const msg of userMessages) {
      const situation = this.analyzeSituation(msg.content);
      if (situation.category !== 'general') {
        topics.push(situation.category);
      }
    }
    
    return [...new Set(topics)]; // 중복 제거
  }

  private analyzeEmotionTrend(messages: Message[]): string {
    // 감정 변화 추이 분석
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length < 2) return 'stable';
    
    // 간단한 감정 변화 감지 로직
    return 'improving'; // 또는 'worsening', 'stable'
  }

  // === Transformers.js 실제 구현 (비활성화됨) ===
  private async useTransformersJS(userInput: string): Promise<string | null> {
    try {
      // 동적 import로 Transformers.js 로드 (번들 크기 최적화)
      const { pipeline } = await import('@huggingface/transformers');
      
      // 404 오류 없는 안정적인 모델들 사용
      const emotionClassifier = await pipeline('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
      const textGenerator = await pipeline('text-generation', 'Xenova/gpt2');
      
      // 1. 감정 분석 (POSITIVE/NEGATIVE)
      const sentimentResult = await emotionClassifier(userInput);
      const isPositive = sentimentResult[0]?.label === 'POSITIVE';
      const confidence = sentimentResult[0]?.score || 0.5;
      
      // 2. 맥락 기반 프롬프트 생성
      const contextPrompt = this.buildAdvancedPrompt(userInput, isPositive, confidence);
      
      // 3. GPT-2로 실제 AI 텍스트 생성
      const generated = await textGenerator(contextPrompt, {
        max_length: 80,
        temperature: 0.8,
        do_sample: true,
        pad_token_id: 50256,
        repetition_penalty: 1.2
      });
      
      // 4. 응답 후처리 (영어 → 한국어 변환 + 정제)
      const rawResponse = generated[0]?.generated_text || '';
      const cleanResponse = this.postProcessAIResponse(rawResponse, contextPrompt, isPositive);
      
      console.log('✅ Level 2 AI 응답 생성 성공:', {sentiment: sentimentResult, response: cleanResponse});
      return cleanResponse;
      
    } catch (error) {
      console.log('❌ Transformers.js 완전 실패, 시뮬레이션으로 폴백:', error);
      return null; // 폴백으로 simulateAIResponse 사용
    }
  }

  // 고급 프롬프트 생성 (GPT-2용)
  private buildAdvancedPrompt(userInput: string, isPositive: boolean, confidence: number): string {
    const emotionContext = isPositive ? "supportive and encouraging" : "empathetic and comforting";
    const stage = this.context.stage;
    
    // 영어 프롬프트 (GPT-2는 영어가 더 좋음)
    return `As a caring counselor, respond ${emotionContext}ly to: "${userInput}". Be warm and understanding:`;
  }

  // 기존 함수 유지 (호환성)
  private buildContextPrompt(userInput: string, emotion: string): string {
    const stage = this.context.stage;
    const emotionContext = this.getEmotionContext(emotion);
    
    return `[EFT 상담사] ${emotionContext} 사용자가 "${userInput}"라고 말했습니다. 공감적이고 따뜻하게 응답해주세요.`;
  }

  // 감정별 맥락 제공
  private getEmotionContext(emotion: string): string {
    const contextMap: { [key: string]: string } = {
      'joy': '기쁜 마음을 함께 나누며',
      'sadness': '슬픈 마음을 이해하며',
      'anger': '화난 마음을 달래며',
      'fear': '불안한 마음을 안정시키며',
      'surprise': '놀란 마음을 진정시키며',
      'disgust': '불편한 마음을 이해하며',
      'neutral': '차분하게 마음을 들여다보며'
    };
    
    return contextMap[emotion.toLowerCase()] || '마음을 이해하며';
  }

  // Level 2 AI 응답 후처리 (영어 → 한국어 + 정제)
  private postProcessAIResponse(rawResponse: string, prompt: string, isPositive: boolean): string {
    // 프롬프트 부분 제거
    let cleaned = rawResponse.replace(prompt, '').trim();
    
    // 불필요한 태그 제거
    cleaned = cleaned.replace(/\[.*?\]/g, '').trim();
    
    // 첫 문장만 추출
    const sentences = cleaned.split(/[.!?]/);
    const firstSentence = sentences[0]?.trim() || '';
    
    // 영어 응답을 한국어로 의역 변환
    const koreanResponse = this.translateToKorean(firstSentence, isPositive);
    
    // 길이 및 품질 검증
    if (!koreanResponse || koreanResponse.length < 5) {
      console.log('⚠️ Level 2 AI 응답 품질 부족, 폴백 사용');
      return this.getFallbackResponse();
    }
    
    console.log('🎯 Level 2 AI 최종 응답:', koreanResponse);
    return koreanResponse;
  }

  // 영어 → 한국어 의역 변환 (패턴 기반)
  private translateToKorean(englishText: string, isPositive: boolean): string {
    const text = englishText.toLowerCase();
    
    // 공감 표현 변환
    if (text.includes('understand') || text.includes('feel')) {
      return isPositive ? 
        "마음이 충분히 이해가 되네요. 😊 좋은 기분이 느껴져요!" :
        "마음이 많이 힘드셨겠어요. 😔 충분히 이해해요.";
    }
    
    if (text.includes('sorry') || text.includes('difficult')) {
      return "정말 힘든 상황이셨군요. 💙 혼자 감당하기 어려우셨을 것 같아요.";
    }
    
    if (text.includes('help') || text.includes('support')) {
      return "함께 해결해 나가요. 💪 도움이 필요하시면 언제든 말씀해 주세요.";
    }
    
    if (text.includes('better') || text.includes('good')) {
      return "점점 나아질 거예요. ✨ 지금도 충분히 잘하고 계시는 거예요.";
    }
    
    // 기본 패턴
    return isPositive ?
      "긍정적인 마음이 느껴져요! 😊 이런 기분을 더 키워나가면 좋겠어요." :
      "마음이 무거우시군요. 💙 천천히 함께 풀어보아요.";
  }

  // 기존 응답 후처리 (호환성 유지)
  private postProcessResponse(rawResponse: string, prompt: string): string {
    // 프롬프트 부분 제거
    let cleaned = rawResponse.replace(prompt, '').trim();
    
    // [EFT 상담사] 태그 제거
    cleaned = cleaned.replace(/\[EFT 상담사\]\s*/g, '');
    
    // 첫 문장만 추출 (너무 긴 응답 방지)
    const sentences = cleaned.split(/[.!?]/);
    cleaned = sentences[0] + (sentences.length > 1 ? '.' : '');
    
    // 길이 제한 (100자)
    if (cleaned.length > 100) {
      cleaned = cleaned.substring(0, 97) + '...';
    }
    
    // 빈 응답 처리
    if (!cleaned || cleaned.length < 10) {
      return this.getFallbackResponse();
    }
    
    // 공감 이모티콘 추가
    cleaned += ' 💙';
    
    return cleaned;
  }

  // 폴백 응답
  private getFallbackResponse(): string {
    const fallbacks = [
      "마음이 많이 복잡하시군요. 천천히 더 이야기해 주세요.",
      "그런 기분이 드시는군요. 어떤 부분이 가장 힘드신가요?",
      "이해해요. 지금 느끼시는 마음을 좀 더 들어보고 싶어요.",
      "그렇게 느끼시는 것 충분히 이해됩니다. 더 말씀해 주세요."
    ];
    
    return fallbacks[Math.floor(Math.random() * fallbacks.length)] + ' 💙';
  }

  // AI 응답 시뮬레이션 (Transformers.js 폴백용)
  private async simulateAIResponse(input: string): Promise<string> {
    const stage = this.context.stage;
    const emotionState = this.context.emotionState;
    
    switch (stage) {
      case 'listening':
        return this.generateListeningResponse(input);
      
      case 'exploring':
        return this.generateExploringResponse(input);
      
      case 'insight':
        return this.generateInsightResponse(input);
      
      case 'eft_preparation':
        return this.generateEFTPreparationResponse();
      
      default:
        return this.generateEmpathicResponse(input);
    }
  }

  // === 법적 안전장치 ===
  private requiresProfessionalHelp(input: string): boolean {
    const riskKeywords = [
      '죽고싶', '자살', '자해', '해치고싶', '죽이고싶', 
      '환청', '환각', '조현병', '우울증 약', '정신병원'
    ];
    
    return riskKeywords.some(keyword => 
      input.toLowerCase().includes(keyword)
    );
  }

  private generateProfessionalReferral(): string {
    return "마음이 많이 힘드시군요. 😔\n\n" +
           "지금 상황에서는 전문가의 도움이 필요할 것 같아요.\n" +
           "혼자 감당하기 어려운 마음, 충분히 이해해요.\n\n" +
           "📞 **즉시 도움받을 곳:**\n" +
           "• 생명의전화: 1588-9191\n" +
           "• 청소년 상담전화: 1388\n" +
           "• 정신건강 위기상담: 1577-0199\n\n" +
           "당신이 소중한 사람이라는 것, 잊지 말아 주세요. 💙";
  }

  // === 단계별 응답 생성 ===
  private generateEmpathicResponse(input: string): string {
    const emotions = this.detectEmotions(input);
    
    if (emotions.includes('스트레스')) {
      return "정말 스트레스가 많으셨을 것 같아요. 😔 혼자서 다 감당하려고 하셨나요?\n\n어떤 부분이 가장 힘드신지 이야기해 주시면, 함께 해결 방법을 찾아보아요.";
    }
    
    if (emotions.includes('불안')) {
      return "불안한 마음이 느껴져요. 마음이 편하지 않으시겠어요. 💙\n\n걱정이 많으실 텐데, 천천히 하나씩 이야기해 주세요. 혼자가 아니에요.";
    }
    
    if (emotions.includes('슬픔')) {
      return "마음이 많이 아프시군요. 😢 슬픈 마음을 혼자 간직하고 계셨나요?\n\n괜찮다고 하지 마시고, 지금 느끼시는 그대로 이야기해 주세요.";
    }
    
    if (emotions.includes('분노')) {
      return "화가 많이 나셨군요. 정말 억울하고 답답하셨을 것 같아요. 😤\n\n그런 기분이 드는 게 당연해요. 어떤 일이 있으셨는지 들어볼게요.";
    }
    
    return "이야기를 들려주셔서 고마워요. 💙\n\n지금 마음이 어떠신지 좀 더 자세히 들어보고 싶어요. 편안하게 말씀해 주세요.";
  }

  private generateListeningResponse(input: string): string {
    // 감정 키워드 감지
    const emotions = this.detectEmotions(input);
    
    if (emotions.includes('스트레스') || emotions.includes('압박')) {
      this.context.stage = 'exploring';
      return "정말 힘드셨을 것 같아요. 스트레스가 많으시군요. 😔\n\n" +
             "어떤 상황이 특히 부담스러우신지 좀 더 들어볼 수 있을까요?\n" +
             "혼자 감당하기 어려우셨죠?";
    }

    if (emotions.includes('불안') || emotions.includes('걱정')) {
      this.context.stage = 'exploring';
      return "불안한 마음이 느껴져요. 마음이 편하지 않으시겠어요. 💙\n\n" +
             "구체적으로 어떤 것이 가장 걱정되시는지 이야기해 주실 수 있나요?\n" +
             "함께 차근차근 살펴보아요.";
    }

    // 기본 공감 응답
    return "이야기를 들려주셔서 고마워요. 😊\n\n" +
           "지금 느끼시는 마음을 좀 더 자세히 들어보고 싶어요.\n" +
           "어떤 부분이 가장 마음에 걸리시나요?";
  }

  private generateExploringResponse(input: string): string {
    this.context.stage = 'insight';
    
    return "말씀을 차근차근 들어보니, 상황이 좀 더 이해가 되네요. 🤔\n\n" +
           "혹시 이런 비슷한 상황을 전에도 겪으신 적이 있으신가요?\n" +
           "어떤 패턴이나 반복되는 느낌이 있으실까요?\n\n" +
           "함께 조금씩 풀어보아요.";
  }

  private generateInsightResponse(input: string): string {
    this.context.stage = 'eft_preparation';
    
    const coreTheme = this.identifyCoreTheme();
    
    return `말씀해 주신 내용을 종합해보니, ${coreTheme}와 관련된 마음의 짐이 있는 것 같아요. 💭\n\n` +
           "이런 마음들이 쌓여있을 때는 몸과 마음을 함께 달래주는 것이 도움이 될 수 있어요.\n\n" +
           "EFT라는 셀프케어 방법을 함께 해보시는 건 어떨까요?\n" +
           "가벼운 터치로 마음을 진정시키는 연습이에요. 🌿";
  }

  private generateEFTPreparationResponse(): string {
    const recommendedPoints = this.getRecommendedEFTPoints();
    const setupPhrase = this.generatePersonalizedSetupPhrase();
    
    return "그럼 함께 마음 달래기 연습을 해보아요! 💙\n\n" +
           `**오늘의 셀프케어 포인트:** ${recommendedPoints.length}곳\n` +
           `**마음 다독이는 구문:** "${setupPhrase}"\n\n` +
           "준비가 되시면 '시작하기'를 눌러주세요.\n" +
           "천천히, 편안하게 함께 해보아요. 🌸";
  }

  // === 유틸리티 메서드들 ===
  private isGreeting(input: string): boolean {
    const greetings = ['안녕', 'hello', 'hi', '처음', '시작'];
    return greetings.some(greeting => input.includes(greeting));
  }

  private isGratitude(input: string): boolean {
    const gratitude = ['고마워', '감사', 'thanks', '도움'];
    return gratitude.some(word => input.includes(word));
  }

  private detectEmotions(input: string): string[] {
    const emotionMap = {
      '스트레스': ['스트레스', '압박', '부담', '힘들', '지쳐'],
      '불안': ['불안', '걱정', '무서워', '두려워', '긴장'],
      '분노': ['화나', '짜증', '억울', '분노', '열받'],
      '슬픔': ['슬퍼', '우울', '눈물', '마음 아파', '외로워'],
      '좌절': ['막막', '답답', '좌절', '포기하고싶', '안돼']
    };

    const detected: string[] = [];
    for (const [emotion, keywords] of Object.entries(emotionMap)) {
      if (keywords.some(keyword => input.includes(keyword))) {
        detected.push(emotion);
      }
    }
    return detected;
  }

  private identifyCoreTheme(): string {
    const themes = [
      "완벽해야 한다는 압박감",
      "인정받고 싶은 마음", 
      "통제하고 싶은 욕구",
      "버림받을까 하는 두려움",
      "혼자 감당해야 한다는 부담감"
    ];
    
    // 실제로는 AI가 분석해서 결정
    return themes[Math.floor(Math.random() * themes.length)];
  }

  private getRecommendedEFTPoints(): number[] {
    // 감정 상태에 따른 추천 포인트
    const emotion = this.context.emotionState.primary;
    
    const pointMap: { [key: string]: number[] } = {
      '스트레스': [1, 2, 7], // 정수리, 눈썹, 쇄골
      '불안': [2, 4, 5],     // 눈썹, 눈아래, 코아래
      '분노': [3, 5, 8],     // 눈옆, 코아래, 겨드랑이
      '슬픔': [4, 6, 9],     // 눈아래, 턱, 손목
      '좌절': [1, 3, 7]      // 정수리, 눈옆, 쇄골
    };
    
    return pointMap[emotion] || [1, 4, 7]; // 기본 추천
  }

  private generatePersonalizedSetupPhrase(): string {
    const coreTheme = this.identifyCoreTheme();
    return `이런 ${this.context.emotionState.primary}이 있지만, 나는 나 자신을 깊이 사랑하고 받아들입니다`;
  }

  // === 상태 관리 ===
  private updateConversationHistory(role: 'user' | 'ai', content: string) {
    this.context.conversationHistory.push({
      role,
      content,
      timestamp: Date.now()
    });
  }

  private updateEmotionState(userInput: string) {
    const emotions = this.detectEmotions(userInput);
    if (emotions.length > 0) {
      this.context.emotionState.primary = emotions[0];
      // 추가 분석 로직...
    }
  }

  private initEmotionState(): EmotionState {
    return {
      primary: '',
      intensity: 0,
      triggers: [],
      patterns: []
    };
  }

  private generateSessionId(): string {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

export default AICompanion;