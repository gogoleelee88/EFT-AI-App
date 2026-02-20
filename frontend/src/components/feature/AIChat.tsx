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
import AlarmInstallGuide from './AlarmInstallGuide';
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
  userId?: string;
}

type AITier = 'free' | 'premium' | 'enterprise';

// ?뵦 湲곗〈 ?몃씪??????뺤쓽 ?쒓굅 (actionTypes.ts?먯꽌 import)

// turnId ?좏떥 - zero-pad濡??뺣젹 ?덉젙???뺣낫
const turnIdOf = (n: number) => String(n).padStart(4, '0');

const LONG_RESPONSE_THRESHOLD = 460;
const ALARM_KEYWORD_REGEX = /?뚮엺|?뚮┝|由щ쭏?몃뜑|?뚮┝?ㅼ젙|?뚮┝ ?ㅼ젙|誘몃━?뚮┝|?몄떆|alarm|remind|reminder|notification/i;
const POSITIVE_FOLLOWUP_REGEX = /(????醫뗭븘??醫뗭뒿?덈떎|愿쒖갖?꾩슂|怨꾩냽|???뚮젮以?遺?곹빐|??洹몃옒??)/i;
const NEGATIVE_FOLLOWUP_REGEX = /(?꾨땲|?딆븘|?덈뤌|洹몃쭔|???섏쨷|?꾩슂??蹂대쪟|愿쒖갖(?:?쇰땲|?듬땲?ㅻ쭔|吏留?)/i;
const CUSHION_LEAD = '癒쇱? 留먯??쒕━怨??띠? 寃껋?';
const CUSHION_ASK = '?뱀떆 愿쒖갖?쇱떆?ㅻ㈃ ?댁뼱??議곌툑 ???먯꽭???덈궡?대뱶由닿퉴??';
const CUSHION_CONTINUE = '洹몃읆 ?댁뼱??遺?쒕읇寃??덈궡?쒕┫寃뚯슂.';

// ?뵇 ?덉쟾 ?뚯꽌: ?щ윭 ?묐떟 ?ㅽ궎留덉뿉???띿뒪?몃? 異붿텧
const extractText = (res: any): string => {
  if (!res) return '';

  // OpenAI ?명솚(vLLM)
  const c = res?.choices?.[0];
  if (c?.message?.content) return String(c.message.content);
  if (c?.text) return String(c.text);

  // 諛깆뿏??而ㅼ뒪?
  if (res?.text) return String(res.text);
  if (res?.response) return String(res.response);

  // 留덉?留??섎떒: ?됰Ц 蹂??(吏㏐쾶)
  try {
    const s = JSON.stringify(res);
    return s.length > 1000 ? s.slice(0, 1000) + '?? : s;
  } catch {
    return String(res);
  }
};

// 媛꾨떒 Jaccard ?좎궗???좏겙 ?⑥쐞) - ??듭쟻 ?댁슜 ?좎궗???뚯븙
const jaccard = (a: string, b: string): number => {
  const A = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const B = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
};

// 湲몄씠/?좎궗???뚮옒洹??붿빟 (?덉쇅 ?덉쟾)
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
      // ?먯떆 ??낆? 媛믪씠 ?꾨땲?????臾몄옄?대쭔 二쇰?濡??쇰룞 諛⑹??⑹쑝濡??ㅻ챸 蹂寃?      legacy_type: typeof legacy,
      shadow_type: typeof shadow,
      // ?몃윭釉붿뒋?낆쓣 ?꾪빐 ?욌?遺꾨쭔 ?섑뵆(濡쒓렇?먯꽌 鍮좊Ⅴ寃?鍮꾧탳)
      legacy_head: legacyText.slice(0, 120),
      shadow_head: shadowText.slice(0, 120),
    };
  } catch (e: any) {
    return { error: e?.message ?? 'diffSummary failed' };
  }
};

// ?ъ슜???뚮┝ ?좏떥 - ?묎렐??怨좊젮??鍮꾨툝濡쒗궧 ?쇰뱶諛?const notify = (message: string) => {
  // SSR 媛??  if (typeof document === 'undefined') return;

  // 以묐났 ?좎뒪??諛⑹?
  const existing = document.querySelector('[data-toast="true"]');
  if (existing) existing.remove();

  // ?꾩떆 ?좎뒪??div ?앹꽦
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

  // 3珥????먮룞 ?쒓굅
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in forwards';
    setTimeout(() => {
      if (toast.parentNode) document.body.removeChild(toast);
    }, 300);
  }, 3000);
};

const AIChat: React.FC<AIChatProps> = ({ userId }) => {
  const navigate = useNavigate();

  // ?뙇 API 踰좎씠??URL (?섍꼍 ?ㅼ젙 湲곕컲)
  const API_BASE_URL = API_CONFIG.API_BASE_URL.replace(/\/+$/, '');
  const vllmEngineBBase = API_CONFIG.VLLM_ENGINE_B_URL.replace(/\/+$/, '');
  const VLLM_ENGINE_B_URL = /\/v1$/.test(vllmEngineBBase)
    ? vllmEngineBBase
    : `${vllmEngineBBase}/v1`;

  // ?럾截??꾨━誘몄뾼 ?쇱슦???좉? (利됱떆 濡ㅻ갚 媛??
  const PREMIUM_VIA_BACKEND = String(import.meta.env.VITE_PREMIUM_VIA_BACKEND ?? 'false').toLowerCase() === 'true';

  // ?뵇 洹몃┝???뚯뒪???ㅼ젙 (?댁쁺 愿痢≪슜)
  const SHADOW_TEST = String(import.meta.env.VITE_SHADOW_TEST ?? 'false').toLowerCase() === 'true';
  const VLLM_ENGINE_B_MODEL = import.meta.env.VITE_VLLM_ENGINE_B_MODEL || 'llama-3.1-8b-instruct';

  // ?썳截??덉쟾 議곕젰???⑥닔??  const joinUrl = (base: string, path: string) => {
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

  // ?????꾩븘??(?ㅽ듃?뚰겕 吏??諛⑹?)
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

  // EFT ?몄뀡 ?쒖옉 ?몃뱾??  const normalizeIntensity10 = (raw: unknown, fallback = 6) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    const adjusted = value > 10 ? value / 10 : value;
    return Math.max(0, Math.min(10, adjusted));
  };

  const buildFallbackStrictIntake = (intensity: number) => ({
    core_emotion: "遺덉븞",
    situation_context: "AI ?쒖븞 EFT ?몄뀡",
    automatic_thought: "吏湲덉쓽 媛먯젙 ?곹깭瑜?吏꾩젙?쒗궎怨??띠뒿?덈떎",
    intensity,
  });

  const goAR = (rec: EFTRecommendation) => {
    const params = recToARParams(rec);
    const intensity = normalizeIntensity10(rec.intensity ?? 60);
    navigate(`/ar-holistic?${params.toString()}`, {
      state: {
        strictIntake: {
          ...buildFallbackStrictIntake(intensity),
          core_emotion: rec.emotion || "遺덉븞",
          situation_context: rec.additional_notes || "AI 異붿쿇 EFT ?몄뀡",
          automatic_thought: rec.technique_name || "吏湲덉쓽 媛먯젙???꾪솕?섍퀬 ?띠뒿?덈떎",
        },
        intensity_before: intensity,
      },
    });
  };

  // ConversationState ?쒖뒪???듯빀
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

  // ?렞 ?≪뀡 ?몃뱾??留?(?뺤옣 ?⑹씠)
  const handleSuds: ActionHandler<SudsActionPayload> = (p) => setPendingSuds(p);
  const handleBreath: ActionHandler<BreathGuidePayload> = (p) => {
    setPendingBreathGuide(p);
    console.log('?명씉 媛?대뱶 ?≪뀡:', p); // TODO: ?명씉 媛?대뱶 紐⑤떖 援ы쁽
  };
  const handleGrounding: ActionHandler<GroundingPayload> = (p) => {
    setPendingGrounding(p);
    console.log('洹몃씪?대뵫 湲곕쾿 ?≪뀡:', p); // TODO: 洹몃씪?대뵫 ?쒗듃 援ы쁽
  };
  const handleEft: ActionHandler<EftRecommendationPayload> = (p) => {
    setPendingEftRecommendation(p);
    console.log('EFT 異붿쿇 ?≪뀡:', p); // TODO: EFT 異붿쿇 移대뱶 援ы쁽
  };
  const handleMood: ActionHandler<MoodCheckPayload> = (p) => {
    setPendingMoodCheck(p);
    console.log('湲곕텇 泥댄겕 ?≪뀡:', p); // TODO: 湲곕텇 泥댄겕 ?뚮줈??援ы쁽
  };
  const handleResource: ActionHandler<ResourceOfferPayload> = (p) => {
    setPendingResource(p);
    console.log('由ъ냼???쒓났 ?≪뀡:', p); // TODO: 由ъ냼???쒕줈??援ы쁽
  };

  const actionHandlers: Partial<Record<ActionType, ActionHandler<any>>> = {
    SUDS_MEASURE: handleSuds,
    BREATH_GUIDE: handleBreath,
    GROUNDING_54321: handleGrounding,
    EFT_RECOMMENDATION: handleEft,
    MOOD_CHECK: handleMood,
    RESOURCE_OFFER: handleResource,
  };

  // SUDS 紐⑤떖 ?곹깭
  const [showPreSUDS, setShowPreSUDS] = useState(false);
  const [showPostSUDS, setShowPostSUDS] = useState(false);
  const [suds, setSuds] = useState<{ pre?: number; post?: number; preNotes?: string; postNotes?: string }>({});
  const [showAlarmInstallHint, setShowAlarmInstallHint] = useState(false);

  // ?뵦 ?≪뀡 ?곹깭 愿由?(?뺤옣 媛??
  const [pendingSuds, setPendingSuds] = useState<SudsActionPayload | null>(null);
  const [localSuds, setLocalSuds] = useState<number | ''>('');
  const [pendingBreathGuide, setPendingBreathGuide] = useState<BreathGuidePayload | null>(null);
  const [pendingGrounding, setPendingGrounding] = useState<GroundingPayload | null>(null);
  const [pendingEftRecommendation, setPendingEftRecommendation] = useState<EftRecommendationPayload | null>(null);
  const [pendingMoodCheck, setPendingMoodCheck] = useState<MoodCheckPayload | null>(null);
  const [pendingResource, setPendingResource] = useState<ResourceOfferPayload | null>(null);
  const [pendingCushionFollowup, setPendingCushionFollowup] = useState<CushionFollowupState | null>(null);
  const [manualEftRequested, setManualEftRequested] = useState(false);

  // ?뵦 EFT ?몄뀡 ???듯빀
  const eftSessionHook = useEFTSessionHook({
    onEFTComplete: (sessionData) => {
      console.log('EFT ?몄뀡 ?꾨즺:', sessionData);
      // ?몄뀡 ?꾨즺 ??Post-SUDS媛 ?먮룞?쇰줈 ?몃━嫄곕맖 (onAutoSUDS 肄쒕갚)
    },
    onAutoSUDS: (measurementType, context) => {
      console.log('?먮룞 SUDS 痢≪젙 ?몃━嫄?', { measurementType, context });
      // EFT ?꾨즺 ???먮룞 Post-SUDS ?쒖떆
      setPendingSuds({
        measurementType,
        prompt: 'EFT ?몄뀡???꾨즺?섏뀲?듬땲?? ?댁젣 ?몄뀡 ???ㅽ듃?덉뒪 ?섏???痢≪젙?댁＜?몄슂.',
        context,
        sessionId: session.sessionId,
        turnId: turnIdOf(session.turn)
      });
    }
  });

  // ?ㅻ줈媛湲??몃뱾??  const handleGoBack = () => {
    navigate('/');
  };

  const handleManualEFTStart = () => {
    setManualEftRequested(true);
    setShowPreSUDS(true);
  };

  const scheduleARNavigation = (intensity: number) => {
    const arIntensity = normalizeIntensity10(intensity);
    const goToAR = () =>
      navigate(`/ar-holistic?intensity=${arIntensity}`, {
        state: {
          strictIntake: buildFallbackStrictIntake(arIntensity),
          intensity_before: arIntensity,
        },
      });

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

  // ?뵇 洹몃┝???뚯뒪?? fire-and-forget 鍮꾧탳 (UI ?곹뼢 ?놁쓬)
  const shadowFireAndForget = (message: string, sessionData: any) => {
    if (!shouldShadowSample()) return;

    // ?ъ슜??UX ?곹뼢 ?녿룄濡?鍮꾨룞湲?利됱떆 諛섑솚
    (async () => {
      try {
        let legacyRes: any = null;
        let shadowRes: any = null;

        if (PREMIUM_VIA_BACKEND) {
          // 蹂몄꽑: 諛깆뿏????洹몃┝?? vLLM 吏곸젒
          legacyRes = sessionData;

          const url = joinUrl(VLLM_ENGINE_B_URL, '/chat/completions');
          const body = {
            // ?좑툘 紐⑥궗 ?뺥솗?? 蹂몄꽑怨??숈씪?????뚮씪誘명꽣濡?鍮꾧탳
            model: VLLM_ENGINE_B_MODEL,
            temperature: 0.7,
            max_tokens: 400,
            messages: [
              { role: 'system', content: 'EFT ?꾨Ц ?곷떞?щ줈???쇨????ㅼ쑝濡??듬??섏꽭??' },
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
          // 蹂몄꽑: vLLM 吏곸젒 ??洹몃┝?? 諛깆뿏??          legacyRes = sessionData;

          const url = joinUrl(API_BASE_URL, '/chat/premium');

          // 諛깆뿏???ㅽ럺怨??숈씪?섍쾶 援ъ꽦
          const payload = {
            message,
            temperature: 0.7,
            max_tokens: 400,
            // ?꾩슂??寃쎌슦留??몄뀡 硫뷀? ?꾨떖 (undefined ?묎렐 諛⑹?)
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
          message_length: Array.from(message).length, // ?쒓? ?덉쟾 湲몄씠
          ...summary,
        });

        // ?쒕쾭 ?섏쭛 (?좏깮)
        // await fetch(joinUrl(API_BASE_URL, '/metrics/shadow'), {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ summary, message_len: Array.from(message).length }),
        // }).catch(() => {});

      } catch (e) {
        // 議곗슜???ㅽ뙣 臾댁떆
        // eslint-disable-next-line no-console
        console.debug('[SHADOW-COMPARE] skipped', e);
      }
    })();
  };

  // ?섏뒪??吏꾪뻾瑜??낅뜲?댄듃 (濡쒖뺄 泥섎━)
  const handleQuestProgress = (questId: string, progress: number) => {
    console.log(`?섏뒪??吏꾪뻾: ${questId} +${progress}%`);
    // TODO: localStorage??Context API濡??섏뒪??吏꾪뻾瑜????  };

  // ?쒕쾭 ?곹깭 泥댄겕 諛?珥덇린??(Engine A/B ?쒖뒪??
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
                "?덈뀞?섏꽭?? ???EFT ?꾨Ц AI ?곷떞?ъ엯?덈떎. ?뙼\n\n?? **OpenAI GPT-5.2 ?곷떞 ?쒖뒪??*\n- ?넃 臾대즺: GPT-5.2 湲곕컲 蹂묐젹 鍮꾧탳\n- ?뭿 ?꾨━誘몄뾼: GPT-5.2 怨좉툒 紐⑤뜽\n\nOpenAI ?묐떟 紐⑤뜽??湲곕컲?쇰줈 ?쇨???留λ씫???좎??⑸땲??\n\n?ㅻ뒛? ?대뼡 留덉쓬?쇰줈 李얠븘?ㅼ뀲?섏슂? ?몄븞?섍쾶 ?댁빞湲고빐 二쇱꽭??",
              timestamp: Date.now(),
              metadata: {
                confidence: 1.0,
                processing_time: 0,
              },
            }
          : {
              role: 'ai',
              content:
                '?덈뀞?섏꽭?? GPU ?댁궗 ?묒뾽?쇰줈 ?명빐 ?꾩옱 AI ????쒕퉬?ㅺ? ?쇱떆 以묐떒?섏뿀?듬땲?? 12??13??寃??뺤긽?붾맆 ?덉젙?대땲 ?묓빐 遺?곷뱶由쎈땲??',
              timestamp: Date.now(),
              metadata: {
                confidence: 0.6,
                processing_time: 0,
              },
            };

        setMessages([initialMessage]);
      } catch (error) {
        console.error('?쒕쾭 珥덇린???ㅽ뙣:', error);
        setServerStatus('offline');

        const errorMessage: Message = {
          role: 'ai',
          content:
            '?덈뀞?섏꽭?? ?꾩옱 AI ?쒕쾭? ?듭떊?섎뒗 ???대젮????덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄??二쇱떆寃좎뼱?? 臾몄젣媛 吏?띾릺硫??대떦?먯뿉寃?臾몄쓽?댁＜?몄슂.',
          timestamp: Date.now(),
          metadata: { confidence: 0.4 },
        };

        setMessages([errorMessage]);
      }
    };

    initializeAI();
    
    // ?먮룞 ?ъ빱??    setTimeout(() => {
      inputRef.current?.focus();
    }, 1000);
  }, [serverAI]);

  // localStorage 珥덇린??(?몄뀡 ID ?곸냽??蹂댁옣)
  useEffect(() => {
    try {
      if (!localStorage.getItem('eft.sess.id') && session?.sessionId) {
        localStorage.setItem('eft.sess.id', session.sessionId);
      }
    } catch {
      /* storage 遺덇? ?섍꼍? 臾댁떆 */
    }
  }, [session?.sessionId]);

  // ?봽 AR ?몄뀡 而⑦뀓?ㅽ듃 蹂듭썝 (留덉슫????1??
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
        console.info(`?봽 ???而⑦뀓?ㅽ듃 蹂듭썝 ?꾨즺 (${ctx.conversationHistory.length}媛?`);
        sessionStorage.removeItem(ctxKey);
      }
    } catch (err) {
      console.info('?봽 而⑦뀓?ㅽ듃 蹂듭썝 ?ㅽ뙣 (臾댁떆)', err);
    }
  }, []);

  // ?곗뼱 ?좏깮 ?몃? ?대┃ 媛먯?
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

  // ??대㉧ 硫붾え由??꾩닔 諛⑹? cleanup
  useEffect(() => {
    return () => {
      if (interventionTimer) clearTimeout(interventionTimer);
    };
  }, [interventionTimer]);

  // 硫붿떆吏 ?먮룞 ?ㅽ겕濡?  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ?㎨ SUDS ?낅젰 諛곕꼫 ?몄텧 媛먯?
  useEffect(() => {
    if (pendingSuds) {
      console.info('?뱷 SUDS ?낅젰 ?湲?諛곕꼫 ?몄텧', pendingSuds);
    }
  }, [pendingSuds]);

  // S3 吏꾩엯 ???ъ쟾 SUDS 紐⑤떖 ?꾩슦湲?  useEffect(() => {
    if (session.state === 'S3' && suds.pre == null) {
      setShowPreSUDS(true);
    }
  }, [session.state, suds.pre]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // EFT ?꾨Ц ?쒖뒪???꾨＼?꾪듃
  const SYSTEM_PROMPT = `?뱀떊? EFT(媛먯젙?먯쑀湲곕쾿) ?꾨Ц ?곷떞??AI?낅땲?? ?ㅼ쓬 媛?대뱶?쇱씤???곕씪 ?묐떟?섏꽭??

1. 寃쎌껌怨?怨듦컧??理쒖슦?좎쑝濡??섏꽭??2. 2??洹쒖튃: 2踰덉㎏ ????댁쟾?먮뒗 湲곕쾿???쒖븞?섏? 留덉꽭??3. ?묐떟? 400-800??踰붿쐞濡??묒꽦?섍퀬 2?⑤씫?쇰줈 援ъ꽦?섏꽭??4. ?꾪뿕 ?좏샇 媛먯? ???덉쟾 ?덈궡瑜??ы븿?섏꽭??5. ?좏깮沅뚯쓣 ?쒓났?섏꽭??("?먰븯吏 ?딆쑝硫?吏?섍????⑸땲??)
6. ?쒓뎅 臾명솕??留λ씫??怨좊젮?섏꽭??(?섍퀬, 梨낆엫媛? 寃쎄퀎 ??`;

  // 媛쒖엯 ?좉????듭뀡??  const interventionOptions = [
    { id: 'breathing', label: '?명씉 60珥?, duration: 60 },
    { id: 'tapping', label: '??븨 3?ъ씤??, duration: 75 },
    { id: 'grounding', label: '5媛?洹몃씪?대뵫', duration: 90 }
  ];

  // ?렗 ?≪뀡 ?좏겙 ?몃뱾??(諛깆뿏???묐떟??actions 諛곗뿴 泥섎━)
  function handleActionTokens(actions: any[]) {
    try {
      if (!Array.isArray(actions) || actions.length === 0) return;
      console.log('?렗 ?≪뀡 ?좏겙 ?섏떊:', actions);

      for (const a of actions) {
        const t = typeof a?.type === 'string' ? a.type.trim() : '';
        const payload = a?.payload ?? {};
        if (!t) {
          console.warn('?좑툘 ?≪뀡 ????꾨씫/鍮꾩젙??', a);
          continue;
        }

        if (t === 'ask_suds') {
          const mtRaw = payload?.measurement_type ?? payload?.measurementType ?? 'check';
          const allowed: Array<'pre' | 'post' | 'check'> = ['pre', 'post', 'check'];
          const mt = allowed.includes(mtRaw) ? (mtRaw as 'pre' | 'post' | 'check') : 'check';
          const prompt = payload?.title ?? payload?.message ?? payload?.prompt ?? 'SUDS 痢≪젙???쒖옉?⑸땲??';
          const context = payload?.context ?? payload?.detected_by ?? '';
          setPendingSuds({
            measurementType: mt,
            prompt,
            context,
            sessionId: session.sessionId,
            turnId: turnIdOf(session.turn)
          });
          console.info('?㎦ ask_suds ?덉빟:', payload);
          continue;
        }

        if (t === 'recommend_eft' || t === 'suggest_eft') {
          console.info('?몛 EFT ?쒖븞 ?≪뀡 ?섏떊:', payload);

          // ?뵇 ask_suds媛 ?덈뒗吏 ?뺤씤 - SUDS 痢≪젙???꾩슂?섎㈃ AR ?대룞 蹂대쪟
          const hasAskSuds = actions.some(a => a?.type === 'ask_suds');

          if (hasAskSuds) {
            console.info('?몌툘 ask_suds媛 ?덉뼱??AR ?대룞 蹂대쪟 (SUDS 痢≪젙 ??start_eftar濡??대룞)');
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
            console.warn('?좑툘 EFT ?쒖븞 泥섎━ ?ㅻ쪟:', navErr);
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
          console.info('?? start_eftar ?≪뀡 ?섏떊:', payload);
          navigate(`${route}?${params.toString()}`);
          console.log('??actions received ??banner rendered ??route changed');
          console.log('??Full EFT Loop: emotion?묮FT suggestion?뭆UDS?묮FT AR confirmed.');
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
          console.info('?쭣 start_breath_page ?≪뀡 ?섏떊:', payload);
          console.log('?뱤 遺꾧린 洹쇨굅:', rationale);
          navigate(`${route}${params.toString() ? '?' + params.toString() : ''}`);
          console.log('??Breath Meditation Loop: emotion?뭆UDS?묪reath Meditation confirmed.');
          continue;
        }

        console.log('?뱄툘 誘몄????≪뀡 ???', t);
      }
    } catch (err) {
      console.warn('?좑툘 handleActionTokens ?ㅻ쪟 (臾댁떆):', err);
    }
  }

  // Qwen ?몄텧 ?뚯씠?꾨씪??(?곹깭癒몄떊 ?쒖꽌 以??
  const onSend = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed || loading) return;

    if (ALARM_KEYWORD_REGEX.test(trimmed)) {
      setShowAlarmInstallHint(true);
    }

    // 1) ?ъ슜???낅젰 ?꾩갑 - ?듭떖紐낆궗 異붿텧 諛??곹깭 ?꾩씠
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
            content: '?뚭쿋?듬땲?? ?꾩슂?섏떎 ???몄젣?좎? ???댁뼱??留먯??쒕┫寃뚯슂.',
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
      // 2) ?붿쭊 ?묐떟 ?앹꽦 ???뺤젙 吏곸쟾) ?곹깭 ?뺤콉 ?곸슜
      enforceTwoTurnRule(session);

      // ?щ’ 異붿텧 (蹂댁“)
      const slots = extractSlotsFrom(trimmed);

      // ?쒖뒪???꾨＼?꾪듃 援ъ꽦 (+ ?щ’ JSON)
      const systemWithSlots = SYSTEM_PROMPT + `\n[?щ’]\n${JSON.stringify(slots)}`;

      // Qwen ?몄텧 (湲곗〈 ?쒕쾭 ?섑띁 ?ъ슜)
      console.log(`?? Qwen ?몄텧 ?쒖옉 (${selectedTier} ?곗뼱, ?곹깭: ${session.state}, ?? ${session.turn}):`, trimmed);

      let serverResponse: ChatResponse;

      if (selectedTier === 'free') {
        // 臾대즺: 湲곗〈 Engine A/B ?ъ슜
        serverResponse = await serverAI.chat(trimmed, {
          userId: userId,
          maxTokens: 300,
          temperature: 0.4
        });
      } else {
        // ?럾截??꾨━誘몄뾼: ?좉? 湲곕컲 ?쇱슦??(利됱떆 濡ㅻ갚 媛??
        if (PREMIUM_VIA_BACKEND) {
          // 寃쎈줈 1: 諛깆뿏??寃쎌쑀 (/api/chat/premium)
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
            throw new Error(`諛깆뿏???꾨━誘몄뾼 API ?몄텧 ?ㅽ뙣: ${response.status}`);
          }

          serverResponse = await response.json();

        } else {
          // 寃쎈줈 2: vLLM 吏곸젒 ?몄텧 (湲곗〈 寃쎈줈)
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
            throw new Error(`vLLM API ?몄텧 ?ㅽ뙣: ${response.status}`);
          }

          const vllmResponse = await response.json();

          // ChatResponse ?뺥깭濡?蹂??          serverResponse = {
            response: vllmResponse.choices?.[0]?.message?.content ?? '',
            emotion_analysis: { primary_emotion: 'unknown', intensity: 0.5, confidence: 0.5, triggers: [] },
            eft_recommendations: [],
            confidence_score: 0.8,
            processing_time: 0,
            emergency_detected: false,
            professional_referral: false
          };
        }

        // ?뵇 洹몃┝???뚯뒪??(鍮꾨룞湲? UI ?곹뼢 ?놁쓬)
        shadowFireAndForget(trimmed, serverResponse);
      }
      
      // ?뵦 3) 諛깆뿏???묐떟 ?뚯떛 (Intake JSON, Notion Record JSON, UI Action JSON 異붿텧)
      const originalReply = serverResponse.response ?? '';

      // ?렞 ?덈줈??5?④퀎 ?쒖뒪?? JSON ?뚯떛 (?좏떥 ?⑥닔 ?ъ슜)
      const { intake: intakeData, notion: notionRecordData, action: uiActionData, cleanedReply } = parseReplyForJson(originalReply);
      let reply = cleanedReply;

      // Notion Record JSON 泥섎━ (異뷀썑 Notion API ?꾩넚)
      if (notionRecordData) {
        // TODO: Notion API濡??꾩넚
        console.log('?뱷 Notion Record 以鍮꾨맖:', notionRecordData);
      }

      // ???곗꽑?쒖쐞 ??쟾: UI_ACTION_JSON???덉쑝硫?利됱떆 ?ㅽ뻾?섍퀬 醫낅즺
      if (uiActionData) {
        const { action, route, suds, rationale } = uiActionData;
        if (action === 'start_eftar') {
          const params = new URLSearchParams({ script: 'standard_relief' });
          if (suds != null) params.set('suds', String(suds));
          console.info('?? start_eftar(?곗꽑 ?ㅽ뻾):', { suds, rationale });
          navigate(`${route}?${params.toString()}`);
          console.log('??EFT Loop: emotion?뭆UDS?묮FT AR (UI_ACTION_JSON ?곗꽑)');
          return; // ??actions[] 泥섎━ ?ㅽ궢
        } else if (action === 'start_breath_page') {
          const params = new URLSearchParams();
          if (suds != null) params.set('suds', String(suds));
          console.info('?쭣 start_breath_page(?곗꽑 ?ㅽ뻾):', { suds, rationale });
          navigate(`${route}${params.toString() ? '?' + params.toString() : ''}`);
          console.log('??Breath Loop: emotion?뭆UDS?묪reath (UI_ACTION_JSON ?곗꽑)');
          return; // ??actions[] 泥섎━ ?ㅽ궢
        }
      }

      // 燧뉛툘 UI_ACTION_JSON???놁쓣 ?뚮쭔 MSW/諛깆뿏??actions[] ?꾩닚?꾨줈 泥섎━
      const actionResults = serverResponse.actions ?? [];



      // ?렗 ?≪뀡 ?좏겙 泥섎━ (ask_suds, recommend_eft ??
      handleActionTokens(actionResults);

      // ?렞 ?≪뀡 ??낅퀎 ?쇱슦???쒖뒪??(?몃뱾??留?湲곕컲 - ?뺤옣 ?⑹씠)
      actionResults.forEach((action: any) => {
        const handler = actionHandlers[action?.type as ActionType];
        if (!handler || !action?.payload) {
          return;
        }
        try {
          handler(action.payload);
        } catch (error) {
          console.error(`?≪뀡 泥섎━ ?ㅻ쪟 (${action.type}):`, error);
        }
      });

      // 3-1. 臾몃㎘ 蹂듭썝 ("濡??섎뱶?쒓쿋?댁슂" ??"?좎쑝濡??섎뱶?쒓쿋?댁슂")
      reply = sanitizeAssistantText(session, reply);

      // 3-2. ?덉쟾??寃??(?꾪뿕 ?ㅼ썙??媛먯? + ?덉쟾 ?덈궡)
      reply = applySafetyCheck(session, trimmed, reply);

      // 3-3. 諛섎났 諛⑹? ?곸슜 (24?쒓컙 罹먯떆)
      reply = dampenRepetition(session, reply);

      // 3-4. 湲몄씠 ?쒗븳 媛뺤젣 (400-800??
      reply = enforceLength(reply);

      // UI 諛섏쁺 (2?⑤씫 蹂댁옣)
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

      // 4) 硫붿떆吏 ?뚮뜑留?& turn 移댁슫??利앷? (?묐떟 ?뺤젙 ??
      session.turn += 1;
      setSession({ ...session }); // ?몄뀡 ?곹깭 ???
      console.log(`???뚯씠?꾨씪???꾨즺 - ?곹깭: ${session.state}, ?? ${session.turn}`);

      // S3 ?곹깭?먯꽌 硫붿떆吏 ?꾩넚 ???ы썑 SUDS 紐⑤떖 ?꾩슦湲?      if (session.state === 'S3' && suds.pre != null && suds.post == null) {
        setShowPostSUDS(true);
      }

      // ?묎툒?곹솴 媛먯? ???밸퀎 泥섎━
      if (serverResponse.emergency_detected) {
        console.warn('?슚 ?묎툒?곹솴 媛먯???);
        // TODO: ?묎툒?곹솴 泥섎━ 濡쒖쭅 異붽?
      }

      // ?꾨Ц媛 ?곷떞 沅뚯쑀 ???뚮┝
      if (serverResponse.professional_referral) {
        console.info('?좑툘 ?꾨Ц媛 ?곷떞 沅뚯쑀');
      }

      // 媛먯젙 湲곕컲 ?섏뒪??吏꾪뻾瑜??낅뜲?댄듃
      const primaryEmotion = serverResponse.emotion_analysis.primary_emotion;
      if (primaryEmotion === 'stress' || primaryEmotion === '?ㅽ듃?덉뒪') {
        handleQuestProgress('stress_management', 8);
      } else if (primaryEmotion === 'sadness' || primaryEmotion === '?ы뵒') {
        handleQuestProgress('emotional_healing', 6);
      } else if (primaryEmotion === 'anxiety' || primaryEmotion === '遺덉븞') {
        handleQuestProgress('anxiety_relief', 7);
      }

      console.log('???쒕쾭 AI ?묐떟 ?꾨즺:', {
        emotion: primaryEmotion,
        confidence: serverResponse.confidence_score,
        processingTime: serverResponse.processing_time + 'ms',
        eftRecommendations: serverResponse.eft_recommendations.length
      });

    } catch (error) {
      console.error('???쒕쾭 AI ?묐떟 ?ㅽ뙣:', error);

      const errorMessage: Message = {
        role: 'ai',
        content: serverStatus === 'offline'
          ? "?꾩옱 AI ?쒕쾭? ?곌껐?????놁뒿?덈떎. ?쒕쾭 ?곹깭瑜??뺤씤??二쇱꽭?? ?뵩"
          : "二꾩넚?⑸땲?? ?묐떟 ?앹꽦 以?臾몄젣媛 諛쒖깮?덉뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭?? ?쨺",
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

  // 湲곗〈 handleSendMessage瑜?onSend濡??泥?  const handleSendMessage = () => onSend(inputMessage);

  // 媛쒖엯 ?좉? ?쒖옉 ?⑥닔
  const startIntervention = (option: typeof interventionOptions[0]) => {
    console.log(`?쭣 ${option.label} ?쒖옉 (${option.duration}珥?`);

    // 湲곗〈 ??대㉧ ?뺣━
    if (interventionTimer) clearTimeout(interventionTimer);

    // ????대㉧ ?ㅼ젙 (60-90珥????④낵 ?뺤씤)
    const timer = setTimeout(() => {
      onSend('議곌툑 媛踰쇱썙議뚮뒗吏, 紐몄씠 ?대뼸寃??먭뺨吏?붿? ?뚮젮以꾨옒??');
    }, option.duration * 1000);

    setInterventionTimer(timer);
  };

  // 媛쒖엯 嫄대꼫?곌린
  const skipIntervention = () => {
    onSend('愿쒖갖?꾩슂. ?먰븯吏 ?딆쑝硫?吏湲덉? 嫄대꼫?곗뼱???⑸땲??');
  };

  // Enter ??泥섎━
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 泥댄겕由ъ뒪??諛곗? ?앹꽦 (?덈줈???몄뀡 援ъ“)
  const generateChecklistBadges = () => {
    const lastAI = messages.filter(m => m.role === 'ai').pop()?.content || '';
    const hasChoice = /(愿쒖갖?ㅻ㈃|?먰븯吏 ?딆쑝硫?吏湲덉? ?ｊ린留?/.test(lastAI);
    const safetyQ = /(?대젮?좊뜕 ?쒓컙|寃쎄퀬 ?좏샇|?댁튂怨??띠? 異⑸룞)/.test(lastAI);
    const culture = /(?섍퀬|梨낆엫媛?寃쎄퀎|?⑹쓽|??븷 湲곕?)/.test(lastAI);
    const len = [...lastAI].length;
    const inRange = (len >= 350 && len <= 900);
    const twoTurnOk = session.state !== 'S3' || session.turn >= 2;

    return {
      twoTurn: twoTurnOk,
      oneInterventionWithChoice: hasChoice,
      safetyScreened: safetyQ,
      lengthAndCulture: inRange && culture,
      repetitionDamped: true // ?덈줈???쒖뒪?쒖뿉?쒕뒗 ??긽 ?쒖꽦??    };
  };

  // ?쒖븞 硫붿떆吏 ?대┃ 泥섎━
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
      console.warn('?좑툘 SUDS ?쒖텧 ?ㅽ뙣', res);
      return false;
    }

    console.info('??SUDS ?쒖텧 ?깃났', { measurementType, res });

    // (?좉퇋) /suds ?묐떟 蹂몃Ц?먯꽌 S4 JSON(Record/Action) ?뚯떛 ??利됱떆 ?쇱슦??    // ?썳截?諛⑹뼱 肄붾뱶: ?щ윭 ?꾨뱶 ?꾨낫 ?먯깋
    const reply =
      res?.response ??         // ?쒖?
      res?.res?.response ??    // ?섑븨
      res?.body ??             // ?뱀떆 body
      res?.text ??             // ?뱀떆 text
      '';

    if (!reply) {
      console.warn('?좑툘 /suds ?묐떟??response 蹂몃Ц???놁뒿?덈떎:', res);
    } else {
      try {
        const notionMatch   = reply.match(/\[?NOTION[_\s]RECORD[_\s]JSON\]?\s*(\{[\s\S]*?\})/i);
        const uiActionMatch = reply.match(/\[?UI[_\s]ACTION[_\s]JSON\]?\s*(\{[\s\S]*?\})/i);

        if (notionMatch) {
          const record = JSON.parse(notionMatch[1]);
          console.log('?뱷 (SUDS) Notion Record JSON 異붿텧:', record);
          // TODO: ?꾩슂 ??Notion ?꾩넚
        }

        if (uiActionMatch) {
          const actionObj = JSON.parse(uiActionMatch[1]);
          console.log('?? (SUDS) UI Action JSON 異붿텧:', actionObj);

          const { action, route, suds, rationale } = actionObj;
          const params = new URLSearchParams();
          if (suds != null) params.set('suds', String(suds));
          if (action === 'start_eftar') params.set('script', 'standard_relief');

          navigate(`${route}${params.toString() ? `?${params.toString()}` : ''}`);
          return true; // ??UI_ACTION_JSON 泥섎━ ?깃났 ?? actions[]???ㅽ궢
        } else {
          console.warn('?좑툘 (SUDS) UI_ACTION_JSON 釉붾줉???놁뒿?덈떎. reply=', reply);
        }
      } catch (e) {
        console.warn('?좑툘 (SUDS) JSON ?뚯떛 ?ㅽ뙣:', e, 'reply=', reply);
      }
    }

    // 湲곗〈 actions 諛곗뿴 泥섎━ (UI_ACTION_JSON???놁쓣 ???대갚)
    if (Array.isArray(res.actions) && res.actions.length > 0) {
      console.log('?렞 suds.record actions:', res.actions);
      handleActionTokens(res.actions);
    }

    return true;
  };

  // ?㎨ SUDS 諛곕꼫 ?쒖텧 ?몃뱾??  const handleSubmitSuds = async () => {
    if (typeof window === 'undefined') return;
    if (!pendingSuds) return;

    const value = typeof localSuds === 'string' ? Number.NaN : localSuds;
    if (!Number.isInteger(value) || value < 0 || value > 10) {
      console.warn('?좑툘 SUDS ?쒖텧 ?ㅽ뙣', '?좏슚?섏? ?딆? ?먯닔 媛?', localSuds);
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

  // ?뵦 SUDS ?몃씪??移대뱶 ?쒖텧 ?몃뱾??  const handleSudsSubmit = async (score: number) => {
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
          throw new Error(`SUDS 湲곕줉 ?ㅽ뙣: ${response.status} ${response.statusText} ${errorText}`.trim());
        }

        console.log('SUDS ?먯닔 湲곕줉 ?꾨즺:', {
          sessionId,
          measurementType,
          score,
          context,
        });
      } else {
        console.log('SUDS ?먯닔 濡쒖뺄 泥섎━: ?몄뀡 ID媛 ?놁뼱 諛깆뿏????μ쓣 嫄대꼫?곷땲??', {
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
            console.log('硫붾え由??듦퀎:', stats);
          }
        } catch (error) {
          console.log('硫붾え由??듦퀎 議고쉶 ?ㅽ뙣:', error);
        }
      }
    } catch (error) {
      console.error('SUDS ?쒖텧 ?ㅻ쪟:', error);
      notify('SUDS ?먯닔 湲곕줉 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. 怨꾩냽 吏꾪뻾?섏뀛??愿쒖갖?꾩슂.');

      setPendingSuds(null);

      const fallbackMessage: Message = {
        role: 'ai',
        content: '?먯닔 ??μ씠 ?좎떆 吏?곕릺怨??덉?留? 吏꾪뻾?먮뒗 ?곹뼢???놁뼱?? ?몄븞???명씉???댁뼱媛 蹂쇨퉴??',
        timestamp: Date.now(),
        metadata: { confidence: 0.6 }
      };
      setMessages(prev => [...prev, fallbackMessage]);
    }
  };

  // ?쒓컙 ?щ㎎??  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="flex flex-col h-screen lg:min-h-0 bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent">
      {/* ?㎨ SUDS ?낅젰 諛곕꼫 */}
      {pendingSuds && (
        <div
          role="region"
          aria-label="SUDS ?낅젰 諛곕꼫"
          className="w-full bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 mb-2 rounded-md flex items-center gap-2"
        >
          <span className="text-sm font-medium">
            SUDS {pendingSuds.measurementType ?? 'check'} ?먯닔 ?좏깮
          </span>
          <select
            aria-label="SUDS ?먯닔 ?좏깮"
            className="border rounded px-2 py-1 text-sm"
            value={localSuds === '' ? '' : String(localSuds)}
            onChange={(e) => {
              const v = e.target.value === '' ? '' : Number(e.target.value);
              setLocalSuds(v as number | '');
            }}
          >
            <option value="">?좏깮</option>
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
            ???          </button>
        </div>
      )}

      {/* ?ㅻ뜑 */}
      {showAlarmInstallHint && (
        <AlarmInstallGuide
          title="알람/리마인더는 앱에서 가장 정확해요"
          description="웹에서는 브라우저 정책에 따라 알람 푸시 동작이 제한될 수 있어요. 앱을 설치하면 알람이 안정적으로 전달됩니다."
          className="mx-2"
          onDismiss={() => setShowAlarmInstallHint(false)}
          showDismiss
        />
      )}
      <div className="bg-white shadow-lg border-b-2 border-indigo-100 sticky top-0 z-40">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button 
                onClick={handleGoBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <span className="text-xl">??/span>
              </button>
              <div>
                <div className="font-bold text-gray-800">EFT AI ?꾨Ц?곷떞</div>
                <div className="text-sm flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${
                    serverStatus === 'online' ? 'bg-green-500' : 
                    serverStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}></span>
                  <span className="text-gray-600">
                    {serverStatus === 'online'
                      ? `${selectedTier.toUpperCase()} AI ?⑤씪??
                      : serverStatus === 'offline'
                        ? '?쒕쾭 ?ㅽ봽?쇱씤'
                        : '?곌껐 ?뺤씤 以묅?}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* ?곗뼱 ?좏깮 踰꾪듉 */}
              <div className="relative" ref={tierSelectorRef}>
                <button 
                  onClick={() => setShowTierSelector(!showTierSelector)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    selectedTier === 'free' ? 'bg-gray-100 text-gray-700 border-gray-300' :
                    selectedTier === 'premium' ? 'bg-purple-100 text-purple-700 border-purple-300' :
                    'bg-gold-100 text-gold-700 border-gold-300'
                  }`}
                >
                  {selectedTier === 'free' ? '?넃 臾대즺' : 
                   selectedTier === 'premium' ? '?뭿 ?꾨━誘몄뾼' : '?룫 湲곗뾽'}
                </button>
                
                {/* ?곗뼱 ?좏깮 ?쒕∼?ㅼ슫 */}
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
                        ?넃 臾대즺 ?곗뼱<br />
                        <span className="text-xs text-gray-500">湲곕낯 ???(150?좏겙)</span>
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
                        ?뭿 ?꾨━誘몄뾼 ?곗뼱 (NEW!)<br />
                        <span className="text-xs text-purple-500">GPT-5.2 怨좉툒 ?곷떞 (400?좏겙)</span>
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
                        ?룫 湲곗뾽 ?곗뼱 (BETA)<br />
                        <span className="text-xs text-gold-500">理쒓퀬湲?遺꾩꽍 (臾댁젣??</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <span className="text-lg">??/span>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <span className="text-lg">??/span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ?꾩옱 ?섏뒪??吏꾪뻾瑜??쒖떆 */}
      <div className="bg-purple-50 border-b border-purple-100 px-4 py-2">
        <div className="max-w-md mx-auto">
          <div className="text-sm text-purple-700">
            ?렞 ?꾩옱 ?섏뒪?? "?곗븷 ?⑦꽩 遺꾩꽍" 82%
          </div>
          <div className="text-xs text-purple-600">
            ?뮕 ?곗븷 愿???????異붽? 吏꾪뻾瑜?
          </div>
        </div>
      </div>

      {/* 硫붿떆吏 紐⑸줉 */}
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
                      <span className="ml-1">??{selectedTier.toUpperCase()} AI</span>
                      {message.metadata.confidence && (
                        <span className="ml-1">?좊ː??{Math.round(message.metadata.confidence * 100)}%</span>
                      )}
                      {message.metadata.processing_time && message.metadata.processing_time > 0 && (
                        <span className="ml-1">({message.metadata.processing_time.toFixed(1)}珥?</span>
                      )}
                      {message.metadata.emotion_analysis && (
                        <div className="mt-1 text-xs text-blue-600">
                          媛먯젙: {message.metadata.emotion_analysis.primary_emotion} 
                          ({Math.round(message.metadata.emotion_analysis.intensity * 100)}%)
                        </div>
                      )}
                      {message.metadata.eft_recommendations && message.metadata.eft_recommendations.length > 0 && (
                        <div className="mt-2 flex flex-col gap-2">
                          <div className="text-xs text-green-700">
                            AI媛 EFT ?몄뀡???쒖븞?덉뼱?? {message.metadata.eft_recommendations.length}媛?                          </div>

                          {/* 異붿쿇 移대뱶/踰꾪듉 由ъ뒪??*/}
                          <div className="flex flex-wrap gap-2">
                            {message.metadata.eft_recommendations
                              .slice(0, 3)
                              .map((rec: EFTRecommendation, i: number) => (
                                <EftRecButton key={i} rec={rec} index={i} onStart={goAR} />
                              ))}
                          </div>

                          {/* 3媛?珥덇낵 ???좏깮 UX (?좏깮?ы빆) */}
                          {message.metadata.eft_recommendations.length > 3 && (
                            <div className="text-xs">
                              <button
                                type="button"
                                className="underline underline-offset-2 hover:opacity-80 text-green-600"
                                onClick={() => {
                                  // TODO: '紐⑤몢 蹂닿린' 紐⑤떖 or 蹂꾨룄 ?섏씠吏濡??대룞
                                  console.log('異붿쿇 ??蹂닿린:', message.metadata?.eft_recommendations);
                                }}
                              >
                                異붿쿇 ??蹂닿린 ({message.metadata.eft_recommendations.length - 3}媛?
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {message.metadata.emergency_detected && (
                        <div className="mt-1 text-xs text-red-600 font-medium">
                          ?슚 ?묎툒?곹솴 媛먯?
                        </div>
                      )}
                      {message.metadata.professional_referral && (
                        <div className="mt-1 text-xs text-orange-600 font-medium">
                          ?좑툘 ?꾨Ц媛 ?곷떞 沅뚯쑀
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* 媛쒖엯 ?좉? (S3 ?곹깭?대ŉ 湲닿툒?곹솴???꾨땺 ?뚮쭔 ?쒖떆) */}
          {(() => {
            const emergency = session.safety?.escalated && (session.safety?.selfHarm || session.safety?.otherHarm);
            const showIntervention = session.state === 'S3' && !emergency;

            if (!showIntervention) return null;

            return (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 my-4">
                <div className="text-green-800 font-medium mb-3">
                  ?뙼 ?좎떆 ?④퍡 ?대낵源뚯슂?
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
                    吏湲덉? 嫄대꼫?곌린
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 泥댄겕由ъ뒪??諛곗? (?듭뀡) */}
          {(() => {
            const flags = generateChecklistBadges();
            return (
              <div className="flex flex-wrap gap-1 my-2">
                {flags.twoTurn && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                    2?닿퇋移쇺쐯
                  </span>
                )}
                {flags.oneInterventionWithChoice && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                    ?좏깮沅뚢쐯
                  </span>
                )}
                {flags.safetyScreened && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                    ?덉쟾?ㅽ겕由щ떇??                  </span>
                )}
                {flags.lengthAndCulture && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">
                    臾명솕諛곕젮??                  </span>
                )}
                {flags.repetitionDamped && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    諛섎났諛⑹???                  </span>
                )}
              </div>
            );
          })()}

          {/* ?뵦 SUDS ?몃씪??移대뱶 */}
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

          {/* 濡쒕뵫 ?몃뵒耳?댄꽣 */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-800 border border-gray-200 px-4 py-3 rounded-2xl">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-sm text-gray-600">AI媛 ?앷컖?섍퀬 ?덉뼱??..</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ?낅젰 ?뚰듃 (泥???붿씪 ?뚮쭔) */}
      {messages.length === 1 && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100">
          <div className="max-w-md mx-auto">
            <div className="text-sm text-blue-700 mb-2">?뮕 ?대윴 ?앹쑝濡??쒖옉?대낫?몄슂:</div>
            <div className="flex flex-wrap gap-2">
              {[
                "?ㅻ뒛 ?덈Т ?섎뱾?덉뼱??,
                "?ㅽ듃?덉뒪媛 ?ы빐???좎씠 ?????,
                "留덉쓬??蹂듭옟?섍퀬 ?듬떟?댁슂",
                "?붿쬁 湲곕텇???댁긽?댁슂"
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

      {/* 硫붿떆吏 ?낅젰 */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-md mx-auto">
          <div className="flex space-x-3">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="硫붿떆吏瑜??낅젰?섏꽭??.."
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || loading}
              className="px-6 py-3 bg-indigo-500 text-white rounded-2xl hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              ?꾩넚
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
        aria-label="吏湲?EFT 吏꾪뻾?대낫湲?
      >
        <span>吏湲?EFT 吏꾪뻾?대낫湲?/span>
        <span aria-hidden="true">?챷</span>
      </button>

      {/* SUDS 紐⑤떖??*/}
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
                console.log('?ъ쟾 SUDS ????꾨즺:', { sessionId, turnId, sudsPre: rating });
              } catch (error) {
                console.error('?ъ쟾 SUDS ????ㅽ뙣 (臾댁떆?섍퀬 吏꾪뻾):', error);
                notify('?먯닔 ??μ씠 吏?곕릺怨??덉?留??몄뀡? 怨꾩냽 吏꾪뻾?????덉뼱??');
              }
            } else {
              console.log('Firestore SUDS ????ㅽ궢: ?몄뀡 ?앸퀎???먮뒗 ???뺣낫媛 遺議깊빀?덈떎.', {
                sessionId,
                turn,
              });
            }

            if (manualLaunch) {
              setManualEftRequested(false);

              const acknowledgement: Message = {
                role: 'ai',
                content: '?댁쭩 ?⑥쓣 怨좊Ⅴ?⑤떎硫? ?댁젣 AR 媛?대뱶濡??몄븞?섍쾶 ?댁뼱媛?????덈룄濡??꾩??쒕┫寃뚯슂.',
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
                console.warn('EFT ?몄뀡 ?쒖옉 湲곕줉 ?ㅽ뙣(臾댁떆):', error);
              }

              scheduleARNavigation(rating);
            } else {
              // EFT 媛쒖엯 ?쒖옉 硫붿떆吏 ?먮룞 ?꾩넚
              setTimeout(() => {
                onSend('?댁젣 ?④퍡 EFT ?몄뀡??吏꾪뻾?대낫寃좎뒿?덈떎. 以鍮꾨릺?⑤굹??');
              }, 1000);
            }
          } catch (error) {
            console.error('?ъ쟾 SUDS 泥섎━ ?ㅽ뙣:', error);
            notify('???以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?ㅼ떆 ?쒕룄?댁＜?몄슂.');
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

              console.log('?ы썑 SUDS ????꾨즺:', {
                sessionId,
                turnId,
                pre: preSafe,
                post: rating,
                sudsDelta: delta
              });
            } catch (error) {
              console.error('?ы썑 SUDS ????ㅽ뙣 (臾댁떆?섍퀬 吏꾪뻾):', error);
              notify('?먯닔 ??μ씠 吏?곕릺怨??덉?留??ㅼ쓬 ?④퀎濡?怨꾩냽 吏꾪뻾?좉쾶??');
            }
          } else {
            console.log('Firestore SUDS ????ㅽ궢: ?몄뀡 ?앸퀎???먮뒗 ???뺣낫媛 遺議깊빀?덈떎.', {
              sessionId,
              turn,
            });
          }

          // S4濡??꾪솚
          setSession(prev => ({ ...prev, state: 'S4' }));

          // 媛쒖꽑 寃곌낵???곕Ⅸ ?쇰뱶諛?硫붿떆吏 ?먮룞 ?꾩넚
          setTimeout(() => {
            if (delta > 2) {
              onSend(`?뺣쭚 醫뗭븘議뚮꽕?? ${delta}?먯씠??媛쒖꽑?섏뿀?듬땲?? ?대뼡 遺遺꾩씠 媛???꾩????섏뿀?섏슂?`);
            } else if (delta > 0) {
              onSend(`議곌툑?대굹留??섏븘吏?④뎔?? ${delta}??媛쒖꽑?섏뿀?듬땲?? 怨꾩냽 ?댁뼱???대낵源뚯슂?`);
            } else {
              onSend('?꾩쭅 ??蹂?붾뒗 ?먮겮吏 紐삵븯?쒕뒗援곗슂. 愿쒖갖?듬땲?? ?ㅻⅨ 諛⑸쾿???④퍡 ?쒕룄?대낫二?');
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

