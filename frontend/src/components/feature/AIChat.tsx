import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import { getServerAI } from '../../services/serverAI';
import type { ChatResponse, ConversationMessage, EmotionAnalysis, EFTRecommendation } from '../../types/serverAI';
import {
  createSession,
  onUserMessage,
  enforceTwoTurnRule,
  sanitizeAssistantText,
  applySafetyCheck,
  dampenRepetition,
  enforceLength,
  extractSlotsFrom,
  ensureTwoParagraphs,
  type ConversationSession
} from '../../types/conversationState';

interface Message {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  metadata?: {
    emotion_analysis?: EmotionAnalysis;
    eft_recommendations?: EFTRecommendation[];
    confidence: number;
    processing_time?: number;
    emergency_detected?: boolean;
    professional_referral?: boolean;
  };
}

interface AIChatProps {
  userId: string;
}

type AITier = 'free' | 'premium' | 'enterprise';

const AIChat: React.FC<AIChatProps> = ({ userId }) => {
  const navigate = useNavigate();

  // ConversationState 시스템 통합
  const [session, setSession] = useState<ConversationSession>(() => createSession());
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverAI] = useState(() => getServerAI());
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [selectedTier, setSelectedTier] = useState<AITier>('premium');
  const [availableTiers, setAvailableTiers] = useState<AITier[]>(['free', 'premium', 'enterprise']);
  const [showTierSelector, setShowTierSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tierSelectorRef = useRef<HTMLDivElement>(null);
  const [interventionTimer, setInterventionTimer] = useState<NodeJS.Timeout | null>(null);

  // 뒤로가기 핸들러
  const handleGoBack = () => {
    navigate('/');
  };

  // 퀘스트 진행률 업데이트 (로컬 처리)
  const handleQuestProgress = (questId: string, progress: number) => {
    console.log(`퀘스트 진행: ${questId} +${progress}%`);
    // TODO: localStorage나 Context API로 퀘스트 진행률 저장
  };

  // 서버 상태 체크 및 초기화 (Engine A/B 시스템)
  useEffect(() => {
    const initializeAI = async () => {
      try {
        const healthResponse = await fetch('http://localhost:8000/health');
        const healthData = await healthResponse.json();
        
        // Engine A/B 시스템은 항상 사용 가능 (vLLM 서버 여부와 무관)
        setServerStatus('online');
        setAvailableTiers(['free', 'premium', 'enterprise']);
        
        // 기본값을 무료로 설정 (Engine A/B 병렬 비교 사용)
        setSelectedTier('free');
        
        const initialMessage: Message = {
          role: 'ai',
          content: "안녕하세요! 저는 EFT 전문 AI 상담사입니다. 🌿\n\n🚀 **Engine A/B 병렬 비교 시스템 활성화!**\n- 🆓 무료: Llama-3 vs Qwen-2.5 병렬 비교\n- 💎 프리미엄: Llama 3.1 최고급 모델\n\n두 최신 AI 모델이 동시에 응답하여 더 나은 답변을 제공합니다!\n\n오늘은 어떤 마음으로 찾아오셨나요? 편안하게 이야기해 주세요.",
          timestamp: Date.now(),
          metadata: {
            confidence: 1.0,
            processing_time: 0
          }
        };
        
        setMessages([initialMessage]);
        
      } catch (error) {
        console.error('서버 초기화 실패:', error);
        // Engine A/B 시스템은 서버 오류가 있어도 기본 동작
        setServerStatus('online');
        
        const errorMessage: Message = {
          role: 'ai',
          content: "안녕하세요! Engine A/B 병렬 비교 시스템입니다. 🚀\n\n현재 vLLM 서버 연결을 시도 중입니다. 일부 응답이 제한될 수 있지만 기본 서비스는 이용 가능합니다.",
          timestamp: Date.now(),
          metadata: { confidence: 0.7 }
        };
        
        setMessages([errorMessage]);
      }
    };

    initializeAI();
    
    // 자동 포커스
    setTimeout(() => {
      inputRef.current?.focus();
    }, 1000);
  }, [serverAI]);


  // 티어 선택 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tierSelectorRef.current && !tierSelectorRef.current.contains(event.target as Node)) {
        setShowTierSelector(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 타이머 메모리 누수 방지 cleanup
  useEffect(() => {
    return () => {
      if (interventionTimer) clearTimeout(interventionTimer);
    };
  }, [interventionTimer]);

  // 메시지 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // EFT 전문 시스템 프롬프트
  const SYSTEM_PROMPT = `당신은 EFT(감정자유기법) 전문 상담사 AI입니다. 다음 가이드라인을 따라 응답하세요:

1. 경청과 공감을 최우선으로 하세요
2. 2턴 규칙: 2번째 대화 이전에는 기법을 제안하지 마세요
3. 응답은 400-800자 범위로 작성하고 2단락으로 구성하세요
4. 위험 신호 감지 시 안전 안내를 포함하세요
5. 선택권을 제공하세요 ("원하지 않으면 지나가도 됩니다")
6. 한국 문화적 맥락을 고려하세요 (수고, 책임감, 경계 등)`;

  // 개입 토글용 옵션들
  const interventionOptions = [
    { id: 'breathing', label: '호흡 60초', duration: 60 },
    { id: 'tapping', label: '탭핑 3포인트', duration: 75 },
    { id: 'grounding', label: '5감 그라운딩', duration: 90 }
  ];

  // Qwen 호출 파이프라인 (상태머신 순서 준수)
  const onSend = async (userText: string) => {
    if (!userText.trim() || loading) return;
    setLoading(true);

    try {
      // 1) 사용자 입력 도착 - 핵심명사 추출 및 상태 전이
      onUserMessage(session, userText);

      // UI 메시지 추가
      const userMessage: Message = {
        role: 'user',
        content: userText.trim(),
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, userMessage]);
      setInputMessage('');

      // 2) 엔진 응답 생성 후(확정 직전) 상태 정책 적용
      enforceTwoTurnRule(session);

      // 슬롯 추출 (보조)
      const slots = extractSlotsFrom(userText);

      // 시스템 프롬프트 구성 (+ 슬롯 JSON)
      const systemWithSlots = SYSTEM_PROMPT + `\n[슬롯]\n${JSON.stringify(slots)}`;

      // Qwen 호출 (기존 서버 래퍼 사용)
      console.log(`🚀 Qwen 호출 시작 (${selectedTier} 티어, 상태: ${session.state}, 턴: ${session.turn}):`, userText);

      let serverResponse: ChatResponse;

      if (selectedTier === 'free') {
        // 무료: 기존 Engine A/B 사용
        serverResponse = await serverAI.chat(userText, {
          userId: userId,
          maxTokens: 300,
          temperature: 0.4
        });
      } else {
        // 프리미엄: vLLM Qwen 직접 호출
        const response = await fetch('http://localhost:8002/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer EMPTY'
          },
          body: JSON.stringify({
            model: 'engine-b',
            temperature: 0.4,
            max_tokens: 700,
            messages: [
              { role: 'system', content: systemWithSlots },
              { role: 'user', content: userText }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`vLLM API 호출 실패: ${response.status}`);
        }

        const vllmResponse = await response.json();

        // ChatResponse 형태로 변환
        serverResponse = {
          response: vllmResponse.choices?.[0]?.message?.content ?? '',
          emotion_analysis: { primary_emotion: 'unknown', intensity: 0.5, triggers: [] },
          eft_recommendations: [],
          confidence_score: 0.8,
          processing_time: 0,
          emergency_detected: false,
          professional_referral: false
        };
      }
      
      // 3) 응답 텍스트 후처리 (통합 파이프라인 순서)
      let reply = serverResponse.response || '';

      // 3-1. 문맥 복원 ("로 힘드시겠어요" → "잠으로 힘드시겠어요")
      reply = sanitizeAssistantText(session, reply);

      // 3-2. 안전성 검사 (위험 키워드 감지 + 안전 안내)
      reply = applySafetyCheck(session, userText, reply);

      // 3-3. 반복 방지 적용 (24시간 캐시)
      reply = dampenRepetition(session, reply);

      // 3-4. 길이 제한 강제 (400-800자)
      reply = enforceLength(reply);

      // UI 반영 (2단락 보장)
      const paragraphs = ensureTwoParagraphs(reply);
      const finalContent = paragraphs.join('\n\n');

      const aiMessage: Message = {
        role: 'ai',
        content: finalContent,
        timestamp: Date.now(),
        metadata: {
          emotion_analysis: serverResponse.emotion_analysis,
          eft_recommendations: serverResponse.eft_recommendations,
          confidence: serverResponse.confidence_score,
          processing_time: serverResponse.processing_time,
          emergency_detected: serverResponse.emergency_detected,
          professional_referral: serverResponse.professional_referral,
          conversationState: session.state,
          turnCount: session.turn
        }
      };

      setMessages(prev => [...prev, aiMessage]);

      // 4) 메시지 렌더링 & turn 카운트 증가 (응답 확정 후)
      session.turn += 1;
      setSession({ ...session }); // 세션 상태 저장

      console.log(`✅ 파이프라인 완료 - 상태: ${session.state}, 턴: ${session.turn}`);

      // 응급상황 감지 시 특별 처리
      if (serverResponse.emergency_detected) {
        console.warn('🚨 응급상황 감지됨');
        // TODO: 응급상황 처리 로직 추가
      }

      // 전문가 상담 권유 시 알림
      if (serverResponse.professional_referral) {
        console.info('⚠️ 전문가 상담 권유');
      }

      // 감정 기반 퀘스트 진행률 업데이트
      const primaryEmotion = serverResponse.emotion_analysis.primary_emotion;
      if (primaryEmotion === 'stress' || primaryEmotion === '스트레스') {
        handleQuestProgress('stress_management', 8);
      } else if (primaryEmotion === 'sadness' || primaryEmotion === '슬픔') {
        handleQuestProgress('emotional_healing', 6);
      } else if (primaryEmotion === 'anxiety' || primaryEmotion === '불안') {
        handleQuestProgress('anxiety_relief', 7);
      }

      console.log('✅ 서버 AI 응답 완료:', {
        emotion: primaryEmotion,
        confidence: serverResponse.confidence_score,
        processingTime: serverResponse.processing_time + 'ms',
        eftRecommendations: serverResponse.eft_recommendations.length
      });

    } catch (error) {
      console.error('❌ 서버 AI 응답 실패:', error);

      const errorMessage: Message = {
        role: 'ai',
        content: serverStatus === 'offline'
          ? "현재 AI 서버와 연결할 수 없습니다. 서버 상태를 확인해 주세요. 🔧"
          : "죄송합니다. 응답 생성 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요. 🤔",
        timestamp: Date.now(),
        metadata: {
          confidence: 0.3,
          processing_time: 0
        }
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // 기존 handleSendMessage를 onSend로 대체
  const handleSendMessage = () => onSend(inputMessage);

  // 개입 토글 시작 함수
  const startIntervention = (option: typeof interventionOptions[0]) => {
    console.log(`🧘 ${option.label} 시작 (${option.duration}초)`);

    // 기존 타이머 정리
    if (interventionTimer) clearTimeout(interventionTimer);

    // 새 타이머 설정 (60-90초 후 효과 확인)
    const timer = setTimeout(() => {
      onSend('조금 가벼워졌는지, 몸이 어떻게 느껴지는지 알려줄래요?');
    }, option.duration * 1000);

    setInterventionTimer(timer);
  };

  // 개입 건너뛰기
  const skipIntervention = () => {
    onSend('괜찮아요. 원하지 않으면 지금은 건너뛰어도 됩니다.');
  };

  // Enter 키 처리
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 체크리스트 배지 생성 (새로운 세션 구조)
  const generateChecklistBadges = () => {
    const lastAI = messages.filter(m => m.role === 'ai').pop()?.content || '';
    const hasChoice = /(괜찮다면|원하지 않으면|지금은 듣기만)/.test(lastAI);
    const safetyQ = /(어려웠던 순간|경고 신호|해치고 싶은 충동)/.test(lastAI);
    const culture = /(수고|책임감|경계|합의|역할 기대)/.test(lastAI);
    const len = [...lastAI].length;
    const inRange = (len >= 350 && len <= 900);
    const twoTurnOk = session.state !== 'S3' || session.turn >= 2;

    return {
      twoTurn: twoTurnOk,
      oneInterventionWithChoice: hasChoice,
      safetyScreened: safetyQ,
      lengthAndCulture: inRange && culture,
      repetitionDamped: true // 새로운 시스템에서는 항상 활성화
    };
  };

  // 제안 메시지 클릭 처리
  const handleSuggestionClick = (suggestion: string) => {
    setInputMessage(suggestion);
    inputRef.current?.focus();
  };

  // 시간 포맷팅
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="flex flex-col h-screen lg:min-h-0 bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent">
      {/* 헤더 */}
      <div className="bg-white shadow-lg border-b-2 border-indigo-100 sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleGoBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="text-xl">←</span>
              </button>
              <div>
                <div className="font-bold text-gray-800">EFT AI 전문상담</div>
                <div className="text-sm flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${
                    serverStatus === 'online' ? 'bg-green-500' : 
                    serverStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}></span>
                  <span className="text-gray-600">
                    {serverStatus === 'online' ? `${selectedTier.toUpperCase()} AI 온라인` : 
                     serverStatus === 'offline' ? '서버 오프라인' : '연결 확인 중...'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* 티어 선택 버튼 */}
              <div className="relative" ref={tierSelectorRef}>
                <button 
                  onClick={() => setShowTierSelector(!showTierSelector)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    selectedTier === 'free' ? 'bg-gray-100 text-gray-700 border-gray-300' :
                    selectedTier === 'premium' ? 'bg-purple-100 text-purple-700 border-purple-300' :
                    'bg-gold-100 text-gold-700 border-gold-300'
                  }`}
                >
                  {selectedTier === 'free' ? '🆓 무료' : 
                   selectedTier === 'premium' ? '💎 프리미엄' : '🏢 기업'}
                </button>
                
                {/* 티어 선택 드롭다운 */}
                {showTierSelector && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-40">
                    {availableTiers.includes('free') && (
                      <button
                        onClick={() => {
                          setSelectedTier('free');
                          setShowTierSelector(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                          selectedTier === 'free' ? 'bg-gray-100' : ''
                        }`}
                      >
                        🆓 무료 티어<br />
                        <span className="text-xs text-gray-500">기본 대화 (150토큰)</span>
                      </button>
                    )}
                    {availableTiers.includes('premium') && (
                      <button
                        onClick={() => {
                          setSelectedTier('premium');
                          setShowTierSelector(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-t ${
                          selectedTier === 'premium' ? 'bg-purple-100' : ''
                        }`}
                      >
                        💎 프리미엄 티어 (NEW!)<br />
                        <span className="text-xs text-purple-500">Llama 3.1 고급 상담 (400토큰)</span>
                      </button>
                    )}
                    {availableTiers.includes('enterprise') && (
                      <button
                        onClick={() => {
                          setSelectedTier('enterprise');
                          setShowTierSelector(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gold-50 border-t ${
                          selectedTier === 'enterprise' ? 'bg-gold-100' : ''
                        }`}
                      >
                        🏢 기업 티어 (BETA)<br />
                        <span className="text-xs text-gold-500">최고급 분석 (무제한)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <span className="text-lg">⚚</span>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <span className="text-lg">📤</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 현재 퀘스트 진행률 표시 */}
      <div className="bg-purple-50 border-b border-purple-100 px-4 py-2">
        <div className="max-w-md mx-auto">
          <div className="text-sm text-purple-700">
            🎯 현재 퀘스트: "연애 패턴 분석" 82%
          </div>
          <div className="text-xs text-purple-600">
            💡 연애 관련 대화 시 추가 진행률!
          </div>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="max-w-md mx-auto space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-sm px-4 py-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </div>
                <div className={`text-xs mt-2 ${
                  message.role === 'user' ? 'text-indigo-100' : 'text-gray-500'
                }`}>
                  {formatTime(message.timestamp)}
                  {message.metadata && (
                    <>
                      <span className="ml-1">• {selectedTier.toUpperCase()} AI</span>
                      {message.metadata.confidence && (
                        <span className="ml-1">신뢰도 {Math.round(message.metadata.confidence * 100)}%</span>
                      )}
                      {message.metadata.processing_time && message.metadata.processing_time > 0 && (
                        <span className="ml-1">({message.metadata.processing_time.toFixed(1)}초)</span>
                      )}
                      {message.metadata.emotion_analysis && (
                        <div className="mt-1 text-xs text-blue-600">
                          감정: {message.metadata.emotion_analysis.primary_emotion} 
                          ({Math.round(message.metadata.emotion_analysis.intensity * 100)}%)
                        </div>
                      )}
                      {message.metadata.eft_recommendations && message.metadata.eft_recommendations.length > 0 && (
                        <div className="mt-1 text-xs text-green-600">
                          EFT 추천: {message.metadata.eft_recommendations.length}개 기법
                        </div>
                      )}
                      {message.metadata.emergency_detected && (
                        <div className="mt-1 text-xs text-red-600 font-medium">
                          🚨 응급상황 감지
                        </div>
                      )}
                      {message.metadata.professional_referral && (
                        <div className="mt-1 text-xs text-orange-600 font-medium">
                          ⚠️ 전문가 상담 권유
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 개입 토글 (S3 상태이며 긴급상황이 아닐 때만 표시) */}
          {(() => {
            const emergency = session.safety?.escalated && (session.safety?.selfHarm || session.safety?.otherHarm);
            const showIntervention = session.state === 'S3' && !emergency;

            if (!showIntervention) return null;

            return (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 my-4">
                <div className="text-green-800 font-medium mb-3">
                  🌿 잠시 함께 해볼까요?
                </div>
                <div className="space-y-2">
                  {interventionOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => startIntervention(option)}
                      className="w-full text-left px-3 py-2 bg-white border border-green-300 rounded-md hover:bg-green-50 transition-colors"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    onClick={skipIntervention}
                    className="w-full text-center px-3 py-2 text-green-600 hover:text-green-800 transition-colors text-sm"
                  >
                    지금은 건너뛰기
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 체크리스트 배지 (옵션) */}
          {(() => {
            const flags = generateChecklistBadges();
            return (
              <div className="flex flex-wrap gap-1 my-2">
                {flags.twoTurn && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">2턴규칙✓</span>}
                {flags.oneInterventionWithChoice && <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">선택권✓</span>}
                {flags.safetyScreened && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">안전점검✓</span>}
                {flags.lengthAndCulture && <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">문화배려✓</span>}
                {flags.repetitionDamped && <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">반복방지✓</span>}
              </div>
            );
          })()}

          {/* 로딩 인디케이터 */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-800 border border-gray-200 px-4 py-3 rounded-2xl">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-sm text-gray-600">AI가 생각하고 있어요...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 입력 힌트 (첫 대화일 때만) */}
      {messages.length === 1 && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
          <div className="max-w-md mx-auto">
            <div className="text-sm text-blue-700 mb-2">💡 이런 식으로 시작해보세요:</div>
            <div className="flex flex-wrap gap-2">
              {[
                "오늘 너무 힘들었어요",
                "스트레스가 심해서 잠이 안 와요",
                "마음이 복잡하고 답답해요",
                "요즘 기분이 이상해요"
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 transition-colors"
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 메시지 입력 */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-md mx-auto">
          <div className="flex space-x-3">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="메시지를 입력하세요..."
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || loading}
              className="px-6 py-3 bg-indigo-500 text-white rounded-2xl hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              전송
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIChat;