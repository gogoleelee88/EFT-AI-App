import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import { getServerAI } from '../../services/serverAI';
import type { ChatResponse, ConversationMessage, EmotionAnalysis, EFTRecommendation } from '../../types/serverAI';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverAI] = useState(() => getServerAI());
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [selectedTier, setSelectedTier] = useState<AITier>('premium'); // Llama 3.1 사용!
  const [availableTiers, setAvailableTiers] = useState<AITier[]>(['free', 'premium', 'enterprise']);
  const [showTierSelector, setShowTierSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tierSelectorRef = useRef<HTMLDivElement>(null);

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

  // 메시지 목록 자동 스크롤
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 메시지 전송 처리 (새로운 서버 AI 사용)
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: Date.now()
    };

    // 사용자 메시지 추가
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      console.log(`🚀 Engine A/B 병렬 비교 시작 (${selectedTier} 티어):`, userMessage.content);
      
      // Engine A/B 병렬 비교 또는 프리미엄 모델 사용
      let serverResponse: ChatResponse;
      
      if (selectedTier === 'free') {
        // 무료: Engine A/B 병렬 비교 사용
        console.log('🆓 무료 사용자 → Engine A/B 병렬 비교 사용');
        serverResponse = await serverAI.chat(userMessage.content, {
          userId: userId,
          maxTokens: 300,
          temperature: 0.8
        });
      } else if (selectedTier === 'premium') {
        // 프리미엄: Llama 3.1 단독 사용
        console.log('💎 프리미엄 사용자 → Llama 3.1 단독 사용');
        const response = await fetch('http://localhost:8000/api/chat/premium', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: userMessage.content,
            conversation_history: [],
            max_tokens: 400,
            temperature: 0.8,
            include_eft_recommendations: true,
            emergency_check: true,
            user_profile: {
              user_id: userId,
              eft_experience_level: "beginner",
              communication_style: "empathetic"
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`프리미엄 API 호출 실패: ${response.status}`);
        }
        
        serverResponse = await response.json();
      } else {
        // Enterprise는 premium으로 폴백
        serverResponse = await serverAI.chat(userMessage.content, {
          userId: userId,
          maxTokens: 400,
          temperature: 0.8
        });
      }
      
      // AI 응답에서 프롬프트 부분 제거 (fallback 처리)
      const cleanResponse = (() => {
        const response = serverResponse.response;
        if (response.includes("지금부터 EFT 전문 상담사로서 응답해 주세요:")) {
          return response.split("지금부터 EFT 전문 상담사로서 응답해 주세요:").pop()?.trim() || response;
        }
        return response;
      })();

      const aiMessage: Message = {
        role: 'ai',
        content: cleanResponse,
        timestamp: Date.now(),
        metadata: {
          emotion_analysis: serverResponse.emotion_analysis,
          eft_recommendations: serverResponse.eft_recommendations,
          confidence: serverResponse.confidence_score,
          processing_time: serverResponse.processing_time,
          emergency_detected: serverResponse.emergency_detected,
          professional_referral: serverResponse.professional_referral
        }
      };

      setMessages(prev => [...prev, aiMessage]);

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
      setIsLoading(false);
    }
  };

  // Enter 키 처리
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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

          {/* 로딩 인디케이터 */}
          {isLoading && (
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
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
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