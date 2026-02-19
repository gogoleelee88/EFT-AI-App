import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { StrictIntakeInput } from '../types/serverAI';
import type { CaptionItem, GuidanceIntervention, CoachingEvent } from '../types/guidance';
import type { SessionPlan } from '../types/meditation';
import { computeSignalConfidence, type SignalSnapshot } from '../types/signalSnapshot';
import { generateGuidance, generateGuidanceAudio, submitGuidanceFeedback } from '../services/guidanceService';
import { initFaceLandmarker, analyzeFace, cleanupFaceLandmarker } from '../signals/face';
import { SignalProcessor, getLuminanceFromVideo, isLowLight } from '../signals/SignalProcessor';
import { faceSignalsToFaceData } from '../utils/faceDataMapper';
import { poseResultToPostureData, type PostureData } from '../utils/postureDataMapper';
import { useBreathRate } from '../hooks/useBreathRate';
import { extractHeartRate } from '../signals/rppg';
import { requestMediaOnce, stopMediaStream } from '../services/meditation/mediaAccess';
import { EmergencyMeditationOverlay } from '../components/meditation/EmergencyMeditationOverlay';
import { useMeditationAudio } from '../hooks/useMeditationAudio';
import { usePose } from '../modules/ar/usePose';
import SUDSModal from '../components/modals/SUDSModal';
import { useAuth } from '../hooks/useAuth';

type YouTubePlayerState = 'UNSTARTED' | 'ENDED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'CUED' | 'UNKNOWN';
type SpeakFailReason =
  | 'AUDIO_CONTEXT_LOCKED'
  | 'EMPTY_CHUNK_TEXT'
  | 'TTS_API_ERROR'
  | 'PLAYBACK_NOT_STARTED'
  | 'UNKNOWN';

interface SpeakAttemptMeta {
  attemptId: string;
  source: 'chunk_tts' | 'tts_fallback' | 'manual_test';
  startedAt: number;
  playbackStarted: boolean;
}

declare global {
  interface Window {
    YT?: {
      Player?: new (element: HTMLElement | string, config: any) => any;
      PlayerState?: Record<string, number>;
    };
    onYouTubeIframeAPIReady?: () => void;
    __MEDITATION_DEBUG_SIGNAL_STREAM__?: Array<{
      quality?: number;
      tension_delta?: number;
      perclos?: number;
      breath_rate?: number;
      heart_rate?: number;
      heart_rate_confidence?: number;
      hr_trend?: number;
      detected?: boolean;
    }>;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

const YT_STATE_LABELS: Record<number, YouTubePlayerState> = {
  [-1]: 'UNSTARTED',
  0: 'ENDED',
  1: 'PLAYING',
  2: 'PAUSED',
  3: 'BUFFERING',
  5: 'CUED',
};

function mapYoutubeState(value: unknown): YouTubePlayerState {
  if (typeof value !== 'number') return 'UNKNOWN';
  return YT_STATE_LABELS[value] ?? 'UNKNOWN';
}

function ensureYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<void>((resolve, reject) => {
    const scriptId = 'youtube-iframe-api';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('YouTube IFrame API load failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onload = () => {
      if (window.YT?.Player) {
        resolve();
        return;
      }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
    };
    script.onerror = () => reject(new Error('YouTube IFrame API load failed'));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

/** ?耀붾굝????癲ル슢??㎖?밤뀋????썼キ??耀붾굝??????癲ル슢?????????곌떽釉붾?????????? (MoodTalk v2.0 - guidance API ??????袁④뎬?? */
export default function MeditationRunPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const state = location.state as {
    strictIntake?: StrictIntakeInput;
    session_plan?: SessionPlan;
    selected_theme_id?: string;
    selected_estimated_min?: number;
    voice_preference?: string;
    voice_id?: string | null;
    planStartResistance?: string;
  } | undefined;

  const strictIntake = state?.strictIntake;
  const selectedThemeId = state?.selected_theme_id ?? 'thought_labeling';
  const sessionPlan = state?.session_plan;
  const blocks = sessionPlan?.blocks ?? [];
  const total_s = sessionPlan?.total_s ?? 0;
  const voice_preference = state?.voice_preference;
  const voiceId = state?.voice_id ?? null;
  const selectedVideoId = sessionPlan?.selected_video_id ?? null;
  const selectedVideo = sessionPlan?.recommended_videos?.find(
    (video) => video.video_id === selectedVideoId
  ) ?? null;
  const selectedVideoUrl = selectedVideo?.url ?? (selectedVideoId
    ? `https://www.youtube.com/embed/${selectedVideoId}`
    : undefined);
  const selectedVideoEmbedUrl = (() => {
    if (!selectedVideoUrl) return undefined;
    try {
      const url = new URL(selectedVideoUrl);
      url.searchParams.set('enablejsapi', '1');
      if (typeof window !== 'undefined' && window.location?.origin) {
        url.searchParams.set('origin', window.location.origin);
      }
      return url.toString();
    } catch (e) {
      const joiner = selectedVideoUrl.includes('?') ? '&' : '?';
      return `${selectedVideoUrl}${joiner}enablejsapi=1`;
    }
  })();
  const hasVideoSelection = Boolean(selectedVideoUrl);
  const [guideOnly, setGuideOnly] = useState(false);
  const showVideo = hasVideoSelection && !guideOnly;
  const videoControlsSession = Boolean(selectedVideoId) && !guideOnly;
  const [videoVolume, setVideoVolume] = useState(60);
  const youtubePlayerHostRef = useRef<HTMLDivElement | null>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubePlayerRef = useRef<any>(null);
  const youtubeLoadedVideoIdRef = useRef<string | null>(null);
  const [ytState, setYtState] = useState<YouTubePlayerState>('UNSTARTED');
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const [ytApiReady, setYtApiReady] = useState(false);
  const [ytInitFailed, setYtInitFailed] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const coachingEventsRef = useRef<CoachingEvent[]>([]);
  const interventionCooldownsRef = useRef<Record<string, number>>({});
  const lastCaptionTextRef = useRef<string | null>(null);
  const lastChunkTextRef = useRef<string | null>(null);
  const lastChunkAudioRef = useRef<Blob | null>(null);
  const latestFaceDataRef = useRef<Record<string, unknown> | null>(null);
  const latestPostureDataRef = useRef<Record<string, unknown> | null>(null);
  const pendingSpeakRef = useRef<SpeakAttemptMeta | null>(null);
  const pendingSpeakTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGuidanceReqRef = useRef<{
    intake: StrictIntakeInput;
    selected_theme_id: string;
    signal_degrade?: boolean;
    confidence?: number;
    cursor?: { scenario_id: string; next_block_index: number };
    selected_video_id?: string;
    face_data?: Record<string, unknown> | null;
    posture_data?: Record<string, unknown> | null;
    session_id?: string;
  } | null>(null);
  const debugSignalStreamRef = useRef(
    typeof window !== 'undefined' ? window.__MEDITATION_DEBUG_SIGNAL_STREAM__ : undefined
  );
  const debugSignalCursorRef = useRef(0);
  const hasDebugSignalStream = Boolean(
    debugSignalStreamRef.current && debugSignalStreamRef.current.length > 0
  );
  const signalSnapshotRef = useRef<SignalSnapshot | null>(null);
  const signalStatsRef = useRef<{
    windowMs: number;
    samples: { ts: number; detected: boolean }[];
  }>({ windowMs: 15000, samples: [] });
  const heartRateHistoryRef = useRef<{ ts: number; hr: number }[]>([]);

  /** Intervention helpers */
  const runSessionIdRef = useRef<string | null>(null);
  if (runSessionIdRef.current == null) {
    runSessionIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `run-${Date.now()}`;
  }

  useEffect(() => {
    if (!hasVideoSelection) {
      setGuideOnly(false);
    }
  }, [hasVideoSelection]);

  useEffect(() => {
    console.info('[session] debug-source', {
      hasDebugSignalStream,
      debugSignalStreamLen: debugSignalStreamRef.current?.length ?? 0,
    });
  }, [hasDebugSignalStream]);

  const endSession = useCallback((reason: string) => {
    setIsEnded((prev) => {
      if (prev) return prev;
      return true;
    });
    setSessionEndReason((prev) => prev ?? reason);
    setShowFeedbackModal(true);
  }, []);

  /** guidance API ??????거?뜮??*/
  const [guidanceId, setGuidanceId] = useState<string | null>(null);
  const [allCaptions, setAllCaptions] = useState<CaptionItem[]>([]);
  const [currentCaptionIndex, setCurrentCaptionIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<{ scenario_id: string; next_block_index: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingNext, setIsFetchingNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEnded, setIsEnded] = useState(false);
  const [isGuideComplete, setIsGuideComplete] = useState(false);
  const [sessionEndReason, setSessionEndReason] = useState<string | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showPostSUDS, setShowPostSUDS] = useState(false);
  const [postSUDSSubmitting, setPostSUDSSubmitting] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [bestMoments, setBestMoments] = useState<number[]>([]);
  const [worstMoments, setWorstMoments] = useState<number[]>([]);
  const captionListRef = useRef<{ seq: number; text: string; globalSeq: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalElapsedSeconds = useRef(0);
  const [displaySeconds, setDisplaySeconds] = useState(0);

  /** ?耀붾굝????癲ル슢??㎖?밤뀋????썼キ???????????+ ???????????????+ BGM ducking ??*/
  const {
    currentText: currentAudioText,
    isPlaying: isAudioPlaying,
    bgmVolume,
    attachAudioRef,
    enqueueAudio,
    enqueueText,
    reset: resetAudio,
  } = useMeditationAudio();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  /** ?耀붾굝?????????????딅즹???Phase 1??: ?????몃뱥?????+ face_data + ??饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔?+ rPPG */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    initializePose,
    detectPose,
    cleanup: cleanupPose,
    isReady: poseReady,
  } = usePose();
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [faceData, setFaceData] = useState<Record<string, unknown> | null>(null);
  const [postureData, setPostureData] = useState<PostureData | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const faceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [heartRateConf, setHeartRateConf] = useState(0);
  const heartRateRef = useRef<number | null>(null);
  const heartRateConfRef = useRef(0);
  const breathRateRef = useRef<number | null>(null);
  heartRateRef.current = heartRate;
  heartRateConfRef.current = heartRateConf;
  const rppgFrameBufferRef = useRef<ImageData[]>([]);
  const rppgLastEmitRef = useRef(0);

  const isRunning = !isEnded && !showFeedbackModal;
  const isSessionEnded = isEnded;
  const logStateRef = useRef<{
    faceData: Record<string, unknown> | null;
    postureData: Record<string, unknown> | null;
    breathRate: number | null;
    heartRate: number | null;
    heartRateConf: number;
    ytState: YouTubePlayerState;
    ytCurrentTime: number;
    ytDuration: number;
    nextCursor: { scenario_id: string; next_block_index: number } | null;
    isEnded: boolean;
    isSessionEnded: boolean;
    sessionEndReason: string | null;
  }>({
    faceData: null,
    postureData: null,
    breathRate: null,
    heartRate: null,
    heartRateConf: 0,
    ytState: 'UNSTARTED',
    ytCurrentTime: 0,
    ytDuration: 0,
    nextCursor: null,
    isEnded: false,
    isSessionEnded: false,
    sessionEndReason: null,
  });

  /** Phase 2: ??饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔??(?耀붾굝???????? */
  const breathRate = useBreathRate(mediaStream, isRunning);
  breathRateRef.current = breathRate;

  /** Emergency ?耀붾굝?????????붾눀???*/
  const [showEmergency, setShowEmergency] = useState(false);

  /** ???雅?굛肄???????????????ル뒌???: ???雅?굛肄???????饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔?????????耀붾굝??????????????? */
  const tensionHighSinceRef = useRef(0);
  const breathHighSinceRef = useRef(0);
  const [emergencySuggestion, setEmergencySuggestion] = useState<string | null>(null);
  const lastTickRef = useRef(0);

  /** Context-aware: SignalProcessor (Kalman + Calibration) + Luminance */
  const signalProcessorRef = useRef<SignalProcessor | null>(null);
  if (!signalProcessorRef.current) {
    signalProcessorRef.current = new SignalProcessor({ calibrationDurationMs: 8000 });
  }
  const [luminance, setLuminance] = useState(0.5);
  const [calibrationDone, setCalibrationDone] = useState(false);

  const currentCaption = allCaptions[currentCaptionIndex];
  const scenarioId = nextCursor?.scenario_id;
  logStateRef.current = {
    faceData,
    postureData: postureData as Record<string, unknown> | null,
    breathRate,
    heartRate,
    heartRateConf,
    ytState,
    ytCurrentTime,
    ytDuration,
    nextCursor,
    isEnded,
    isSessionEnded,
    sessionEndReason,
  };

  useEffect(() => {
    if (currentCaption?.text) {
      lastCaptionTextRef.current = currentCaption.text;
    }
  }, [currentCaption?.text]);

  useEffect(() => {
    latestFaceDataRef.current = faceData;
  }, [faceData]);

  useEffect(() => {
    latestPostureDataRef.current = postureData as Record<string, unknown> | null;
  }, [postureData]);

  const clearPendingSpeakTimeout = useCallback(() => {
    if (pendingSpeakTimeoutRef.current) {
      clearTimeout(pendingSpeakTimeoutRef.current);
      pendingSpeakTimeoutRef.current = null;
    }
  }, []);

  const logSpeakFail = useCallback((reason: SpeakFailReason, meta: Record<string, unknown> = {}) => {
    const pending = pendingSpeakRef.current;
    console.warn('[tts]', {
      event: 'speakFail',
      reason,
      attempt_id: pending?.attemptId ?? null,
      source: pending?.source ?? null,
      elapsed_ms: pending ? Date.now() - pending.startedAt : null,
      ...meta,
    });
  }, []);

  const startSpeakAttempt = useCallback(
    (source: SpeakAttemptMeta['source'], text: string) => {
      clearPendingSpeakTimeout();
      const attemptId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      pendingSpeakRef.current = {
        attemptId,
        source,
        startedAt: Date.now(),
        playbackStarted: false,
      };
      console.info('[tts]', {
        event: 'speakAttempt',
        attempt_id: attemptId,
        source,
        text_len: text.length,
      });
      pendingSpeakTimeoutRef.current = setTimeout(() => {
        const pending = pendingSpeakRef.current;
        if (!pending || pending.attemptId !== attemptId || pending.playbackStarted) return;
        logSpeakFail('PLAYBACK_NOT_STARTED');
      }, 8000);
      return attemptId;
    },
    [clearPendingSpeakTimeout, logSpeakFail]
  );

  const logSpeakSuccess = useCallback(
    (stage: string, meta: Record<string, unknown> = {}) => {
      const pending = pendingSpeakRef.current;
      console.info('[tts]', {
        event: 'speakSuccess',
        stage,
        attempt_id: pending?.attemptId ?? null,
        source: pending?.source ?? null,
        elapsed_ms: pending ? Date.now() - pending.startedAt : null,
        ...meta,
      });
    },
    []
  );

  const ensureAudioUnlocked = useCallback(async (trigger: 'auto_pointer' | 'manual_button') => {
    try {
      const AudioContextCtor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (AudioContextCtor) {
        const ctx = new AudioContextCtor();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        try {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.0001;
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start();
          oscillator.stop(ctx.currentTime + 0.01);
        } catch (e) {
          // Some browsers block oscillator until next gesture; resume is still useful.
        }
        await ctx.close();
      }
      setAudioUnlocked(true);
      console.info('[tts]', { event: 'audioUnlock', status: 'ok', trigger });
      return true;
    } catch (e) {
      logSpeakFail('AUDIO_CONTEXT_LOCKED', {
        trigger,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }, [logSpeakFail]);

  useEffect(() => {
    const onFirstPointer = () => {
      void ensureAudioUnlocked('auto_pointer');
    };
    window.addEventListener('pointerdown', onFirstPointer, { once: true });
    return () => window.removeEventListener('pointerdown', onFirstPointer);
  }, [ensureAudioUnlocked]);

  useEffect(() => {
    if (!isAudioPlaying) return;
    const pending = pendingSpeakRef.current;
    if (!pending || pending.playbackStarted) return;
    pending.playbackStarted = true;
    clearPendingSpeakTimeout();
    logSpeakSuccess('playback_started');
  }, [isAudioPlaying, clearPendingSpeakTimeout, logSpeakSuccess]);

  useEffect(() => {
    return () => {
      clearPendingSpeakTimeout();
    };
  }, [clearPendingSpeakTimeout]);

  useEffect(() => {
    if (!showVideo || !selectedVideoId || isLoading) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_INIT_RETRIES = 80;
    console.info('[video] init-attempt', {
      showVideo,
      selectedVideoId,
      hasPlayerApi: Boolean(window.YT?.Player),
      isLoading,
    });

    const init = async () => {
      try {
        await ensureYouTubeIframeApi();
        if (cancelled) return;
        const host = youtubePlayerHostRef.current;
        const YT = window.YT;
        if (!host || !YT?.Player) {
          retryCount += 1;
          if (retryCount % 10 === 1) {
            console.info('[video] init-waiting', {
              hostReady: Boolean(host),
              hasPlayerApi: Boolean(YT?.Player),
              retryCount,
            });
          }
          if (retryCount >= MAX_INIT_RETRIES) {
            console.warn('[video] init-timeout', {
              hostReady: Boolean(host),
              hasPlayerApi: Boolean(YT?.Player),
            });
            setYtInitFailed(true);
            return;
          }
          retryTimer = setTimeout(() => {
            if (!cancelled) void init();
          }, 150);
          return;
        }
        setYtInitFailed(false);

        if (youtubePlayerRef.current) {
          if (youtubeLoadedVideoIdRef.current !== selectedVideoId) {
            youtubePlayerRef.current.loadVideoById(selectedVideoId);
            youtubeLoadedVideoIdRef.current = selectedVideoId;
          }
          setYtApiReady(true);
          return;
        }

        youtubePlayerRef.current = new YT.Player(host, {
          width: '100%',
          height: '100%',
          videoId: selectedVideoId,
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: any) => {
              setYtApiReady(true);
              setYtInitFailed(false);
              setYtState('CUED');
              youtubeLoadedVideoIdRef.current = selectedVideoId;
              console.info('[video] iframe-ready', {
                enablejsapi: 1,
                origin: typeof window !== 'undefined' ? window.location.origin : undefined,
                video_id: selectedVideoId,
              });
              try {
                event?.target?.playVideo?.();
              } catch (e) {
                console.warn('youtube playVideo failed', e);
              }
            },
            onStateChange: (event: any) => {
              const nextState = mapYoutubeState(event?.data);
              setYtState(nextState);
              console.info('[video] onStateChange', { state: nextState, raw: event?.data });
              if (nextState === 'ENDED' && !isEnded) {
                endSession('youtube_ended');
              }
            },
            onError: (event: any) => {
              setYtInitFailed(true);
              console.warn('youtube player error', event?.data);
            },
          },
        });
      } catch (e) {
        setYtInitFailed(true);
        console.warn('youtube api init skipped:', e);
      }
    };

    init();
    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [showVideo, selectedVideoId, isLoading, endSession, isEnded]);

  useEffect(() => {
    if (!hasVideoSelection) return;
    const id = setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player) return;
      try {
        const current = Number(player.getCurrentTime?.() ?? 0);
        const duration = Number(player.getDuration?.() ?? 0);
        if (Number.isFinite(current)) setYtCurrentTime(current);
        if (Number.isFinite(duration)) setYtDuration(duration);
      } catch (e) {
        // Keep polling resilient when API is partially available.
      }
    }, 1000);
    return () => clearInterval(id);
  }, [hasVideoSelection]);

  useEffect(() => {
    if (!videoControlsSession || isEnded) return;
    if (ytDuration > 0 && ytCurrentTime >= Math.max(0, ytDuration - 0.5)) {
      endSession('youtube_ended_by_time');
    }
  }, [videoControlsSession, isEnded, ytDuration, ytCurrentTime, endSession]);

  useEffect(() => {
    if (!hasVideoSelection) return;
    const player = youtubePlayerRef.current;
    if (!player) return;
    try {
      if (guideOnly) {
        player.pauseVideo?.();
      } else if (!isEnded) {
        player.playVideo?.();
      }
    } catch (e) {
      console.warn('youtube toggle control failed:', e);
    }
  }, [guideOnly, hasVideoSelection, isEnded]);

  useEffect(() => {
    return () => {
      try {
        youtubePlayerRef.current?.destroy?.();
      } catch (e) {
        // Ignore teardown errors.
      }
      youtubePlayerRef.current = null;
    };
  }, []);

  /** ??Chunk ?????????μ떜媛?걫???Chunk ????椰???(face_data ???? */
  const recordInterventionEvent = useCallback(
    (status: 'EXECUTED' | 'SKIPPED' | 'FAILED', intervention: GuidanceIntervention, note?: string) => {
      const actions = [`INTERVENTION_${status}:${intervention.type}`];
      if (intervention.reason) actions.push(`reason:${intervention.reason}`);
      if (note) actions.push(note);
      console.info('[intervention]', {
        status,
        type: intervention.type,
        reason: intervention.reason ?? null,
        note: note ?? null,
      });
      const level = status === 'EXECUTED' ? 'YELLOW' : status === 'FAILED' ? 'RED' : 'GREEN';
      coachingEventsRef.current.push({
        level,
        timestamp: Date.now(),
        actions,
      });
    },
    []
  );

  const pauseGuideAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      return true;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
      window.speechSynthesis.pause();
      return true;
    }
    return false;
  }, []);

  const rewindGuideAudio = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return false;
    const target = Math.max(0, audio.currentTime - seconds);
    audio.currentTime = target;
    audio.play().catch(() => {});
    return true;
  }, []);

  const replayLastChunkAudio = useCallback(() => {
    const blob = lastChunkAudioRef.current;
    const text = lastChunkTextRef.current;
    if (blob && text) {
      enqueueAudio(blob, text);
      return true;
    }
    if (text) {
      enqueueText(text);
      return true;
    }
    return false;
  }, [enqueueAudio, enqueueText]);

  const reRequestLastGuideAudio = useCallback(async () => {
    const req = lastGuidanceReqRef.current;
    const text = lastChunkTextRef.current;
    if (!req || !text || !text.trim()) return false;
    try {
      const audioRes = await generateGuidanceAudio(req);
      lastChunkAudioRef.current = audioRes.blob;
      enqueueAudio(audioRes.blob, text);
      return true;
    } catch (e) {
      console.warn('reRequestLastGuideAudio failed:', e);
      return false;
    }
  }, [enqueueAudio]);

  const repeatLastCaption = useCallback((fallbackText?: string) => {
    const text = lastCaptionTextRef.current || fallbackText;
    if (!text) return false;
    enqueueText(text);
    return true;
  }, [enqueueText]);

  const sendYouTubeCommand = useCallback((func: string, args: unknown[] = []) => {
    const player = youtubePlayerRef.current;
    if (player) {
      try {
        switch (func) {
          case 'pauseVideo':
            player.pauseVideo?.();
            return true;
          case 'playVideo':
            player.playVideo?.();
            return true;
          case 'seekTo':
            player.seekTo?.(...args);
            return true;
          default:
            return false;
        }
      } catch (e) {
        // Fall through to iframe postMessage fallback.
      }
    }
    const iframe = youtubeIframeRef.current;
    if (!iframe || !iframe.contentWindow) return false;
    let targetOrigin = 'https://www.youtube.com';
    try {
      if (iframe.src) {
        targetOrigin = new URL(iframe.src, window.location.origin).origin;
      }
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        targetOrigin
      );
      return true;
    } catch (e) {
      console.warn('youtube iframe postMessage failed', { func, targetOrigin, error: e });
      return false;
    }
  }, []);

  const applyInterventions = useCallback(
    async (interventions: GuidanceIntervention[] | undefined, fallbackCaptionText?: string) => {
      if (!interventions || interventions.length === 0) return;
      const now = Date.now();
      for (const intervention of interventions) {
        if (!intervention || !intervention.type) continue;
        const cooldownMs = Math.max(0, intervention.cooldown_ms ?? 0);
        const lastRun = interventionCooldownsRef.current[intervention.type];
        if (lastRun && now - lastRun < cooldownMs) {
          recordInterventionEvent('SKIPPED', intervention, 'cooldown');
          continue;
        }
        let executed = false;
        let note = '';

        switch (intervention.type) {
          case 'SOFT_CUE': {
            const params = intervention.params ?? {};
            const cue = typeof params['cue'] === 'string'
              ? params['cue']
              : '????????影?꾨돹?????????곌떽釉붾??10%??????????饔낅떽??????';
            enqueueText(cue);
            executed = true;
            note = 'soft_cue';
            break;
          }
          case 'POSTURE_RESET': {
            const params = intervention.params ?? {};
            if (typeof params['cue'] === 'string') {
              enqueueText(params['cue']);
            } else {
              enqueueText('Please relax your shoulders and return to a neutral neck posture.');
            }
            executed = true;
            note = 'posture_reset';
            break;
          }
          case 'BREATH_PACE': {
            const params = intervention.params ?? {};
            const targetBpm = typeof params['target_bpm'] === 'number'
              ? Math.max(4, Math.min(10, params['target_bpm']))
              : 6;
            enqueueText(`??饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔?????????????⑥ル?????????${targetBpm}???????Β?レ름???????耀붾굝??????????????????얜?逾??`);
            executed = true;
            note = `breath_pace_${targetBpm}`;
            break;
          }
          case 'PAUSE_GUIDE_AUDIO': {
            executed = pauseGuideAudio();
            note = executed ? 'paused' : 'no_active_audio';
            break;
          }
          case 'REWIND_GUIDE_AUDIO': {
            const params = intervention.params ?? {};
            const secondsParam = params['seconds'];
            const msParam = params['ms'];
            const rewindParam = params['rewind_sec'];
            const rewindSeconds = typeof secondsParam === 'number'
              ? secondsParam
              : typeof msParam === 'number'
                ? msParam / 1000
                : typeof rewindParam === 'number'
                  ? rewindParam
                  : 5;
            executed = rewindGuideAudio(Math.max(0, rewindSeconds));
            if (executed) {
              note = `seek_${Math.max(0, rewindSeconds)}s`;
              break;
            }
            executed = replayLastChunkAudio();
            if (executed) {
              note = 'replay_last_chunk';
              break;
            }
            executed = await reRequestLastGuideAudio();
            if (executed) {
              note = 're_request_audio';
              break;
            }
            executed = repeatLastCaption(fallbackCaptionText);
            note = executed ? 'repeat_caption_fallback' : 'no_audio_available';
            break;
          }
          case 'REPEAT_LAST_CAPTION': {
            executed = await reRequestLastGuideAudio();
            if (executed) {
              note = 're_request_audio';
              break;
            }
            executed = replayLastChunkAudio();
            if (executed) {
              note = 'replay_last_chunk';
              break;
            }
            executed = repeatLastCaption(fallbackCaptionText);
            note = executed ? 'repeat_caption_fallback' : 'no_caption_available';
            break;
          }
          case 'PAUSE_YOUTUBE': {
            if (!hasVideoSelection) {
              note = 'no_video_selected';
              break;
            }
            executed = sendYouTubeCommand('pauseVideo');
            if (!executed) {
              enqueueText('?????筌뤾퍓愿?????????????????ル뒌?? ????????? ???????됯퇇逾??????筌뤾퍓愿????? ???????ル뒌????????鶯ㅺ동???볥궚????????⑤벡??????レ┻???????');
              note = 'youtube_control_unavailable_fallback_cue';
              break;
            }
            note = 'paused';
            break;
          }
          case 'SEEK_YOUTUBE': {
            if (!hasVideoSelection) {
              note = 'no_video_selected';
              break;
            }
            const params = intervention.params ?? {};
            const positionParam = params['position_sec'];
            const secondsParam = params['seconds'];
            const seekParam = params['seek_to'];
            const deltaParam = params['delta_sec'];
            const seekTargetBase = typeof positionParam === 'number'
              ? positionParam
              : typeof secondsParam === 'number'
                ? secondsParam
                : typeof seekParam === 'number'
                  ? seekParam
                  : 0;
            const current = Number(youtubePlayerRef.current?.getCurrentTime?.() ?? ytCurrentTime);
            const seekTarget = typeof deltaParam === 'number'
              ? Math.max(0, current + deltaParam)
              : Math.max(0, seekTargetBase);
            executed = sendYouTubeCommand('seekTo', [seekTarget, true]);
            if (!executed) {
              enqueueText('?????筌뤾퍓愿????????????嶺뚮ㅎ?ч뇡??????? ???????살몝???? ?耀붾굝????鶯????獒?????????ㅻ쑄?? 5?????癲????????????????????');
              note = 'youtube_control_unavailable_fallback_cue';
              break;
            }
            note = `seek_${seekTarget}s`;
            break;
          }
          case 'RESUME_YOUTUBE': {
            if (!hasVideoSelection) {
              note = 'no_video_selected';
              break;
            }
            executed = sendYouTubeCommand('playVideo');
            if (!executed) {
              enqueueText('?????筌뤾퍓愿????????????????ル뒌?? ??????????轅붽틓??????????????????? ???????????????????????源낆┸??????ル뒌?? ??????밸쫫??????萸??');
              note = 'youtube_control_unavailable_fallback_cue';
              break;
            }
            note = 'resumed';
            break;
          }
          default:
            note = 'unsupported';
            break;
        }

        if (executed) {
          interventionCooldownsRef.current[intervention.type] = now;
          recordInterventionEvent('EXECUTED', intervention, note);
        } else {
          recordInterventionEvent('SKIPPED', intervention, note);
        }
      }
    },
    [
      enqueueText,
      hasVideoSelection,
      pauseGuideAudio,
      recordInterventionEvent,
      reRequestLastGuideAudio,
      repeatLastCaption,
      replayLastChunkAudio,
      rewindGuideAudio,
      sendYouTubeCommand,
      ytCurrentTime,
    ]
  );

  /** Request first/next chunk (includes face_data) */
  const fetchChunk = useCallback(
    async (
      cursor: typeof nextCursor,
      latestFaceData?: Record<string, unknown> | null,
      latestPostureData?: Record<string, unknown> | null
    ) => {
      if (!strictIntake) return;
      try {
        const signalMetrics = signalSnapshotRef.current
          ? computeSignalConfidence(signalSnapshotRef.current)
          : null;
        const guidanceReq = {
          intake: {
            ...strictIntake,
            voice_id: voiceId ?? null,
          },
          selected_theme_id: selectedThemeId,
          signal_degrade: signalMetrics?.signal_degrade ?? false,
          confidence: signalMetrics?.confidence ?? undefined,
          cursor: cursor ?? undefined,
          selected_video_id: selectedVideoId ?? undefined,
          face_data: latestFaceData ?? latestFaceDataRef.current,
          posture_data: latestPostureData ?? latestPostureDataRef.current,
          session_id: runSessionIdRef.current ?? undefined,
        } as const;
        lastGuidanceReqRef.current = guidanceReq;
        const res = await generateGuidance(guidanceReq);
        setGuidanceId((prev) => prev ?? res.guidance_id);
        setNextCursor(res.next_cursor ?? null);
        setIsGuideComplete(false);
        const startIdx = captionListRef.current.length;
        const newCaptions = res.captions.map((c, i) => ({
          ...c,
          seq: startIdx + i + 1,
        }));
        captionListRef.current = [
          ...captionListRef.current,
          ...res.captions.map((c, i) => ({
            seq: c.seq,
            text: c.text,
            globalSeq: startIdx + i + 1,
          })),
        ];
        setAllCaptions((prev) => (cursor ? [...prev, ...newCaptions] : newCaptions));
        if (!cursor) setCurrentCaptionIndex(0);

        const fallbackCaptionText = res.captions[res.captions.length - 1]?.text;
        await applyInterventions(res.interventions, fallbackCaptionText);

        // ?????Chunk ?????獄쏅챶留??????癲ル슢??????? ???黎앸럽??筌뚭퍏????????????????????????????????꾨굴??
        const chunkText = res.captions.map((c) => c.text).join(' ');
        lastChunkTextRef.current = chunkText;
        if (chunkText.trim().length > 0) {
          startSpeakAttempt('chunk_tts', chunkText);
          try {
            const audioRes = await generateGuidanceAudio(guidanceReq);
            lastChunkAudioRef.current = audioRes.blob;
            enqueueAudio(audioRes.blob, chunkText);
            logSpeakSuccess('audio_enqueued', { blob_size: audioRes.blob.size });
          } catch (e) {
            console.warn('generateGuidanceAudio failed:', e);
            logSpeakFail('TTS_API_ERROR', {
              error: e instanceof Error ? e.message : String(e),
            });
            // Keep guidance audible even when backend TTS fails.
            startSpeakAttempt('tts_fallback', chunkText);
            enqueueText(chunkText);
            logSpeakSuccess('speech_enqueued_fallback');
          }
        } else {
          logSpeakFail('EMPTY_CHUNK_TEXT');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load guidance.');
      } finally {
        setIsLoading(false);
        setIsFetchingNext(false);
      }
    },
    [
      strictIntake,
      voiceId,
      selectedThemeId,
      selectedVideoId,
      enqueueAudio,
      enqueueText,
      applyInterventions,
      startSpeakAttempt,
      logSpeakSuccess,
      logSpeakFail,
    ]
  );

  /** ??Chunk ????癲????ル㎦??(mount ??1????? */
  useEffect(() => {
    if (!strictIntake || !selectedThemeId) {
      setIsLoading(false);
      setError('?????ル뒌??????饔낅떽????????癒?븸亦껋꼦??怨덊닧??????쎛 ??????源낆┸??? ?????????壤굿??Β??????堉온??????????댄뱼???耀붾굝??????癲ル슢???????????밸쫫??????萸??');
      return;
    }
    fetchChunk(null, null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ??????硫멸킐??1?????
  }, []);

  /** ?????獄쏅챶留???????hold_ms ???????+ ????μ떜媛?걫????????Chunk ?????ш내?℡ㅇ??*/
  useEffect(() => {
    if (isLoading || isFetchingNext || error || isEnded || allCaptions.length === 0) {
      const reason = isLoading
        ? 'is_loading'
        : isFetchingNext
          ? 'is_fetching_next'
          : error
            ? 'error_state'
            : isEnded
              ? 'session_ended'
              : 'empty_captions';
      console.info('[block-advance]', {
        event: 'blocked',
        reason,
        current_index: currentCaptionIndex,
        caption_count: allCaptions.length,
        next_cursor: nextCursor?.next_block_index ?? null,
      });
      return;
    }
    if (currentCaptionIndex >= allCaptions.length) {
      console.info('[block-advance]', {
        event: 'chunk_boundary',
        current_index: currentCaptionIndex,
        caption_count: allCaptions.length,
        next_cursor: nextCursor?.next_block_index ?? null,
      });
      if (nextCursor) {
        setIsFetchingNext(true);
        console.info('[block-advance]', {
          event: 'fetch_next_chunk',
          cursor_next_block_index: nextCursor.next_block_index,
        });
        fetchChunk(nextCursor, latestFaceDataRef.current, latestPostureDataRef.current);
      } else {
        if (videoControlsSession) {
          setIsGuideComplete(true);
          console.info('[block-advance]', {
            event: 'guide_complete_waiting_video_end',
          });
        } else {
          console.info('[block-advance]', {
            event: 'guide_complete_end_session',
          });
          endSession('guide_cursor_complete');
        }
      }
      return;
    }
    const cap = allCaptions[currentCaptionIndex];
    if (!cap) {
      console.info('[block-advance]', {
        event: 'blocked',
        reason: 'caption_missing_at_index',
        current_index: currentCaptionIndex,
        caption_count: allCaptions.length,
      });
      return;
    }
    console.info('[block-advance]', {
      event: 'schedule_caption_advance',
      current_index: currentCaptionIndex,
      caption_seq: cap.seq,
      hold_ms: cap.hold_ms,
      caption_type: cap.type ?? null,
    });
    timerRef.current = setTimeout(() => {
      console.info('[block-advance]', {
        event: 'advance_caption_index',
        from_index: currentCaptionIndex,
        to_index: currentCaptionIndex + 1,
      });
      setCurrentCaptionIndex((i) => i + 1);
    }, cap.hold_ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    currentCaptionIndex,
    allCaptions,
    nextCursor,
    isLoading,
    isFetchingNext,
    error,
    isEnded,
    fetchChunk,
    videoControlsSession,
    endSession,
  ]);

  useEffect(() => {
    if (!isGuideComplete || isEnded) return;
    if (!videoControlsSession) {
      endSession('guide_complete_no_video');
    }
  }, [isGuideComplete, isEnded, videoControlsSession, endSession]);

  /** ?????獄쏅챶留????汝뷴젆?琉??????????(????壤굿??Β?? */
  useEffect(() => {
    if (!isRunning) return;
    const iv = setInterval(() => {
      totalElapsedSeconds.current += 1;
      setDisplaySeconds(totalElapsedSeconds.current);
    }, 1000);
    return () => clearInterval(iv);
  }, [isRunning]);

  useEffect(() => {
    const iv = setInterval(() => {
      const state = logStateRef.current;
      const snapshot = signalSnapshotRef.current;
      const metrics = snapshot ? computeSignalConfidence(snapshot) : null;
      const fd = (state.faceData ?? {}) as Record<string, unknown>;
      const pd = (state.postureData ?? {}) as Record<string, unknown>;
      const toNum = (value: unknown): number | undefined =>
        typeof value === 'number' && Number.isFinite(value) ? value : undefined;
      console.info('[signals]', {
        confidence: metrics?.confidence ?? null,
        signal_degrade: metrics?.signal_degrade ?? null,
        face_quality: toNum(fd.quality) ?? snapshot?.quality ?? null,
        tension_delta: toNum(fd.tension_delta) ?? snapshot?.tension_delta ?? null,
        perclos: toNum(fd.perclos) ?? snapshot?.perclos ?? null,
        breath_rate: toNum(fd.breath_rate) ?? state.breathRate ?? null,
        heart_rate: toNum(fd.heart_rate) ?? state.heartRate ?? null,
        hr_confidence: toNum(fd.heart_rate_confidence) ?? state.heartRateConf ?? null,
        hr_trend: snapshot?.hr_trend ?? null,
        posture_score: toNum(pd.posture_score) ?? snapshot?.posture_score ?? null,
        bad_posture_sec: toNum(pd.bad_posture_sec) ?? null,
        posture_confidence: toNum(pd.confidence) ?? null,
      });
      console.info('[video]', {
        yt_state: state.ytState,
        currentTime: Number(state.ytCurrentTime.toFixed(2)),
        duration: Number(state.ytDuration.toFixed(2)),
      });
      console.info('[session]', {
        session_id: runSessionIdRef.current,
        cursor_next_block_index: state.nextCursor?.next_block_index ?? null,
        isEnded: state.isEnded,
        isSessionEnded: state.isSessionEnded,
        session_end_reason: state.sessionEndReason,
        debug_signal_stream_len: debugSignalStreamRef.current?.length ?? 0,
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  /** ?????몃뱥?????+ MediaPipe ??????硫멸킐???(Phase 1) - ??????????癲????ル㎦???????轅붽틓???壤굿??걜?*/
  useEffect(() => {
    if (!strictIntake || isLoading) return;
    if (hasDebugSignalStream) {
      setCameraReady(true);
      setMediaStream(null);
      return () => {
        setCameraReady(false);
      };
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await requestMediaOnce();
        if (cancelled) return;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        await initFaceLandmarker();
        try {
          await initializePose();
        } catch (poseError) {
          console.warn('Pose init skipped:', poseError);
        }
        if (cancelled) return;
        setMediaStream(stream);
        setCameraReady(true);
      } catch (e) {
        console.warn('Camera/face init skipped:', e);
      }
    })();
    return () => {
      cancelled = true;
      cleanupFaceLandmarker();
      cleanupPose();
      stopMediaStream();
      setMediaStream(null);
      setCameraReady(false);
    };
  }, [strictIntake, isLoading, hasDebugSignalStream, initializePose, cleanupPose]);

  /** ??????????ref ??????⑤벡瑜??*/
  useEffect(() => {
    attachAudioRef(audioRef.current);
  }, [attachAudioRef]);

  /** BGM ?????곕츥????ducking: bgmRef?????ル뒌?? ????μ떜媛?걫?????汝뷴젆?琉?????????곕츥?????bgmVolume ??????거?뜮??? ??????????*/
  useEffect(() => {
    if (bgmRef.current) {
      bgmRef.current.volume = bgmVolume;
    }
  }, [bgmVolume]);

  /** Phase 1??: ???????⑤챷議?+ ??饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔?+ rPPG ??????μ떜媛?걫???(???????살몝????????밸쫫?????욱룏??Phase 3) */
  useEffect(() => {
    if (!cameraReady || !isRunning) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!hasDebugSignalStream && (!video || video.readyState < 2)) return;
    signalStatsRef.current.samples = [];
    heartRateHistoryRef.current = [];
    signalSnapshotRef.current = null;

    const baseIntervalMs = 500;
    const fastIntervalMs = 300;

    const tick = () => {
      const now = performance.now();
      const latestPosture = latestPostureDataRef.current;
      let postureScoreForSnapshot: number | undefined;
      if (latestPosture && typeof latestPosture.posture_score === 'number') {
        postureScoreForSnapshot = latestPosture.posture_score;
      }
      if (hasDebugSignalStream) {
        const stream = debugSignalStreamRef.current ?? [];
        if (stream.length > 0) {
          const sample = stream[debugSignalCursorRef.current % stream.length];
          debugSignalCursorRef.current += 1;

          const sampleQuality = typeof sample.quality === 'number' ? sample.quality : 0.7;
          const samplePerclos = typeof sample.perclos === 'number' ? sample.perclos : 0.2;
          const sampleTensionDelta = typeof sample.tension_delta === 'number' ? sample.tension_delta : 0;
          const sampleBreath = typeof sample.breath_rate === 'number'
            ? sample.breath_rate
            : (breathRateRef.current ?? 12);
          const sampleHeartRate = typeof sample.heart_rate === 'number' ? sample.heart_rate : (heartRateRef.current ?? undefined);
          const sampleHeartConf = typeof sample.heart_rate_confidence === 'number'
            ? sample.heart_rate_confidence
            : heartRateConfRef.current;
          const detected = sample.detected !== false;
          const nowTs = Date.now();

          setCalibrationDone(true);
          if (sampleHeartRate != null) {
            setHeartRate(sampleHeartRate);
          }
          if (typeof sampleHeartConf === 'number') {
            setHeartRateConf(sampleHeartConf);
          }

          const nextFaceData: Record<string, unknown> = {
            dominant_emotion: sampleTensionDelta > 0.2 ? 'tension' : 'stable',
            tension_delta: sampleTensionDelta,
            perclos: samplePerclos,
            quality: sampleQuality,
            breath_rate: sampleBreath,
            heart_rate: sampleHeartRate,
            heart_rate_confidence: sampleHeartConf,
            calibration_done: true,
            timestamp: nowTs,
          };
          setFaceData(nextFaceData);

          const stats = signalStatsRef.current;
          stats.samples.push({ ts: now, detected });
          const cutoff = now - stats.windowMs;
          while (stats.samples.length > 0 && stats.samples[0].ts < cutoff) {
            stats.samples.shift();
          }
          const sampleCount = stats.samples.length;
          let detectedCount = 0;
          for (const item of stats.samples) {
            if (item.detected) detectedCount += 1;
          }
          const faceDetectRatio = sampleCount > 0 ? detectedCount / sampleCount : 0;
          const spanMs = sampleCount > 1
            ? stats.samples[sampleCount - 1].ts - stats.samples[0].ts
            : 0;
          const fps = spanMs > 0 ? sampleCount / (spanMs / 1000) : 0;

          if (sampleHeartRate != null) {
            const history = heartRateHistoryRef.current;
            history.push({ ts: nowTs, hr: sampleHeartRate });
            const historyCutoff = nowTs - 60000;
            while (history.length > 0 && history[0].ts < historyCutoff) {
              history.shift();
            }
          }

          let hrTrend = typeof sample.hr_trend === 'number' ? sample.hr_trend : undefined;
          if (hrTrend == null) {
            const hrHistory = heartRateHistoryRef.current;
            if (hrHistory.length >= 2) {
              const first = hrHistory[0];
              const last = hrHistory[hrHistory.length - 1];
              const minutes = (last.ts - first.ts) / 60000;
              hrTrend = minutes > 0 ? (last.hr - first.hr) / minutes : 0;
            }
          }

          signalSnapshotRef.current = {
            tension_delta: sampleTensionDelta,
            perclos: samplePerclos,
            quality: sampleQuality,
            timestamp: nowTs,
            hr_trend: hrTrend,
            face_detect_ratio: faceDetectRatio,
            fps,
            posture_score: postureScoreForSnapshot,
          };
          return;
        }
      }
      if (!video) return;
      const rawFace = analyzeFace(video, now);
      const processed = rawFace && signalProcessorRef.current
        ? signalProcessorRef.current.process(rawFace)
        : null;

      /** Context-aware: Kalman + Calibration ??ProcessedFaceSignals */
      if (processed) {
        setCalibrationDone(processed.calibration_done);

        const br = breathRateRef.current ?? null;
        const hr = heartRateRef.current ?? null;
        const hrConf = heartRateConfRef.current;

        const next = faceSignalsToFaceData(processed, {
          breath_rate: br ?? undefined,
          heart_rate: hr ?? undefined,
          heart_rate_confidence: hrConf >= 0.4 ? hrConf : undefined,
        });
        setFaceData(next as Record<string, unknown>);

        /** ???雅?굛肄???????????????ル뒌???: Calibration ?????獄쏅챶留???tension_delta ???????, ?????獄쏅챶留????????*/
        const isTensionHigh = processed.calibration_done && processed.tension_delta != null
          ? processed.tension_delta > 0.2
          : rawFace.tension > 0.75;

        if (isTensionHigh) {
          tensionHighSinceRef.current += (now - lastTickRef.current) / 1000;
          breathHighSinceRef.current = 0;
        } else {
          tensionHighSinceRef.current = 0;
        }
        if (br != null && br > 25) {
          breathHighSinceRef.current += (now - lastTickRef.current) / 1000;
          if (!isTensionHigh) tensionHighSinceRef.current = 0;
        } else {
          breathHighSinceRef.current = 0;
        }
        lastTickRef.current = now;

        if (tensionHighSinceRef.current >= 10) {
          setEmergencySuggestion('?耀붾굝????????耀붾굝??????????雅?굛肄???????轅붽틓????嚥??????????ル뒌???逆???? ?????밸븶筌믩끃??獄쏅챸爰????饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔??????????怨쀫뎐?????');
        } else if (breathHighSinceRef.current >= 15) {
          setEmergencySuggestion('??饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔???????????????????傭?? ???????됯퇇逾?4-4-4 ??饔낅떽???嶺뚮슢梨뜹ㅇ???沅걔?????????????ル꺄?????????ㅻ쑄??');
        }
      }

      /** Luminance: Auto-Illumination UI??(Step 3???????????????ш내?℡ㅇ??????? */
      if (poseReady) {
        const poseResult = detectPose(video, now);
        const nextPosture = poseResultToPostureData(
          poseResult,
          (latestPostureDataRef.current as PostureData | null) ?? null,
          0.4
        );
        if (nextPosture) {
          setPostureData(nextPosture);
          postureScoreForSnapshot = nextPosture.posture_score;
        }
      }

      if (canvas && video.videoWidth > 0) {
        const lum = getLuminanceFromVideo(video, canvas);
        setLuminance(lum);
      }

      /** rPPG: 10?????癲??????????????extractHeartRate ??饔낅떽??????(?????????????곕츥?????100ms ?????ル뒌??????ル뒇??????????) */
      const emitRppg = now - rppgLastEmitRef.current > 10000;
      const rppgFps = 10;
      const minRppgFrames = rppgFps * 10;
      if (emitRppg && rppgFrameBufferRef.current.length >= minRppgFrames) {
        rppgLastEmitRef.current = now;
        const result = extractHeartRate(rppgFrameBufferRef.current, rppgFps);
        if (result) {
          setHeartRate(result.hr);
          setHeartRateConf(result.confidence);
          const nowTs = Date.now();
          const history = heartRateHistoryRef.current;
          history.push({ ts: nowTs, hr: result.hr });
          const cutoff = nowTs - 60000;
          while (history.length > 0 && history[0].ts < cutoff) {
            history.shift();
          }
        }
      }

      const stats = signalStatsRef.current;
      stats.samples.push({ ts: now, detected: Boolean(rawFace) });
      const cutoff = now - stats.windowMs;
      while (stats.samples.length > 0 && stats.samples[0].ts < cutoff) {
        stats.samples.shift();
      }
      const sampleCount = stats.samples.length;
      let detectedCount = 0;
      for (const sample of stats.samples) {
        if (sample.detected) detectedCount += 1;
      }
      const faceDetectRatio = sampleCount > 0 ? detectedCount / sampleCount : 0;
      const spanMs = sampleCount > 1
        ? stats.samples[sampleCount - 1].ts - stats.samples[0].ts
        : 0;
      const fps = spanMs > 0 ? sampleCount / (spanMs / 1000) : 0;

      let hrTrend: number | undefined;
      const hrHistory = heartRateHistoryRef.current;
      if (hrHistory.length >= 2) {
        const first = hrHistory[0];
        const last = hrHistory[hrHistory.length - 1];
        const minutes = (last.ts - first.ts) / 60000;
        hrTrend = minutes > 0 ? (last.hr - first.hr) / minutes : 0;
      }

      signalSnapshotRef.current = {
        tension_delta: processed?.tension_delta ?? undefined,
        perclos: processed?.perclos ?? rawFace?.perclos,
        quality: processed?.quality ?? rawFace?.quality,
        timestamp: Date.now(),
        hr_trend: hrTrend,
        face_detect_ratio: faceDetectRatio,
        fps,
        posture_score: postureScoreForSnapshot,
      };
    };

    lastTickRef.current = performance.now();
    const intervalMs = 400; // Phase 3: ???????살몝????????밸쫫?????욱룏??(???????????tension/breath????????⑤벡???300/500 ?????ш내?℡ㅇ???????ル뒌????
    const id = setInterval(tick, intervalMs);
    tick();

    return () => clearInterval(id);
  }, [cameraReady, isRunning, hasDebugSignalStream, poseReady, detectPose]);

  /** Phase 4: rPPG ?????獄쏅챶留????????곌떽釉붾??(10 Hz = 100ms) */
  useEffect(() => {
    if (!cameraReady || !isRunning) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const rppgFps = 10;
    const maxBuf = rppgFps * 15;
    const id = setInterval(() => {
      if (video.readyState < 2 || video.videoWidth <= 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const w = video.videoWidth;
      const h = video.videoHeight;
      const size = 40;
      const x = Math.max(0, Math.floor(w / 2 - size / 2));
      const y = Math.max(0, Math.floor(h / 2 - size / 2));
      const roi = ctx.getImageData(x, y, size, size);
      rppgFrameBufferRef.current.push(roi);
      if (rppgFrameBufferRef.current.length > maxBuf) {
        rppgFrameBufferRef.current.shift();
      }
    }, 1000 / rppgFps);
    return () => clearInterval(id);
  }, [cameraReady, isRunning, hasDebugSignalStream]);

  /** ???雅?굛肄????????????????????????????????얠뺏????*/
  const dismissEmergencySuggestion = useCallback(() => {
    setEmergencySuggestion(null);
    tensionHighSinceRef.current = 0;
    breathHighSinceRef.current = 0;
  }, []);

  const handleManualTtsTest = useCallback(async () => {
    const unlocked = await ensureAudioUnlocked('manual_button');
    if (!unlocked) {
      return;
    }
    const testText = '????????????????筌?캉?? ?????癲??????????棺堉?댆洹⑥춸???TTS ??????汝뷴젆?琉???????ぁ????饔낅떽????????怨룸선??????筌?캉??';
    startSpeakAttempt('manual_test', testText);
    enqueueText(testText);
    logSpeakSuccess('speech_enqueued_manual_test');
  }, [ensureAudioUnlocked, enqueueText, startSpeakAttempt, logSpeakSuccess]);

  const handleEndSession = () => {
    endSession('user_stop');
  };

  const handleFeedbackSubmit = async () => {
    if (!guidanceId || userRating < 1) {
      alert('1~5????轅붽틓??筌뚮랭沅?????????????밸쫫??????萸??');
      return;
    }
    try {
      const detail = captionListRef.current.map((c) => ({ seq: c.globalSeq, text: c.text }));
      await submitGuidanceFeedback({
        guidance_id: guidanceId,
        best_moments: bestMoments.length > 0 ? bestMoments : detail.map((d) => d.globalSeq),
        best_moments_detail: detail,
        worst_moments: worstMoments,
        worst_moments_detail: worstMoments.length > 0
          ? detail.filter((d) => worstMoments.includes(d.seq))
          : undefined,
        user_rating: userRating,
        session_id: runSessionIdRef.current ?? 'meditation-session',
        theme_id: selectedThemeId,
        selected_video_id: selectedVideoId ?? undefined,
        coaching_events: coachingEventsRef.current.length > 0 ? coachingEventsRef.current : undefined,
        scenario_id: scenarioId ?? undefined,
      });
    } catch (e) {
      console.error('Feedback ???????????ㅼ뒩??', e);
    }
    setShowFeedbackModal(false);
    setShowPostSUDS(true);
  };

  const handlePostSUDSSubmit = async (score: number) => {
    if (postSUDSSubmitting || !strictIntake) return;
    setPostSUDSSubmitting(true);
    try {
      const checkinPayload = {
        session_id: runSessionIdRef.current ?? 'meditation-session',
        user_id: user?.uid ?? undefined,
        core_emotion: strictIntake.core_emotion,
        situation_context: strictIntake.situation_context,
        automatic_thought: strictIntake.automatic_thought,
        physical_sensation: strictIntake.physical_sensation,
        coping_attempt: strictIntake.behavioral_reaction,
        immediate_goal: strictIntake.immediate_goal,
        intensity_before: strictIntake.intensity,
        session_type: 'meditation',
        ...(strictIntake.available_time != null && {
          available_time: strictIntake.available_time,
        }),
        ...(state?.planStartResistance && {
          plan_start_resistance: state.planStartResistance,
        }),
      };
      await fetch('/api/emotion/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkinPayload),
      });

      await fetch('/suds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'manual',
          score,
          session_id: runSessionIdRef.current ?? 'meditation-session',
          user_id: user?.uid,
          session_type: 'meditation',
        }),
      });

      navigate('/session/advice', {
        replace: true,
        state: {
          sessionType: 'meditation',
          strictIntake,
          intensityBefore: strictIntake.intensity,
          intensityAfter: score,
          selectedThemeId,
          selectedVideoTitle: selectedVideo?.title,
        },
      });
    } catch (e) {
      console.error('Post meditation SUDS save failed:', e);
      setPostSUDSSubmitting(false);
    }
  };

  if (!strictIntake || !selectedThemeId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-2xl bg-white p-6 shadow-lg">
          <p className="text-center text-gray-600">
            Missing required meditation context. Please select a theme and try again.
          </p>
          <button
            type="button"
            onClick={() => navigate('/meditation/theme')}
            className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-center font-medium text-white hover:bg-indigo-700"
          >
            Go to Theme Selection
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && allCaptions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="text-gray-600">Preparing your guided meditation session...</p>
        </div>
      </div>
    );
  }

  if (error && allCaptions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-2xl bg-white p-6 shadow-lg">
          <p className="text-center text-red-600">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/meditation/theme')}
            className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-center font-medium text-white hover:bg-indigo-700"
          >
            Back to Theme Selection
          </button>
        </div>
      </div>
    );
  }

  /** Emergency ?耀붾굝?????????붾눀??????????????????욱룑?????μ떜媛?걫??곸쁼筌?*/
  if (showEmergency) {
    return (
      <EmergencyMeditationOverlay
        onBack={() => navigate('/dashboard', { replace: true })}
        onResume={() => setShowEmergency(false)}
      />
    );
  }

  /** AI ?????ル뒌????????耀붾굝???????? ???????????????????????ㅻ쑄??(?????獄쏅챶留???????seq??best_moments????????꾨굴??) */
  const addCurrentAsBestMoment = () => {
    const cap = allCaptions[currentCaptionIndex];
    if (!cap) return;
    const seq = captionListRef.current.find((c) => c.globalSeq === cap.seq)?.globalSeq ?? cap.seq;
    if (!bestMoments.includes(seq)) setBestMoments((prev) => [...prev, seq]);
  };

  /** AI ?????ル뒌????????耀붾굝???????? ?????????????곕츥?????????????ㅻ쑄??(?????獄쏅챶留???????seq??worst_moments????????꾨굴??) */
  const addCurrentAsWorstMoment = () => {
    const cap = allCaptions[currentCaptionIndex];
    if (!cap) return;
    const seq = captionListRef.current.find((c) => c.globalSeq === cap.seq)?.globalSeq ?? cap.seq;
    if (!worstMoments.includes(seq)) setWorstMoments((prev) => [...prev, seq]);
  };

  /** Auto-Illumination: ??????⑥ル???????????????釉랁닑???롪퍓媛???猷매?뙴??off-white) ?????밸븶筌믩끃?????곌램鍮볠꽴????????????????????ш내?℡ㅇ??(Step 3) */
  const lowLight = isLowLight(luminance);
  const themeClass = lowLight
    ? 'bg-[#faf8f5] transition-colors duration-2000'
    : 'bg-gray-50 transition-colors duration-2000';

  return (
    <div className={`flex min-h-screen flex-col ${themeClass}`} data-luminance={luminance.toFixed(2)} data-low-light={lowLight}>
      {/* ???: ???????????源놁７????????????+ (????壤굿??Β?? BGM ??????????*/}
      <audio ref={audioRef} className="hidden" />
      {/* TODO: ????μ떜媛?걫?繹먃??BGM ????亦껋꼦維뽪틦???쒓낯???????쎛 ?????袁ⓦ걤?嶺뚯쉶?????렢????????鍮㎳???????src???耀붾굝???????饔낅떽????????勇??loop ???????????μ떜媛?걫???*/}
      <audio ref={bgmRef} className="hidden" loop />
      {/* ???: ?????몃뱥?????+ rPPG?????????*/}
      <video ref={videoRef} className="absolute h-0 w-0 overflow-hidden opacity-0" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="absolute h-0 w-0 overflow-hidden opacity-0" />

      {/* ???雅?굛肄???????? ?????????????*/}
      <button
        type="button"
        onClick={() => setShowEmergency(true)}
        className="fixed right-4 top-20 z-40 rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-rose-600"
        aria-label="???雅?굛肄????????"
      >
        Emergency Pause
      </button>

      {/* Context-aware: Calibration Phase ????? (5~10?? */}
      {!calibrationDone && cameraReady && isRunning && (
        <div className="fixed left-4 right-4 top-28 z-20 rounded-xl border border-indigo-200 bg-indigo-50/95 px-4 py-2.5 text-center text-sm text-indigo-800 shadow-sm">
          Calibrating camera signals for stable coaching. This usually takes 5-10 seconds.
        </div>
      )}

      {/* ???雅?굛肄???????????????ル뒌??? ???????????밸븶筌믩끃?????濾?(??0.3) */}
      {emergencySuggestion && (
        <div className="fixed left-4 right-4 top-28 z-30 rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-lg">
          <p className="text-sm font-medium text-amber-900">{emergencySuggestion}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                dismissEmergencySuggestion();
                setShowEmergency(true);
              }}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600"
            >
              Open Emergency Options
            </button>
            <button
              type="button"
              onClick={dismissEmergencySuggestion}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ?????繹먮굞??? ??汝뷴젆?琉??????????*/}
      <div className="border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-indigo-600">Meditation Guide</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleManualTtsTest}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Test TTS
            </button>
            {!audioUnlocked && (
              <button
                type="button"
                onClick={() => {
                  void ensureAudioUnlocked('manual_button');
                }}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                Unlock Audio
              </button>
            )}
            <span className="text-sm text-gray-500">
              {Math.floor(displaySeconds / 60)}:{(displaySeconds % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>

      {/* ?????袁ⓦ걤???ш낄猷??? ???????????*/}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        {hasVideoSelection && (
          <div className="w-full max-w-5xl rounded-2xl bg-white/90 p-4 shadow-lg">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              {showVideo ? (
                <div className="w-full lg:w-3/5">
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                    <div
                      ref={youtubePlayerHostRef}
                      className="h-full w-full"
                    />
                    {!ytApiReady && !ytInitFailed && (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-white/80">
                        Loading YouTube player...
                      </div>
                    )}
                    {ytInitFailed && (
                      <iframe
                        ref={youtubeIframeRef}
                        className="h-full w-full"
                        src={selectedVideoEmbedUrl ?? ''}
                        title={selectedVideo?.title ?? 'YouTube Meditation'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        loading="lazy"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full lg:w-3/5 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  Guide-only mode is active. Turn video back on anytime.
                </div>
              )}
              <div className="w-full lg:w-2/5 space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-500">YouTube</p>
                  <p className="text-base font-semibold text-gray-800">
                    {selectedVideo?.title ?? 'No selected video'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedVideo?.channel_title ?? (selectedVideoId ? `ID: ${selectedVideoId}` : '')}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Playback: {ytState} / {Math.floor(ytCurrentTime)}s / {Math.floor(ytDuration)}s
                </div>
                {isGuideComplete && videoControlsSession && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Guide is complete. Session ends when the video ends or when you press Stop.
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-600" htmlFor="video-volume">
                    Video Volume
                  </label>
                  <input
                    id="video-volume"
                    type="range"
                    min={0}
                    max={100}
                    value={videoVolume}
                    onChange={(event) => setVideoVolume(Number(event.target.value))}
                    className="mt-2 w-full accent-indigo-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Guide audio and YouTube volume are mixed together during playback.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGuideOnly((prev) => !prev)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {guideOnly ? 'Show Video Again' : 'Guide Only Mode'}
                </button>
              </div>
            </div>
          </div>
        )}
        {currentCaption && !showFeedbackModal ? (
          <div className="w-full max-w-md rounded-2xl bg-white/90 px-6 py-8 shadow-lg">
            <p
              className="text-center text-xl font-medium leading-relaxed text-gray-800 transition-opacity duration-300"
              key={currentAudioText || currentCaption.text}
            >
              {currentAudioText || currentCaption.text}
            </p>
            {/* AI ?????ル뒌????????耀붾굝???????? ???????????????????????ㅻ쑄??/ ?????곕츥?????????????ㅻ쑄??(?饔낅떽???嶺뚮、猷???β넄??????? */}
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={addCurrentAsBestMoment}
                className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                Mark as Helpful Moment
              </button>
              <button
                type="button"
                onClick={addCurrentAsWorstMoment}
                className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Mark as Tough Moment
              </button>
            </div>
          </div>
        ) : (
          !showFeedbackModal && (isFetchingNext || (!currentCaption && !isGuideComplete)) && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-12 w-2 rounded-full bg-indigo-300 opacity-70"
                    style={{
                      animation: 'wave 1.5s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`,
                    }}
                  />
                ))}
              </div>
              <p className="text-center text-sm text-gray-500">Loading the next guidance segment...</p>
            </div>
          )
        )}
        {!showFeedbackModal && isGuideComplete && videoControlsSession && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Guide finished. Session remains active until YouTube ends or you press Stop.
          </div>
        )}
        <style>{`
          @keyframes wave {
            0%, 100% { transform: scaleY(0.6); }
            50% { transform: scaleY(1); }
          }
        `}</style>
      </div>

      {/* ???黎앸럽????? ???????욱떌?????????*/}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={handleEndSession}
            className="w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            End Session          </button>
        </div>
      </div>

      {/* ???????꾨굔????耀붾굝?????????붾눀???*/}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-center text-lg font-bold text-gray-800">How was this session?</h3>
            <p className="mt-2 text-center text-sm text-gray-500">Rate from 1 to 5.</p>
            <div className="mt-4 flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setUserRating(star)}
                  className={`rounded-full p-2 text-2xl transition ${
                    userRating >= star ? 'text-amber-500' : 'text-gray-300 hover:text-amber-300'
                  }`}
                >
                  *                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-gray-500">
              {'Selected moments: ' + bestMoments.length + (worstMoments.length > 0 ? ' | tough moments: ' + worstMoments.length : '')}
            </p>
            <button
              type="button"
              onClick={handleFeedbackSubmit}
              className="mt-6 w-full rounded-xl bg-indigo-600 py-3 text-center font-medium text-white hover:bg-indigo-700"
            >
              Submit Feedback
            </button>
          </div>
        </div>
      )}
      {showPostSUDS && (
        <SUDSModal
          open={showPostSUDS}
          label="post"
          contextName="Meditation"
          submitLabelPost="AI 조언 보기"
          currentValue={strictIntake?.intensity ?? 5}
          submitting={postSUDSSubmitting}
          onClose={() => {
            if (postSUDSSubmitting) return;
            setShowPostSUDS(false);
            navigate('/dashboard', { replace: true });
          }}
          onSubmit={(score) => {
            void handlePostSUDSSubmit(score);
          }}
        />
      )}
    </div>
  );
}

