import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import SUDSModal from '../modals/SUDSModal';
import SUDSInlineCard from '../ui/SUDSInlineCard';
import useEFTSessionHook from '../../hooks/useEFTSessionHook';
import { API_CONFIG } from '../../config/api';
import { getServerAI } from '../../services/serverAI';
import type { ChatResponse, EmotionAnalysis, EFTRecommendation } from '../../types/serverAI';
import type {
  ActionObject,
  ActionType,
  SudsActionPayload,
  BreathGuidePayload,
  GroundingPayload,
  EftRecommendationPayload,
  MoodCheckPayload,
  ResourceOfferPayload,
  ActionHandler,
} from '../../types/actionTypes';
import { recToARParams } from '../../lib/eftAdapter';
import { EftRecButton } from '../eft';
import { recordSuds } from '@/services/serverAI';
import { parseReplyForJson } from './AIChat.utils';
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
  type ConversationSession,
  type ConversationState
} from '../../types/conversationState';
import {
  fsSetTurnSUDS,
  fsSetSessionSUDS,
} from '../../services/fs';

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
    conversationState?: ConversationState;
    turnCount?: number;
    actionResults?: ActionObject[];
  };
}

interface CushionFollowupState {
  remainder: string;
  metadata?: Message['metadata'];
}

interface AIChatProps {
  userId: string;
}

type AITier = 'free' | 'premium' | 'enterprise';

// 🔥 기존 인라인 타입 정의 제거 (actionTypes.ts에서 import)

// turnId 유틸 - zero-pad로 정렬 안정성 확보
const turnIdOf = (n: number) => String(n).padStart(4, '0');

const LONG_RESPONSE_THRESHOLD = 460;
const POSITIVE_FOLLOWUP_REGEX = /(네|넵|좋아요|좋습니다|괜찮아요|계속|더|알려줘|부탁해|응|그래요?)/i;
const NEGATIVE_FOLLOWUP_REGEX = /(아니|않아|안돼|그만|싫|나중|필요없|보류|괜찮(?:으니|습니다만|지만))/i;
const CUSHION_LEAD = '먼저 말씀드리고 싶은 것은';
const CUSHION_ASK = '혹시 괜찮으시다면 이어서 조금 더 자세히 안내해드릴까요?';
const CUSHION_CONTINUE = '그럼 이어서 부드럽게 안내드릴게요.';

// 🔍 안전 파서: 여러 응답 스키마에서 텍스트를 추출
const extractText = (res: any): string => {
  if (!res) return '';

  // OpenAI 호환(vLLM)
  const c = res?.choices?.[0];
  if (c?.message?.content) return String(c.message.content);
  if (c?.text) return String(c.text);

  // 백엔드 커스텀
  if (res?.text) return String(res.text);
  if (res?.response) return String(res.response);

  // 마지막 수단: 평문 변환 (짧게)
  try {
    const s = JSON.stringify(res);
    return s.length > 1000 ? s.slice(0, 1000) + '…' : s;
  } catch {
    return String(res);
  }
};

// 간단 Jaccard 유사도(토큰 단위) - 대략적 내용 유사도 파악
const jaccard = (a: string, b: string): number => {
  const A = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
};

// 길이/유사도/플래그 요약 (예외 안전)
const diffSummary = (legacy: any, shadow: any) => {
  try {
    const legacyText = extractText(legacy);
    const shadowText = extractText(shadow);

    const sim = jaccard(legacyText, shadowText);

    return {
      legacy_length: legacyText.length,
      shadow_length: shadowText.length,
      length_diff: shadowText.length - legacyText.length,
      similarity_jaccard: Number(sim.toFixed(3)),
      shadow_has_actions: Array.isArray(shadow?.actions) && shadow.actions.length > 0,
      // 원시 타입은 값이 아니라 타입 문자열만 주므로 혼동 방지용으로 키명 변경
      legacy_type: typeof legacy,
      shadow_type: typeof shadow,
      // 트러블슈팅을 위해 앞부분만 샘플(로그에서 빠르게 비교)
      legacy_head: legacyText.slice(0, 120),
      shadow_head: shadowText.slice(0, 120),
    };
  } catch (e: any) {
    return { error: e?.message ?? 'diffSummary failed' };
  }
};

// 사용자 알림 유틸 - 접근성 고려한 비블로킹 피드백
const notify = (message: string) => {
  // SSR 가드
  if (typeof document === 'undefined') return;

  // 중복 토스트 방지
  const existing = document.querySelector('[data-toast="true"]');
  if (existing) existing.remove();

  // 임시 토스트 div 생성
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('data-toast', 'true');
  toast.className = `
    fixed top-4 right-4 z-[9999]
    bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg
    animate-[slideIn_0.3s_ease-out] max-w-sm pointer-events-none
    will-change-transform
  `;

  document.body.appendChild(toast);

  // 3초 후 자동 제거
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => {
      if (toast.parentNode) document.body.removeChild(toast);
    }, 300);
  }, 3000);
};

const AIChat: React.FC<AIChatProps> = ({ userId }) => {
  const navigate = useNavigate();

  // 🌍 API 베이스 URL (환경 설정 기반)
  const API_BASE_URL = API_CONFIG.API_BASE_URL.replace(/\/+$/, '');
  const VLLM_ENGINE_B_URL = `${API_CONFIG.VLLM_ENGINE_B_URL.replace(/\/+$/, '')}/v1`;

  // 🎛️ 프리미엄 라우팅 토글 (즉시 롤백 가능)
  const PREMIUM_VIA_BACKEND = String(import.meta.env.VITE_PREMIUM_VIA_BACKEND ?? 'false').toLowerCase() === 'true';

  // 🔍 그림자 테스트 설정 (운영 관측용)
  const SHADOW_TEST = String(import.meta.env.VITE_SHADOW_TEST ?? 'false').toLowerCase() === 'true';
  const VLLM_ENGINE_B_MODEL = import.meta.env.VITE_VLLM_ENGINE_B_MODEL || 'llama-3.1-8b-instruct';

  // 🛡️ 안전 조력자 함수들
  const joinUrl = (base: string, path: string) => {
    const b = (base || '').replace(/\/+$/, '');
    const p = (path || '').replace(/^\/+/, '');
    return `${b}/${p}`;
  };

  const parseRate = (v: any, fallback = 0.2) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  };

  const shouldShadowSample = () =>
    SHADOW_TEST && Math.random() < parseRate(import.meta.env.VITE_SHADOW_SAMPLE_RATE ?? 0.2, 0.2);

  // 섀도 타임아웃 (네트워크 지연 방지)
  async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, ms = 6000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  }

  // EFT 세션 시작 핸들러
  const goAR = (rec: EFTRecommendation) => {
    const params = recToARParams(rec);
    navigate(`/ar-holistic?${params.toString()}`);
  };

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

  // 🎯 액션 핸들러 맵 (확장 용이)
  const handleSuds: ActionHandler<SudsActionPayload> = (p) => setPendingSuds(p);
  const handleBreath: ActionHandler<BreathGuidePayload> = (p) => {
    setPendingBreathGuide(p);
    console.log('호흡 가이드 액션:', p); // TODO: 호흡 가이드 모달 구현
  };
  const handleGrounding: ActionHandler<GroundingPayload> = (p) => {
    setPendingGrounding(p);
    console.log('그라운딩 기법 액션:', p); // TODO: 그라운딩 시트 구현
  };
  const handleEft: ActionHandler<EftRecommendationPayload> = (p) => {
    setPendingEftRecommendation(p);
    console.log('EFT 추천 액션:', p); // TODO: EFT 추천 카드 구현
  };
  const handleMood: ActionHandler<MoodCheckPayload> = (p) => {
    setPendingMoodCheck(p);
    console.log('기분 체크 액션:', p); // TODO: 기분 체크 플로우 구현
  };
  const handleResource: ActionHandler<ResourceOfferPayload> = (p) => {
    setPendingResource(p);
    console.log('리소스 제공 액션:', p); // TODO: 리소스 드로어 구현
  };

  const actionHandlers: Partial<Record<ActionType, ActionHandler<any>>> = {
    SUDS_MEASURE: handleSuds,
    BREATH_GUIDE: handleBreath,
    GROUNDING_54321: handleGrounding,
    EFT_RECOMMENDATION: handleEft,
    MOOD_CHECK: handleMood,
    RESOURCE_OFFER: handleResource,
  };

  // SUDS 모달 상태
  const [showPreSUDS, setShowPreSUDS] = useState(false);
  const [showPostSUDS, setShowPostSUDS] = useState(false);
  const [suds, setSuds] = useState<{ pre?: number; post?: number; preNotes?: string; postNotes?: string }>({});

  // 🔥 액션 상태 관리 (확장 가능)
  const [pendingSuds, setPendingSuds] = useState<SudsActionPayload | null>(null);
  const [localSuds, setLocalSuds] = useState<number | ''>('');
  const [pendingBreathGuide, setPendingBreathGuide] = useState<BreathGuidePayload | null>(null);
  const [pendingGrounding, setPendingGrounding] = useState<GroundingPayload | null>(null);
  const [pendingEftRecommendation, setPendingEftRecommendation] = useState<EftRecommendationPayload | null>(null);
  const [pendingMoodCheck, setPendingMoodCheck] = useState<MoodCheckPayload | null>(null);
  const [pendingResource, setPendingResource] = useState<ResourceOfferPayload | null>(null);
  const [pendingCushionFollowup, setPendingCushionFollowup] = useState<CushionFollowupState | null>(null);
  const [manualEftRequested, setManualEftRequested] = useState(false);

  // 🔥 EFT 세션 훅 통합
  const eftSessionHook = useEFTSessionHook({
    onEFTComplete: (sessionData) => {
      console.log('EFT 세션 완료:', sessionData);
      // 세션 완료 시 Post-SUDS가 자동으로 트리거됨 (onAutoSUDS 콜백)
    },
    onAutoSUDS: (measurementType, context) => {
      console.log('자동 SUDS 측정 트리거:', { measurementType, context });
      // EFT 완료 후 자동 Post-SUDS 표시
      setPendingSuds({
        measurementType,
        prompt: 'EFT 세션을 완료하셨습니다! 이제 세션 후 스트레스 수준을 측정해주세요.',
        context,
        sessionId: session.sessionId,
        turnId: turnIdOf(session.turn)
      });
    }
  });

  // 뒤로가기 핸들러
  const handleGoBack = () => {
    navigate('/');
  };

  const handleManualEFTStart = () => {
    setManualEftRequested(true);
    setShowPreSUDS(true);
  };

  const scheduleARNavigation = (intensity: number) => {
    const goToAR = () => navigate(`/ar-holistic?intensity=${intensity}`);

    if (typeof window === 'undefined') {
      goToAR();
      return;
    }

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(goToAR);
    } else {
      setTimeout(goToAR, 0);
    }
  };

  // 🔍 그림자 테스트: fire-and-forget 비교 (UI 영향 없음)
  const shadowFireAndForget = (message: string, sessionData: any) => {
    if (!shouldShadowSample()) return;

    // 사용자 UX 영향 없도록 비동기 즉시 반환
    (async () => {
      try {
        let legacyRes: any = null;
        let shadowRes: any = null;

        if (PREMIUM_VIA_BACKEND) {
          // 본선: 백엔드 → 그림자: vLLM 직접
          legacyRes = sessionData;

          const url = joinUrl(VLLM_ENGINE_B_URL, '/chat/completions');
          const body = {
            // ⚠️ 모사 정확도: 본선과 동일한 톤/파라미터로 비교
            model: VLLM_ENGINE_B_MODEL,
            temperature: 0.7,
            max_tokens: 400,
            messages: [
              { role: 'system', content: 'EFT 전문 상담사로서 일관된 톤으로 답변하세요.' },
              { role: 'user', content: message },
            ],
            stream: false,
          };

          const shadowResponse = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }, 6000);

          shadowRes = await shadowResponse.json().catch(() => null);

        } else {
          // 본선: vLLM 직접 → 그림자: 백엔드
          legacyRes = sessionData;

          const url = joinUrl(API_BASE_URL, '/chat/premium');

          // 백엔드 스펙과 동일하게 구성
          const payload = {
            message,
            temperature: 0.7,
            max_tokens: 400,
            // 필요한 경우만 세션 메타 전달 (undefined 접근 방지)
            ...(typeof session?.sessionId === 'string' ? { sessionId: session.sessionId } : {}),
            ...(userId ? { userId } : {}),
            tier: 'premium',
          };

          const shadowResponse = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': import.meta.env.VITE_API_KEY ?? '',
            },
            credentials: 'include',
            body: JSON.stringify(payload),
          }, 6000);

          shadowRes = await shadowResponse.json().catch(() => null);
        }

        const summary = diffSummary(legacyRes, shadowRes);
        // eslint-disable-next-line no-console
        console.debug('[SHADOW-COMPARE]', {
          ts: new Date().toISOString(),
          premium_via_backend: PREMIUM_VIA_BACKEND,
          message_length: Array.from(message).length, // 한글 안전 길이
          ...summary,
        });

        // 서버 수집 (선택)
        // await fetch(joinUrl(API_BASE_URL, '/metrics/shadow'), {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ summary, message_len: Array.from(message).length }),
        // }).catch(() => {});

      } catch (e) {
        // 조용히 실패 무시
        // eslint-disable-next-line no-console
        console.debug('[SHADOW-COMPARE] skipped', e);
      }
    })();
  };

  // 퀘스트 진행률 업데이트 (로컬 처리)
  const handleQuestProgress = (questId: string, progress: number) => {
    console.log(`퀘스트 진행: ${questId} +${progress}%`);
    // TODO: localStorage나 Context API로 퀘스트 진행률 저장
  };

  // 서버 상태 체크 및 초기화 (Engine A/B 시스템)
  useEffect(() => {
    const initializeAI = async () => {
      if (typeof window === 'undefined') return;

      try {
        const healthStatus = await serverAI.checkServerStatus();
        const isHealthy = healthStatus.status !== 'offline';

        setServerStatus(isHealthy ? 'online' : 'offline');
        setAvailableTiers(['free', 'premium', 'enterprise']);
        setSelectedTier('free');

        const initialMessage: Message = isHealthy
          ? {
              role: 'ai',
              content:
                "안녕하세요! 저는 EFT 전문 AI 상담사입니다. 🌿\n\n🚀 **Engine A/B 병렬 비교 시스템 활성화!**\n- 🆓 무료: Llama-3 vs Qwen-2.5 병렬 비교\n- 💎 프리미엄: Llama 3.1 최고급 모델\n\n두 최신 AI 모델이 동시에 응답하여 더 나은 답변을 제공합니다!\n\n오늘은 어떤 마음으로 찾아오셨나요? 편안하게 이야기해 주세요.",
              timestamp: Date.now(),
              metadata: {
                confidence: 1.0,
                processing_time: 0,
              },
            }
          : {
              role: 'ai',
              content:
                '안녕하세요! GPU 이사 작업으로 인해 현재 AI 대화 서비스가 일시 중단되었습니다. 12월 13일 경 정상화될 예정이니 양해 부탁드립니다.',
              timestamp: Date.now(),
              metadata: {
                confidence: 0.6,
                processing_time: 0,
              },
            };

        setMessages([initialMessage]);
      } catch (error) {
        console.error('서버 초기화 실패:', error);
        setServerStatus('offline');

        const errorMessage: Message = {
          role: 'ai',
          content:
            '안녕하세요! 현재 AI 서버와 통신하는 데 어려움이 있습니다. 잠시 후 다시 시도해 주시겠어요? 문제가 지속되면 담당자에게 문의해주세요.',
          timestamp: Date.now(),
          metadata: { confidence: 0.4 },
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

  // localStorage 초기화 (세션 ID 영속성 보장)
  useEffect(() => {
    try {
      if (!localStorage.getItem('eft.sess.id') && session?.sessionId) {
        localStorage.setItem('eft.sess.id', session.sessionId);
      }
    } catch {
      /* storage 불가 환경은 무시 */
    }
  }, [session?.sessionId]);

  // 🔄 AR 세션 컨텍스트 복원 (마운트 시 1회)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const sidFromLs = localStorage.getItem('eft.sess.id');
      const sidFromUrl = new URLSearchParams(window.location.search).get('sid') || '';
      const sid = sidFromLs || session?.sessionId || sidFromUrl;
      if (!sid) return;

      const ctxKey = `chat.ctx/${sid}`;
      const savedCtx = sessionStorage.getItem(ctxKey);
      if (!savedCtx) return;

      const ctx = JSON.parse(savedCtx);
      if (Array.isArray(ctx.conversationHistory) && ctx.conversationHistory.length > 0) {
        setMessages(ctx.conversationHistory);
        console.info(`🔄 대화 컨텍스트 복원 완료 (${ctx.conversationHistory.length}개)`);
        sessionStorage.removeItem(ctxKey);
      }
    } catch (err) {
      console.info('🔄 컨텍스트 복원 실패 (무시)', err);
    }
  }, []);

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

  // 🧾 SUDS 입력 배너 노출 감지
  useEffect(() => {
    if (pendingSuds) {
      console.info('📝 SUDS 입력 대기 배너 노출', pendingSuds);
    }
  }, [pendingSuds]);

  // S3 진입 시 사전 SUDS 모달 띄우기
  useEffect(() => {
    if (session.state === 'S3' && suds.pre == null) {
      setShowPreSUDS(true);
    }
  }, [session.state, suds.pre]);

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

  // 🎬 액션 토큰 핸들러 (백엔드 응답의 actions 배열 처리)
  function handleActionTokens(actions: any[]) {
    try {
      if (!Array.isArray(actions) || actions.length === 0) return;
      console.log('🎬 액션 토큰 수신:', actions);

      for (const a of actions) {
        const t = typeof a?.type === 'string' ? a.type.trim() : '';
        const payload = a?.payload ?? {};
        if (!t) {
          console.warn('⚠️ 액션 타입 누락/비정상:', a);
          continue;
        }

        if (t === 'ask_suds') {
          const mtRaw = payload?.measurement_type ?? payload?.measurementType ?? 'check';
          const allowed: Array<'pre' | 'post' | 'check'> = ['pre', 'post', 'check'];
          const mt = allowed.includes(mtRaw) ? (mtRaw as 'pre' | 'post' | 'check') : 'check';
          const prompt = payload?.title ?? payload?.message ?? payload?.prompt ?? 'SUDS 측정을 시작합니다.';
          const context = payload?.context ?? payload?.detected_by ?? '';
          setPendingSuds({
            measurementType: mt,
            prompt,
            context,
            sessionId: session.sessionId,
            turnId: turnIdOf(session.turn)
          });
          console.info('🧪 ask_suds 예약:', payload);
          continue;
        }

        if (t === 'recommend_eft' || t === 'suggest_eft') {
          console.info('👉 EFT 제안 액션 수신:', payload);

          // 🔍 ask_suds가 있는지 확인 - SUDS 측정이 필요하면 AR 이동 보류
          const hasAskSuds = actions.some(a => a?.type === 'ask_suds');

          if (hasAskSuds) {
            console.info('⏸️ ask_suds가 있어서 AR 이동 보류 (SUDS 측정 후 start_eftar로 이동)');
            continue;
          }

          try {
            const intensity = typeof payload?.intensity === 'number'
              ? Number(payload.intensity)
              : typeof payload?.suds === 'number'
                ? Number(payload.suds)
                : 6;
            scheduleARNavigation(Number.isFinite(intensity) ? intensity : 6);
          } catch (navErr) {
            console.warn('⚠️ EFT 제안 처리 오류:', navErr);
          }
          continue;
        }

        if (t === 'start_eftar') {
          const route = payload?.route ?? '/eftar';
          const script = payload?.script ?? 'standard_relief';
          const sudsValue = payload?.suds;
          const params = new URLSearchParams({ script: String(script) });
          if (sudsValue != null && !Number.isNaN(Number(sudsValue))) {
            params.set('suds', String(sudsValue));
          }
          console.info('🚀 start_eftar 액션 수신:', payload);
          navigate(`${route}?${params.toString()}`);
          console.log('✅ actions received → banner rendered → route changed');
          console.log('✅ Full EFT Loop: emotion→EFT suggestion→SUDS→EFT AR confirmed.');
          continue;
        }

        if (t === 'start_breath_page' || t === 'start_breath_meditation') {
          const route = payload?.route ?? '/tri-modal';
          const sudsValue = payload?.suds;
          const rationale = payload?.rationale ?? '';
          const params = new URLSearchParams();
          if (sudsValue != null && !Number.isNaN(Number(sudsValue))) {
            params.set('suds', String(sudsValue));
          }
          console.info('🧘 start_breath_page 액션 수신:', payload);
          console.log('📊 분기 근거:', rationale);
          navigate(`${route}${params.toString() ? '?' + params.toString() : ''}`);
          console.log('✅ Breath Meditation Loop: emotion→SUDS→Breath Meditation confirmed.');
          continue;
        }

        console.log('ℹ️ 미지원 액션 타입:', t);
      }
    } catch (err) {
      console.warn('⚠️ handleActionTokens 오류 (무시):', err);
    }
  }

  // Qwen 호출 파이프라인 (상태머신 순서 준수)
  const onSend = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed || loading) return;

    // 1) 사용자 입력 도착 - 핵심명사 추출 및 상태 전이
    onUserMessage(session, trimmed);

    const userMessage: Message = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');

    const followup = pendingCushionFollowup;
    const wantsMore = followup ? POSITIVE_FOLLOWUP_REGEX.test(trimmed) : false;
    const declinesMore = followup ? NEGATIVE_FOLLOWUP_REGEX.test(trimmed) : false;

    if (followup && (wantsMore || declinesMore)) {
      setPendingCushionFollowup(null);

      const followupMessage: Message = wantsMore
        ? {
            role: 'ai',
            content: `${CUSHION_CONTINUE} ${followup.remainder}`.trim(),
            timestamp: Date.now(),
            metadata: {
              ...followup.metadata,
              confidence: followup.metadata?.confidence ?? 0.85,
            },
          }
        : {
            role: 'ai',
            content: '알겠습니다. 필요하실 때 언제든지 더 이어서 말씀드릴게요.',
            timestamp: Date.now(),
            metadata: {
              ...followup.metadata,
              confidence: followup.metadata?.confidence ?? 0.8,
            },
          };

      setMessages(prev => [...prev, followupMessage]);
      return;
    }

    setPendingCushionFollowup(null);
    setLoading(true);

    try {
      // 2) 엔진 응답 생성 후(확정 직전) 상태 정책 적용
      enforceTwoTurnRule(session);

      // 슬롯 추출 (보조)
      const slots = extractSlotsFrom(trimmed);

      // 시스템 프롬프트 구성 (+ 슬롯 JSON)
      const systemWithSlots = SYSTEM_PROMPT + `\n[슬롯]\n${JSON.stringify(slots)}`;

      // Qwen 호출 (기존 서버 래퍼 사용)
      console.log(`🚀 Qwen 호출 시작 (${selectedTier} 티어, 상태: ${session.state}, 턴: ${session.turn}):`, trimmed);

      let serverResponse: ChatResponse;

      if (selectedTier === 'free') {
        // 무료: 기존 Engine A/B 사용
        serverResponse = await serverAI.chat(trimmed, {
          userId: userId,
          maxTokens: 300,
          temperature: 0.4
        });
      } else {
        // 🎛️ 프리미엄: 토글 기반 라우팅 (즉시 롤백 가능)
        if (PREMIUM_VIA_BACKEND) {
          // 경로 1: 백엔드 경유 (/api/chat/premium)
          const payload = {
            message: trimmed,
            temperature: 0.7,
            max_tokens: 700,
            ...(session?.sessionId ? { sessionId: session.sessionId } : {}),
            ...(userId ? { userId } : {}),
            tier: 'premium',
          };

          const response = await fetch(joinUrl(API_BASE_URL, '/chat/premium'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': import.meta.env.VITE_API_KEY ?? '',
            },
            credentials: 'include',
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`백엔드 프리미엄 API 호출 실패: ${response.status}`);
          }

          serverResponse = await response.json();

        } else {
          // 경로 2: vLLM 직접 호출 (기존 경로)
          const response = await fetch(joinUrl(VLLM_ENGINE_B_URL, '/chat/completions'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer EMPTY'
            },
            body: JSON.stringify({
              model: VLLM_ENGINE_B_MODEL,
              temperature: 0.4,
              max_tokens: 700,
              messages: [
                { role: 'system', content: systemWithSlots },
              { role: 'user', content: trimmed }
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
            emotion_analysis: { primary_emotion: 'unknown', intensity: 0.5, confidence: 0.5, triggers: [] },
            eft_recommendations: [],
            confidence_score: 0.8,
            processing_time: 0,
            emergency_detected: false,
            professional_referral: false
          };
        }

        // 🔍 그림자 테스트 (비동기, UI 영향 없음)
        shadowFireAndForget(trimmed, serverResponse);
      }
      
      // 🔥 3) 백엔드 응답 파싱 (Intake JSON, Notion Record JSON, UI Action JSON 추출)
      const originalReply = serverResponse.response ?? '';

      // 🎯 새로운 5단계 시스템: JSON 파싱 (유틸 함수 사용)
      const { intake: intakeData, notion: notionRecordData, action: uiActionData, cleanedReply } = parseReplyForJson(originalReply);
      let reply = cleanedReply;

      // Notion Record JSON 처리 (추후 Notion API 전송)
      if (notionRecordData) {
        // TODO: Notion API로 전송
        console.log('📝 Notion Record 준비됨:', notionRecordData);
      }

      // ✅ 우선순위 역전: UI_ACTION_JSON이 있으면 즉시 실행하고 종료
      if (uiActionData) {
        const { action, route, suds, rationale } = uiActionData;
        if (action === 'start_eftar') {
          const params = new URLSearchParams({ script: 'standard_relief' });
          if (suds != null) params.set('suds', String(suds));
          console.info('🚀 start_eftar(우선 실행):', { suds, rationale });
          navigate(`${route}?${params.toString()}`);
          console.log('✅ EFT Loop: emotion→SUDS→EFT AR (UI_ACTION_JSON 우선)');
          return; // ← actions[] 처리 스킵
        } else if (action === 'start_breath_page') {
          const params = new URLSearchParams();
          if (suds != null) params.set('suds', String(suds));
          console.info('🧘 start_breath_page(우선 실행):', { suds, rationale });
          navigate(`${route}${params.toString() ? '?' + params.toString() : ''}`);
          console.log('✅ Breath Loop: emotion→SUDS→Breath (UI_ACTION_JSON 우선)');
          return; // ← actions[] 처리 스킵
        }
      }

      // ⬇️ UI_ACTION_JSON이 없을 때만 MSW/백엔드 actions[] 후순위로 처리
      const actionResults = serverResponse.actions ?? [];



      // 🎬 액션 토큰 처리 (ask_suds, recommend_eft 등)
      handleActionTokens(actionResults);

      // 🎯 액션 타입별 라우팅 시스템 (핸들러 맵 기반 - 확장 용이)
      actionResults.forEach((action: any) => {
        const handler = actionHandlers[action?.type as ActionType];
        if (!handler || !action?.payload) {
          return;
        }
        try {
          handler(action.payload);
        } catch (error) {
          console.error(`액션 처리 오류 (${action.type}):`, error);
        }
      });

      // 3-1. 문맥 복원 ("로 힘드시겠어요" → "잠으로 힘드시겠어요")
      reply = sanitizeAssistantText(session, reply);

      // 3-2. 안전성 검사 (위험 키워드 감지 + 안전 안내)
      reply = applySafetyCheck(session, trimmed, reply);

      // 3-3. 반복 방지 적용 (24시간 캐시)
      reply = dampenRepetition(session, reply);

      // 3-4. 길이 제한 강제 (400-800자)
      reply = enforceLength(reply);

      // UI 반영 (2단락 보장)
      const paragraphs = ensureTwoParagraphs(reply);
      let finalContent = paragraphs.join('\n\n');
      let followupState: CushionFollowupState | null = null;

      const baseMetadata: Message['metadata'] = {
        emotion_analysis: serverResponse.emotion_analysis,
        eft_recommendations: serverResponse.eft_recommendations,
        confidence: serverResponse.confidence_score,
        processing_time: serverResponse.processing_time,
        emergency_detected: serverResponse.emergency_detected,
        professional_referral: serverResponse.professional_referral,
        conversationState: session.state,
        turnCount: session.turn,
        actionResults,
      };

      if (finalContent.length >= LONG_RESPONSE_THRESHOLD && paragraphs.length >= 2) {
        const [firstParagraph, ...restParagraphs] = paragraphs;
        const restContent = restParagraphs.join('\n\n').trim();
        const leadParagraph = firstParagraph.trim().startsWith(CUSHION_LEAD)
          ? firstParagraph.trim()
          : `${CUSHION_LEAD}, ${firstParagraph.trim()}`;

        if (restContent) {
          finalContent = `${leadParagraph}\n\n${CUSHION_ASK}`;
          followupState = {
            remainder: restContent,
            metadata: baseMetadata,
          };
        } else {
          finalContent = leadParagraph;
        }
      }

      const aiMessage: Message = {
        role: 'ai',
        content: finalContent,
        timestamp: Date.now(),
        metadata: baseMetadata,
      };

      setMessages(prev => [...prev, aiMessage]);
      setPendingCushionFollowup(followupState);

      // 4) 메시지 렌더링 & turn 카운트 증가 (응답 확정 후)
      session.turn += 1;
      setSession({ ...session }); // 세션 상태 저장

      console.log(`✅ 파이프라인 완료 - 상태: ${session.state}, 턴: ${session.turn}`);

      // S3 상태에서 메시지 전송 시 사후 SUDS 모달 띄우기
      if (session.state === 'S3' && suds.pre != null && suds.post == null) {
        setShowPostSUDS(true);
      }

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

  const submitSudsScore = async (score: number, measurementType: 'pre' | 'post' | 'check') => {
    const res = await recordSuds({
      score,
      source: 'compare',
    });

    if (!res || !res.ok) {
      console.warn('⚠️ SUDS 제출 실패', res);
      return false;
    }

    console.info('✅ SUDS 제출 성공', { measurementType, res });

    // (신규) /suds 응답 본문에서 S4 JSON(Record/Action) 파싱 → 즉시 라우팅
    // 🛡️ 방어 코드: 여러 필드 후보 탐색
    const reply =
      res?.response ??         // 표준
      res?.res?.response ??    // 래핑
      res?.body ??             // 혹시 body
      res?.text ??             // 혹시 text
      '';

    if (!reply) {
      console.warn('⚠️ /suds 응답에 response 본문이 없습니다:', res);
    } else {
      try {
        const notionMatch   = reply.match(/\[?NOTION[_\s]RECORD[_\s]JSON\]?\s*(\{[\s\S]*?\})/i);
        const uiActionMatch = reply.match(/\[?UI[_\s]ACTION[_\s]JSON\]?\s*(\{[\s\S]*?\})/i);

        if (notionMatch) {
          const record = JSON.parse(notionMatch[1]);
          console.log('📝 (SUDS) Notion Record JSON 추출:', record);
          // TODO: 필요 시 Notion 전송
        }

        if (uiActionMatch) {
          const actionObj = JSON.parse(uiActionMatch[1]);
          console.log('🚀 (SUDS) UI Action JSON 추출:', actionObj);

          const { action, route, suds, rationale } = actionObj;
          const params = new URLSearchParams();
          if (suds != null) params.set('suds', String(suds));
          if (action === 'start_eftar') params.set('script', 'standard_relief');

          navigate(`${route}${params.toString() ? `?${params.toString()}` : ''}`);
          return true; // ✅ UI_ACTION_JSON 처리 성공 시, actions[]는 스킵
        } else {
          console.warn('⚠️ (SUDS) UI_ACTION_JSON 블록이 없습니다. reply=', reply);
        }
      } catch (e) {
        console.warn('⚠️ (SUDS) JSON 파싱 실패:', e, 'reply=', reply);
      }
    }

    // 기존 actions 배열 처리 (UI_ACTION_JSON이 없을 때 폴백)
    if (Array.isArray(res.actions) && res.actions.length > 0) {
      console.log('🎯 suds.record actions:', res.actions);
      handleActionTokens(res.actions);
    }

    return true;
  };

  // 🧾 SUDS 배너 제출 핸들러
  const handleSubmitSuds = async () => {
    if (typeof window === 'undefined') return;
    if (!pendingSuds) return;

    const value = typeof localSuds === 'string' ? Number.NaN : localSuds;
    if (!Number.isInteger(value) || value < 0 || value > 10) {
      console.warn('⚠️ SUDS 제출 실패', '유효하지 않은 점수 값:', localSuds);
      return;
    }

    const measurementType = pendingSuds.measurementType ?? 'check';
    const ok = await submitSudsScore(value, measurementType);
    if (!ok) {
      return;
    }

    setPendingSuds(null);
    setLocalSuds('');

  };

  // 🔥 SUDS 인라인 카드 제출 핸들러
  const handleSudsSubmit = async (score: number) => {
    if (!pendingSuds) return;

    const sessionId = session.sessionId;
    const canPersistToBackend = typeof sessionId === 'string' && sessionId.length > 0;
    const turnId = pendingSuds.turnId ?? `ui_${Date.now()}`;
    const { measurementType = 'check', context } = pendingSuds;

    const ok = await submitSudsScore(score, measurementType);
    if (!ok) {
      return;
    }

    try {
      if (canPersistToBackend) {
        const sudsUrl = joinUrl(API_BASE_URL, `/api/memory/${sessionId}/suds`);
        const response = await fetch(sudsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            measurement_type: measurementType,
            suds_value: score,
            turn_id: turnId,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`SUDS 기록 실패: ${response.status} ${response.statusText} ${errorText}`.trim());
        }

        console.log('SUDS 점수 기록 완료:', {
          sessionId,
          measurementType,
          score,
          context,
        });
      } else {
        console.log('SUDS 점수 로컬 처리: 세션 ID가 없어 백엔드 저장을 건너뜁니다.', {
          measurementType,
          score,
          context,
          turnId,
        });
      }

      setPendingSuds(null);

      if (context?.includes('eft_complete')) {
        eftSessionHook.completeEFTSession();
      }

      if (canPersistToBackend && import.meta.env.VITE_DEBUG_MODE === 'true') {
        try {
          const statsUrl = joinUrl(API_BASE_URL, `/api/memory/${sessionId}/stats`);
          const statsResponse = await fetch(statsUrl);
          if (statsResponse.ok) {
            const stats = await statsResponse.json();
            console.log('메모리 통계:', stats);
          }
        } catch (error) {
          console.log('메모리 통계 조회 실패:', error);
        }
      }
    } catch (error) {
      console.error('SUDS 제출 오류:', error);
      notify('SUDS 점수 기록 중 오류가 발생했습니다. 계속 진행하셔도 괜찮아요.');

      setPendingSuds(null);

      const fallbackMessage: Message = {
        role: 'ai',
        content: '점수 저장이 잠시 지연되고 있지만, 진행에는 영향이 없어요. 편안한 호흡을 이어가 볼까요?',
        timestamp: Date.now(),
        metadata: { confidence: 0.6 }
      };
      setMessages(prev => [...prev, fallbackMessage]);
    }
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
      {/* 🧾 SUDS 입력 배너 */}
      {pendingSuds && (
        <div
          role="region"
          aria-label="SUDS 입력 배너"
          className="w-full bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 mb-2 rounded-md flex items-center gap-2"
        >
          <span className="text-sm font-medium">
            SUDS {pendingSuds.measurementType ?? 'check'} 점수 선택
          </span>
          <select
            aria-label="SUDS 점수 선택"
            className="border rounded px-2 py-1 text-sm"
            value={localSuds === '' ? '' : String(localSuds)}
            onChange={(e) => {
              const v = e.target.value === '' ? '' : Number(e.target.value);
              setLocalSuds(v as number | '');
            }}
          >
            <option value="">선택</option>
            {Array.from({ length: 11 }).map((_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-sm px-3 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            onClick={handleSubmitSuds}
            disabled={localSuds === '' || Number.isNaN(localSuds as number)}
          >
            저장
          </button>
        </div>
      )}

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
                    {serverStatus === 'online'
                      ? `${selectedTier.toUpperCase()} AI 온라인`
                      : serverStatus === 'offline'
                        ? '서버 오프라인'
                        : '연결 확인 중…'}
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
                <span className="text-lg">ⓘ</span>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <span className="text-lg">⋯</span>
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
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="text-xs text-green-700">
                            AI가 EFT 세션을 제안했어요: {message.metadata.eft_recommendations.length}개
                          </div>

                          {/* 추천 카드/버튼 리스트 */}
                          <div className="flex flex-wrap gap-2">
                            {message.metadata.eft_recommendations
                              .slice(0, 3)
                              .map((rec: EFTRecommendation, i: number) => (
                                <EftRecButton key={i} rec={rec} index={i} onStart={goAR} />
                              ))}
                          </div>

                          {/* 3개 초과 시 선택 UX (선택사항) */}
                          {message.metadata.eft_recommendations.length > 3 && (
                            <div className="text-xs">
                              <button
                                type="button"
                                className="underline underline-offset-2 hover:opacity-80 text-green-600"
                                onClick={() => {
                                  // TODO: '모두 보기' 모달 or 별도 페이지로 이동
                                  console.log('추천 더 보기:', message.metadata?.eft_recommendations);
                                }}
                              >
                                추천 더 보기 ({message.metadata.eft_recommendations.length - 3}개)
                              </button>
                            </div>
                          )}
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
                {flags.twoTurn && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                    2턴규칙✓
                  </span>
                )}
                {flags.oneInterventionWithChoice && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                    선택권✓
                  </span>
                )}
                {flags.safetyScreened && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                    안전스크리닝✓
                  </span>
                )}
                {flags.lengthAndCulture && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                    문화배려✓
                  </span>
                )}
                {flags.repetitionDamped && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    반복방지✓
                  </span>
                )}
              </div>
            );
          })()}

          {/* 🔥 SUDS 인라인 카드 */}
          {pendingSuds && (
            <div className="flex justify-center my-4">
              <div className="w-full max-w-sm">
                <SUDSInlineCard
                  measurementType={pendingSuds.measurementType}
                  prompt={pendingSuds.prompt}
                  context={pendingSuds.context}
                  onSudsSubmit={handleSudsSubmit}
                />
              </div>
            </div>
          )}

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

      <button
        type="button"
        onClick={handleManualEFTStart}
        disabled={manualEftRequested || showPreSUDS || showPostSUDS}
        className={`fixed bottom-28 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-colors ${
          manualEftRequested || showPreSUDS || showPostSUDS
            ? 'bg-emerald-300 text-white cursor-not-allowed'
            : 'bg-emerald-500 text-white hover:bg-emerald-600'
        }`}
        aria-label="지금 EFT 진행해보기"
      >
        <span>지금 EFT 진행해보기</span>
        <span aria-hidden="true">🪄</span>
      </button>

      {/* SUDS 모달들 */}
      <SUDSModal
        open={showPreSUDS}
        label="pre"
        onSubmit={async (rating) => {
          const manualLaunch = manualEftRequested;
          const sessionStateAtSubmit = session.state;
          const turnCountAtSubmit = session.turn;

          try {
            setSuds(s => ({ ...s, pre: rating }));
            setShowPreSUDS(false);

            const { sessionId, turn } = session;
            const canPersistToFirestore = Boolean(sessionId) && turn > 0;
            const turnId = turnIdOf(turn);

            if (canPersistToFirestore) {
              try {
                await fsSetTurnSUDS(sessionId, turnId, { sudsPre: rating });
                await fsSetSessionSUDS(sessionId, { pre: rating });
                console.log('사전 SUDS 저장 완료:', { sessionId, turnId, sudsPre: rating });
              } catch (error) {
                console.error('사전 SUDS 저장 실패 (무시하고 진행):', error);
                notify('점수 저장이 지연되고 있지만 세션은 계속 진행할 수 있어요.');
              }
            } else {
              console.log('Firestore SUDS 저장 스킵: 세션 식별자 또는 턴 정보가 부족합니다.', {
                sessionId,
                turn,
              });
            }

            if (manualLaunch) {
              setManualEftRequested(false);

              const acknowledgement: Message = {
                role: 'ai',
                content: '살짝 숨을 고르셨다면, 이제 AR 가이드로 편안하게 이어가실 수 있도록 도와드릴게요.',
                timestamp: Date.now(),
                metadata: {
                  confidence: 0.9,
                  conversationState: sessionStateAtSubmit,
                  turnCount: turnCountAtSubmit,
                },
              };

              setMessages(prev => [...prev, acknowledgement]);

              try {
                eftSessionHook.startEFTSession('ar_holistic', rating);
              } catch (error) {
                console.warn('EFT 세션 시작 기록 실패(무시):', error);
              }

              scheduleARNavigation(rating);
              const goToAR = () => navigate(`/ar-holistic?intensity=${rating}`);
              if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(goToAR);
              } else {
                setTimeout(goToAR, 0);
              }
            } else {
              // EFT 개입 시작 메시지 자동 전송
              setTimeout(() => {
                onSend('이제 함께 EFT 세션을 진행해보겠습니다. 준비되셨나요?');
              }, 1000);
            }
          } catch (error) {
            console.error('사전 SUDS 처리 실패:', error);
            notify('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
            setShowPreSUDS(true);
            if (manualLaunch) {
              setManualEftRequested(true);
            }
          }
        }}
        onClose={() => {
          setShowPreSUDS(false);
          setManualEftRequested(false);
        }}
        currentValue={suds.pre}
      />

      <SUDSModal
        open={showPostSUDS}
        label="post"
        onSubmit={async (rating) => {
          const preSafe = suds.pre ?? 5;
          const delta = preSafe - rating;

          setSuds(s => ({ ...s, post: rating }));
          setShowPostSUDS(false);

          const { sessionId, turn } = session;
          const canPersistToFirestore = Boolean(sessionId) && turn > 0;
          const turnId = turnIdOf(turn);

          if (canPersistToFirestore) {
            try {
              await Promise.all([
                fsSetTurnSUDS(sessionId, turnId, { sudsPost: rating }),
                fsSetSessionSUDS(sessionId, {
                  ...(preSafe !== undefined ? { pre: preSafe } : {}),
                  post: rating
                })
              ]);

              console.log('사후 SUDS 저장 완료:', {
                sessionId,
                turnId,
                pre: preSafe,
                post: rating,
                sudsDelta: delta
              });
            } catch (error) {
              console.error('사후 SUDS 저장 실패 (무시하고 진행):', error);
              notify('점수 저장이 지연되고 있지만 다음 단계로 계속 진행할게요.');
            }
          } else {
            console.log('Firestore SUDS 저장 스킵: 세션 식별자 또는 턴 정보가 부족합니다.', {
              sessionId,
              turn,
            });
          }

          // S4로 전환
          setSession(prev => ({ ...prev, state: 'S4' }));

          // 개선 결과에 따른 피드백 메시지 자동 전송
          setTimeout(() => {
            if (delta > 2) {
              onSend(`정말 좋아졌네요! ${delta}점이나 개선되었습니다. 어떤 부분이 가장 도움이 되었나요?`);
            } else if (delta > 0) {
              onSend(`조금이나마 나아지셨군요. ${delta}점 개선되었습니다. 계속 이어서 해볼까요?`);
            } else {
              onSend('아직 큰 변화는 느끼지 못하시는군요. 괜찮습니다. 다른 방법을 함께 시도해보죠.');
            }
          }, 1500);
        }}
        onClose={() => setShowPostSUDS(false)}
        currentValue={suds.post}
      />
    </div>
  );
};

export default AIChat;