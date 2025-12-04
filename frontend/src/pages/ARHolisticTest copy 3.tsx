import { useEffect, useRef, useState } from "react";

import { useNavigate, useSearchParams } from "react-router-dom";

import { Holistic, POSE_LANDMARKS, VERSION } from "@mediapipe/holistic";

import { Camera } from "@mediapipe/camera_utils";

import type { EFTCode } from "@/types/eftCodes";



// ===== AR URL Params Schema =====

type EmotionKey =

  | "anger" | "anxiety" | "sadness" | "shame" | "guilt"

  | "stress" | "fear" | "loneliness" | "confusion"; 



type SideKey = "both" | "left" | "right";



// 🔹 여기 추가

interface ARParams {

  emotion: EmotionKey;     // 감정 키

  intensity: number;       // 0~10 (SUDS)

  points: EFTCode[];       // 탭핑 포인트

  durationSec: number;     // 라운드 당 지속(초)

  rounds: number;          // 라운드 수

  tempoBpm: number;        // 가이드 템포(BPM)

  side: SideKey;           // 양쪽/좌/우

  affirm?: string;         // 확언 문구 (옵션)

}









// 프로젝트 공통 EFT 포인트 화이트리스트 (ARHolisticTest.tsx 실제 구현 기준)

const ALLOWED_POINTS = new Set<EFTCode>([

  "TH","EB","SE-L","SE-R","UE","UN","CH","CB", // UA(겨드랑이) 제외

]);



const ALLOWED_EMOTIONS: EmotionKey[] = [

  "anger","anxiety","sadness","shame","guilt","stress","fear","loneliness","confusion"

];



const DEFAULT_PARAMS: ARParams = {

  emotion: "stress",

  intensity: 6,

  points: ["TH","EB","SE-L","SE-R","UE","UN","CH","CB"], // UA 제거, ARHolisticTest 기준

  durationSec: 60,

  rounds: 3,

  tempoBpm: 50,

  side: "both",

  affirm: undefined,

};



// ===== 파서 유틸 =====

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));



function pickEnum<T extends string>(val: string | null, allowed: readonly T[], fallback: T): T {

  return (val && (allowed as string[]).includes(val)) ? (val as T) : fallback;

}



function getNum(sp: URLSearchParams, key: string, def: number, min: number, max: number) {

  const raw = sp.get(key);

  if (raw == null) return def;

  const n = Number(raw);

  return Number.isFinite(n) ? clamp(n, min, max) : def;

}



function getStr(sp: URLSearchParams, key: string, def?: string) {

  const raw = sp.get(key);

  return raw == null || raw.trim() === "" ? def : raw;

}



// ✅ 입력 정규화: URL/AI 추천 → 내부 표준 코드

function normalizePoints(input: string[] | undefined): EFTCode[] {

  if (!input || input.length === 0) return ["TH","EB","SE-L","SE-R","UE","UN","CH","CB"]; // 기본 세트



  const out: EFTCode[] = [];

  for (const raw of input) {

    const key = (raw || "").trim().toUpperCase();



    if (key === "UA") {

      console.warn("[EFT] UA(겨드랑이) 포인트는 지원하지 않아 제외합니다.");

      continue;

    }

    if (key === "SE") {

      // 단일 'SE'가 오면 양쪽을 모두 그리도록 확장

      ["SE-L","SE-R"].forEach(k => { if (ALLOWED_POINTS.has(k as EFTCode)) out.push(k as EFTCode); });

      continue;

    }

    if (ALLOWED_POINTS.has(key as EFTCode)) {

      out.push(key as EFTCode);

    } else {

      console.warn(`[EFT] 미지원 포인트 '${key}'는 제외합니다.`);

    }

  }



  // 중복 제거

  return Array.from(new Set(out));

}



function parsePoints(sp: URLSearchParams, def: EFTCode[]): EFTCode[] {

  const raw = sp.get("points");

  if (!raw) return def;

  const list = raw.split(",").map(s => s.trim()).filter(Boolean);

  return normalizePoints(list);

}



function parseSide(sp: URLSearchParams, def: SideKey): SideKey {

  const raw = sp.get("side");

  if (raw === "left" || raw === "right" || raw === "both") return raw;

  return def;

}



function parseEmotion(sp: URLSearchParams, def: EmotionKey): EmotionKey {

  const raw = sp.get("emotion");

  return pickEnum(raw, ALLOWED_EMOTIONS, def);

}



// (옵션) 프리셋: URL에서 preset=full|short|upper 로 들어오면 points 덮어쓰기

const PRESETS: Record<string, EFTCode[]> = {

  full:  ["TH","EB","SE-L","SE-R","UE","UN","CH","CB"], // UA 제거

  short: ["EB","UE","CH","CB"], // 4개 핵심만

  upper: ["TH","EB","SE-L","SE-R","UE","UN"], // 상반신만

};



function parseARParams(sp: URLSearchParams): ARParams {

  // SUDS 값이 있으면 우선 사용 (SUDS 배너에서 입력한 값)

  const sudsRaw = sp.get("suds");

  const sudsValue = sudsRaw != null ? Number(sudsRaw) : null;

  const intensityValue = (sudsValue !== null && Number.isFinite(sudsValue))

    ? clamp(sudsValue, 0, 10)

    : getNum(sp, "intensity", DEFAULT_PARAMS.intensity, 0, 10);



  const base: ARParams = {

    emotion:     parseEmotion(sp, DEFAULT_PARAMS.emotion),

    intensity:   intensityValue,

    points:      parsePoints(sp, DEFAULT_PARAMS.points),

    durationSec: getNum(sp, "duration",   DEFAULT_PARAMS.durationSec, 15, 600),

    rounds:      getNum(sp, "rounds",     DEFAULT_PARAMS.rounds, 1, 20),

    tempoBpm:    getNum(sp, "tempo",      DEFAULT_PARAMS.tempoBpm, 30, 120),

    side:        parseSide(sp, DEFAULT_PARAMS.side),

    affirm:      getStr(sp, "affirm", DEFAULT_PARAMS.affirm),

  };



  const preset = sp.get("preset");

  if (preset && PRESETS[preset]) {

    base.points = PRESETS[preset];

  }

  return base;

}



// POSE 좌/우 구분용 (대략: 왼=even, 오른=odd가 아님에 주의. Mediapipe 인덱스를 명시)

const LEFT_IDX = new Set<number>([

  POSE_LANDMARKS.LEFT_EYE, POSE_LANDMARKS.LEFT_EYE_INNER, POSE_LANDMARKS.LEFT_EYE_OUTER,

  POSE_LANDMARKS.LEFT_EAR, POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW,

  POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_PINKY, POSE_LANDMARKS.LEFT_INDEX,

  POSE_LANDMARKS.LEFT_THUMB, POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE,

  POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.LEFT_HEEL, POSE_LANDMARKS.LEFT_FOOT_INDEX,

]);



const RIGHT_IDX = new Set<number>([

  POSE_LANDMARKS.RIGHT_EYE, POSE_LANDMARKS.RIGHT_EYE_INNER, POSE_LANDMARKS.RIGHT_EYE_OUTER,

  POSE_LANDMARKS.RIGHT_EAR, POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW,

  POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_PINKY, POSE_LANDMARKS.RIGHT_INDEX,

  POSE_LANDMARKS.RIGHT_THUMB, POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE,

  POSE_LANDMARKS.RIGHT_ANKLE, POSE_LANDMARKS.RIGHT_HEEL, POSE_LANDMARKS.RIGHT_FOOT_INDEX,

]);



function allowBySide(index: number, side: SideKey) {

  if (side === "both") return true;

  if (side === "left") return LEFT_IDX.has(index);

  return RIGHT_IDX.has(index); // "right"

}



// 🎨 공통 오버레이 유틸

type Pt = { x: number; y: number };



function drawPill(

  ctx: CanvasRenderingContext2D,

  x: number,

  y: number,

  text: string,

  {

    font = "14px system-ui, sans-serif",

    padX = 10,

    padY = 6,

    box = "rgba(0,0,0,0.6)",

    color = "rgba(255,255,255,0.95)",

    radius = 8,

  } = {}

) {

  ctx.save();

  ctx.font = font;

  const w = Math.ceil(ctx.measureText(text).width);

  const bw = w + padX * 2, bh = 20 + (padY - 6) * 2;

  const r = Math.min(radius, bh / 2, bw / 2);

  ctx.beginPath();

  ctx.moveTo(x + r, y);

  ctx.arcTo(x + bw, y, x + bw, y + bh, r);

  ctx.arcTo(x + bw, y + bh, x, y + bh, r);

  ctx.arcTo(x, y + bh, x, y, r);

  ctx.arcTo(x, y, x + bw, y, r);

  ctx.closePath();

  ctx.fillStyle = box;

  ctx.fill();

  ctx.fillStyle = color;

  ctx.textBaseline = "middle";

  ctx.fillText(text, x + padX, y + bh / 2);

  ctx.restore();

}



function drawCenteredWrapped(

  ctx: CanvasRenderingContext2D,

  c: HTMLCanvasElement,

  text: string,

  {

    font = "18px system-ui, sans-serif",

    maxWidthRatio = 0.8,

    lineHeight = 26,

    centerY,

    box = "rgba(0,0,0,0.5)",

    color = "rgba(255,255,255,1)",

    padX = 14,

    padY = 10,

  } = {}

) {

  ctx.save();

  ctx.font = font;

  const maxW = c.width * maxWidthRatio;

  const words = text.split(/\s+/);

  const lines: string[] = [];

  let cur = "";

  for (const w of words) {

    const tryLine = cur ? cur + " " + w : w;

    if (ctx.measureText(tryLine).width <= maxW) cur = tryLine;

    else { if (cur) lines.push(cur); cur = w; }

  }

  if (cur) lines.push(cur);



  const textW = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)));

  const textH = lines.length * lineHeight;

  const x = (c.width - textW) / 2;

  const y = (centerY ?? (c.height / 2 + 80)) - textH / 2;



  ctx.fillStyle = box;

  ctx.fillRect(x - padX, y - padY, textW + padX * 2, textH + padY * 2);



  ctx.fillStyle = color;

  ctx.textBaseline = "top";

  lines.forEach((l, i) => {

    const lx = (c.width - ctx.measureText(l).width) / 2;

    ctx.fillText(l, lx, y + i * lineHeight);

  });

  ctx.restore();

}



// 🔊 오디오 피드백 유틸

function playBeep(frequency = 880, duration = 200) {

  try {

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const osc = ctx.createOscillator();

    const gain = ctx.createGain();

    osc.type = "sine";

    osc.frequency.value = frequency;

    osc.connect(gain);

    gain.connect(ctx.destination);

    osc.start();

    gain.gain.setValueAtTime(0.2, ctx.currentTime);

    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    osc.stop(ctx.currentTime + duration / 1000);

  } catch (e) {

    console.warn("AudioContext error", e);

  }

}



// 📳 진동 유틸 (모바일)

function vibrate(ms = 200) {

  if ("vibrate" in navigator) {

    navigator.vibrate(ms);

  }

}



// 🌐 다국어 텍스트

const TEXTS = {

  ko: {

    title: "EFT 가이드",

    startGuide: "단계별 가이드 시작 (TH → …)",

    highlight: "하이라이트만 켜기",

    stop: "중지",

    backToAI: "← AI 대화로 돌아가기",

    dashboard: "대시보드로",

    home: "홈으로",

    round: (round: number, total: number) => `라운드 ${round}/${total}`,

    remaining: (sec: number) => `${sec}초`,

    breathInhale: "들이쉬기",

    breathHold: "멈추기",

    breathExhale: "천천히 내쉬기",

    cameraStart: "📷 카메라 시작",

    error: "오류:",

  },

  en: {

    title: "EFT Guide",

    startGuide: "Start Step-by-Step Guide (TH → …)",

    highlight: "Highlight Only",

    stop: "Stop",

    backToAI: "← Back to AI Chat",

    dashboard: "Dashboard",

    home: "Home",

    round: (round: number, total: number) => `Round ${round}/${total}`,

    remaining: (sec: number) => `${sec}s`,

    breathInhale: "Inhale",

    breathHold: "Hold",

    breathExhale: "Exhale slowly",

    cameraStart: "📷 Start Camera",

    error: "Error:",

    needsPermission: "Please allow camera access to continue",

    processing: "Processing...",

    ready: "Ready",

    guiding: "Guiding in progress",

    complete: "Session complete!",

  },

};

type Lang = keyof typeof TEXTS;



function ema(prev: number | null, next: number, alpha = 0.35) {

  if (prev == null) return next;

  return prev * (1 - alpha) + next * alpha;

}



// 탭핑 7포인트 × 라운드 수

const TAPPING_ROUNDS = 3;

const STEP_SECONDS = 5; // 각 포인트 머무는 시간(초)



// 호흡 단계 시간(초)

const BREATH_INHALE = 4;

const BREATH_HOLD   = 4;

const BREATH_EXHALE = 6;



// 호흡 UI (원 애니메이션) 반경 범위

const BREATH_RADIUS_MIN = 30;

const BREATH_RADIUS_MAX = 120;



type StepId = "TH" | "EB" | "SE-L" | "SE-R" | "UE" | "UN" | "CH" | "CB";

type GuidePhase = "tapping" | "breath" | "done";

type GuideEngine = {

  running: boolean;

  phase: GuidePhase;

  stepIdx: number;     // 탭핑 단계 인덱스

  round: number;       // 현재 몇 라운드(0~TAPPING_ROUNDS-1)

  deadlineMs: number;  // 현재 단계 마감시각

  breathPart?: "INHALE" | "HOLD" | "EXHALE";

  breathDeadlineMs?: number;

};



// 좌표 미세조정(비율). 필요시 숫자만 바꿔서 튜닝해요.

const OFF = {

  EB: { dx:0.079, dy: -0.010 }, // 원래 위치로 (좌우 이동 없음)

  UE: { dx: -0.0, dy:  0.055 }, // 왼쪽/아래로 살짝

};



const SEQUENCE: Array<{ id: StepId; label_ko: string; label_en: string; seconds: number }> = [

  { id: "TH",   label_ko: "정수리",       label_en: "Top of Head",   seconds: STEP_SECONDS },

  { id: "EB",   label_ko: "눈썹 앞",      label_en: "Eyebrow",       seconds: STEP_SECONDS },

  { id: "SE-L", label_ko: "눈 옆 (좌)",   label_en: "Side (L)",      seconds: STEP_SECONDS },

  { id: "SE-R", label_ko: "눈 옆 (우)",   label_en: "Side (R)",      seconds: STEP_SECONDS },

  { id: "UE",   label_ko: "눈 밑",        label_en: "Under Eye",     seconds: STEP_SECONDS },

  { id: "UN",   label_ko: "코 밑",        label_en: "Under Nose",    seconds: STEP_SECONDS },

  { id: "CH",   label_ko: "입술 아래",    label_en: "Chin",          seconds: STEP_SECONDS },

  { id: "CB",   label_ko: "쇄골",         label_en: "Collarbone",    seconds: STEP_SECONDS },

];



// 🫧 버블 애니메이션 설정 (EFT 포인트 버블용)

const BUBBLE_POP_DURATION = 800;   // 한 번 터질 때까지(ms)

const BUBBLE_MAX_RADIUS = 45;      // 버블 최대 반경(px)



// ✋ 탭 감지 설정

const TAP_DISTANCE_PX = 40;        // 손가락 ↔ 포인트 거리 임계값(px)

const TAP_COOLDOWN_MS = 250;       // 연속 탭 중복 감지 방지(ms)



export default function ARHolisticTest() {

  const navigate = useNavigate();

  const [searchParams] = useSearchParams();

  const [arParams, setArParams] = useState<ARParams>(DEFAULT_PARAMS);

  const videoRef = useRef<HTMLVideoElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const holisticRef = useRef<Holistic | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [ready, setReady] = useState(false);

  const [needsTap, setNeedsTap] = useState(false);



  // 🧠 무드 점수 (각 포인트마다 8 → 0)

  const [moodScore, setMoodScore] = useState(8);

  const moodScoreRef = useRef(8);



  useEffect(() => {

    moodScoreRef.current = moodScore;

  }, [moodScore]);



    // 🫧 DOM 버블 위치 & 리렌더 트리거

  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);

  const [bubblePopKey, setBubblePopKey] = useState(0);





  // 버블/탭 타이밍

  const lastBubblePopTimeRef = useRef<number>(-Infinity);

  const lastTapTimeRef = useRef<number>(-Infinity);



  // 🌐 다국어 상태

  const [lang, setLang] = useState<Lang>("ko");

  const texts = TEXTS[lang];



  // ✅ 안정성을 위한 ref들

  const isGuidingRef = useRef(false);

  const stepIdxRef = useRef(0);

  const stepRemainingRef = useRef(SEQUENCE[0].seconds);

  const guideEngineRef = useRef<GuideEngine>({

    running: false,

    phase: "tapping",

    stepIdx: 0,

    round: 0,

    deadlineMs: 0,

  });

  const startedRef = useRef(false);

  const sendingRef = useRef(false);

  const stoppedRef = useRef(false);







  // 스무딩 버퍼

  const smoothRef = useRef<Record<StepId | "NOSE", Pt | null>>({

    "EB": null, "SE-L": null, "SE-R": null, "UE": null, "UN": null,

    "CH": null, "CB": null, "TH": null, "NOSE": null

  });



  // 마지막 유효한 포인트들 (빈 프레임에도 그리기 유지)

  const lastValidPoints = useRef<Record<StepId, Pt | null>>({

    "EB": null, "SE-L": null, "SE-R": null, "UE": null, "UN": null,

    "CH": null, "CB": null, "TH": null

  });



  // 펄스 애니메이션용 시간

  const pulseRef = useRef<number>(0);

  const rafOverlayRef = useRef<number | null>(null);



  // URL → 상태 동기화

  useEffect(() => {

    const parsed = parseARParams(searchParams);

    setArParams(parsed);

    if (process.env.NODE_ENV !== "production") {

      console.debug("[AR] URL Params →", parsed);

    }

  }, [searchParams]);



  // 템포에 맞춰 가이드(비프 등)

  useEffect(() => {

    const intervalMs = Math.round(60000 / arParams.tempoBpm);

    const id = window.setInterval(() => {

      // 필요 시 특정 타이밍에만 비프

      // playBeep(880, 50);

    }, intervalMs);

    return () => clearInterval(id);

  }, [arParams.tempoBpm]);



  // 라운드/경과 타이머

  const [round, setRound] = useState(1);

  const [elapsed, setElapsed] = useState(0);



  useEffect(() => {

    setRound(1);

    setElapsed(0);

    const id = window.setInterval(() => {

      setElapsed((e) => {

        const next = e + 1;

        if (next >= arParams.durationSec) {

          setRound((r) => (r + 1 > arParams.rounds ? r : r + 1));

          return 0;

        }

        return next;

      });

    }, 1000);

    return () => clearInterval(id);

  }, [arParams.durationSec, arParams.rounds]);



  // 현재 포인트(포인트 시퀀스 자동 순환)

  const stepPerPoint = Math.max(1, Math.floor(arParams.durationSec / Math.max(1, arParams.points.length)));

  const currentPoint = arParams.points[

    (Math.floor(elapsed / stepPerPoint)) % Math.max(1, arParams.points.length)

  ];



  // 가이드 진행 상태

  const [isGuiding, setIsGuiding] = useState(false);

  const [stepIdx, setStepIdx] = useState(0);

  const [stepRemaining, setStepRemaining] = useState(SEQUENCE[0].seconds);



  useEffect(() => {

    // 새 EFT 포인트로 이동하면 점수 8로 리셋

    setMoodScore(8);

    moodScoreRef.current = 8;

  }, [stepIdx]);



  // 🔑 뒤로가기 + 안전 종료 함수 (상황별 이동)

  const handleBack = (target: "back" | "home" | "dashboard" = "back") => {

    if (typeof window === "undefined") return;



    console.log(`⬅️ ${target} 이동하기 전 정리 실행`);



    guideEngineRef.current.running = false;

    guideEngineRef.current.phase = "tapping";

    guideEngineRef.current.round = 0;

    guideEngineRef.current.breathPart = undefined;

    guideEngineRef.current.breathDeadlineMs = 0;



    stoppedRef.current = true;

    try {

      holisticRef.current?.close();

    } catch (e) {

      console.warn("holisticRef close 중 오류:", e);

    }

    holisticRef.current = null;



    if (rafOverlayRef.current) {

      cancelAnimationFrame(rafOverlayRef.current);

      rafOverlayRef.current = null;

    }



    setTimeout(() => {

      if (target === "home") {

        navigate("/");

      } else if (target === "dashboard") {

        navigate("/dashboard");

      } else {

        navigate(-1);

      }

    }, 100);

  };



  // 💥 MoodTalk 비눗방울 터지는 이펙트 (DOM 버블용)

  const createBubbleBurst = (x: number, y: number) => {

    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {

      const particle = document.createElement("div");

      particle.className = "mood-bubble-particle";

      document.body.appendChild(particle);



      const size = Math.random() * 10 + 5;

      particle.style.width = `${size}px`;

      particle.style.height = `${size}px`;

      particle.style.left = `${x}px`;

      particle.style.top = `${y}px`;



      const destX = (Math.random() - 0.5) * 400;

      const destY = (Math.random() - 0.5) * 400;



      const animation = particle.animate(

        [

          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },

          { transform: `translate(${destX}px, ${destY}px) scale(0)`, opacity: 0 },

        ],

        {

          duration: Math.random() * 500 + 300,

          easing: "cubic-bezier(0, .9, .57, 1)",

          fill: "forwards",

        }

      );



      animation.onfinish = () => particle.remove();

    }

  };



  const handleBubbleClick = () => {

    const bubble = bubbleRef.current;

    if (!bubble) return;



    const rect = bubble.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;

    const centerY = rect.top + rect.height / 2;



    const popText = document.createElement("div");

    popText.className = "mood-bubble-pop-text";

    popText.textContent = "톡!";

    popText.style.left = `${centerX}px`;

    popText.style.top = `${centerY}px`;

    popText.style.transform = "translate(-50%, -50%)";

    document.body.appendChild(popText);



    const textAnimation = popText.animate(

      [

        { transform: "translate(-50%, -50%) scale(0.5)", opacity: 1 },

        { transform: "translate(-50%, -100px) scale(1.5)", opacity: 0 },

      ],

      {

        duration: 600,

        easing: "ease-out",

        fill: "forwards",

      }

    );

    textAnimation.onfinish = () => popText.remove();



    createBubbleBurst(centerX, centerY);



    bubble.style.visibility = "hidden";

    setTimeout(() => {

      bubble.style.visibility = "visible";

      bubble.style.animation = "none";

      // 강제 리플로우

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions

      bubble.offsetHeight;

      bubble.style.animation = "mood-bubble-float 6s ease-in-out infinite";

    }, 1500);

  };



  // ✅ 상태를 ref로 동기화 (RAF 루프의 closure 문제 해결)

  useEffect(() => {

    isGuidingRef.current = isGuiding;

  }, [isGuiding]);



  useEffect(() => {

    stepIdxRef.current = stepIdx;

  }, [stepIdx]);



  useEffect(() => {

    stepRemainingRef.current = stepRemaining;

  }, [stepRemaining]);



  useEffect(() => {

    let camera: Camera | null = null;

    let holistic: Holistic | null = null;

    let stream: MediaStream | null = null;



    const startCameraOnce = async () => {

      if (startedRef.current) return;



      try {

        stream = await navigator.mediaDevices.getUserMedia({

          video: { width: 640, height: 480, facingMode: "user" },

          audio: false,

        });



        const v = videoRef.current!;

        if (v.srcObject !== stream) v.srcObject = stream;



        try {

          await v.play();

          setNeedsTap(false);

        } catch (e) {

          console.warn("autoplay blocked; show start button");

          setNeedsTap(true);

          return;

        }

        startedRef.current = true;

      } catch (err: any) {

        console.error("Camera permission denied:", err);

        setError("카메라 권한이 필요합니다. 브라우저 설정에서 카메라 접근을 허용해주세요.");

        setNeedsTap(true);

        throw err;

      }

    };



    const setup = async () => {

      try {

        setError(null);

        stoppedRef.current = false;



        holistic = new Holistic({

          locateFile: (file) =>

            `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${VERSION}/${file}`,

        });

        holistic.setOptions({

          selfieMode: true,

          modelComplexity: 1,

          smoothLandmarks: true,

          minDetectionConfidence: 0.6,

          minTrackingConfidence: 0.6,

        });



        holisticRef.current = holistic;



        const c = canvasRef.current!;

        const ctx = c.getContext("2d")!;



        const v = videoRef.current!;



        const syncSize = () => {

          if (v.videoWidth && v.videoHeight) {

            if (c.width !== v.videoWidth || c.height !== v.videoHeight) {

              c.width = v.videoWidth;

              c.height = v.videoHeight;

              console.log(`Canvas resized: ${c.width}x${c.height}`);

            }

          }

        };



        const FACE_IDX = {

          eyebrowInnerL: 70,

          eyebrowInnerR: 300,

          eyeOuterL: 130,

          eyeOuterR: 359,

          eyeLowerL: 159,

          eyeLowerR: 386,

          noseTip: 2,

          mouthLower: 17,

        };



        const px = (p: any) => p.x * c.width;

        const py = (p: any) => p.y * c.height;



        holistic.onResults((res) => {

          if (!v.videoWidth || !v.videoHeight) return;

          syncSize();



          const face = res.faceLandmarks;

          const pose = res.poseLandmarks;

          if (!face) return;



          const w = c.width, h = c.height;



          const browL = face[70];

          const EB = browL ? {

            x: px(browL) + OFF.EB.dx * w,

            y: py(browL) + OFF.EB.dy * h

          } : null;



          const eyeOuterL = face[FACE_IDX.eyeOuterL];

          const eyeOuterR = face[FACE_IDX.eyeOuterR];

          const SE_L = eyeOuterL ? { x: px(eyeOuterL), y: py(eyeOuterL) } : null;

          const SE_R = eyeOuterR ? { x: px(eyeOuterR), y: py(eyeOuterR) } : null;



          const leLower = face[159];

          const UE = leLower ? {

            x: px(leLower) + OFF.UE.dx * w,

            y: py(leLower) + OFF.UE.dy * h

          } : null;



          const noseTip = face[FACE_IDX.noseTip];

          const UN = noseTip ? { x: px(noseTip), y: py(noseTip) + 0.02 * h } : null;



          const mouthLower = face[FACE_IDX.mouthLower];

          const CH = mouthLower ? { x: px(mouthLower), y: py(mouthLower) + 0.02 * h } : null;



          let CB: Pt | null = null;

          if (pose?.[11] && pose?.[12]) {

            const ls = pose[11], rs = pose[12];

            CB = {

              x: ((ls.x + rs.x) / 2) * w,

              y: ((ls.y + rs.y) / 2) * h + 0.06 * h,

            };

          } else {

            const chin = face[152];

            if (chin) {

              CB = {

                x: px(chin),

                y: py(chin) + 0.15 * h,

              };

            }

          }



          const browR = face[300];

          let TH: Pt | null = null;

          if (browL && browR) {

            const bx = (px(browL) + px(browR)) / 2;

            const by = (py(browL) + py(browR)) / 2;

            TH = { x: bx, y: by - 0.20 * h };

          }



          const apply = (key: keyof typeof smoothRef.current, pt: Pt | null) => {

            if (!pt) { smoothRef.current[key] = null; return; }

            const prev = smoothRef.current[key];

            const nx = ema(prev?.x ?? null, pt.x, 0.35);

            const ny = ema(prev?.y ?? null, pt.y, 0.35);

            smoothRef.current[key] = { x: nx, y: ny };

          };



          apply("EB", EB);

          apply("SE-L", SE_L);

          apply("SE-R", SE_R);

          apply("UE", UE);

          apply("UN", UN);

          apply("CH", CH);

          apply("CB", CB);

          apply("TH", TH);



          if (smoothRef.current["EB"]) lastValidPoints.current["EB"] = smoothRef.current["EB"];

          if (smoothRef.current["SE-L"]) lastValidPoints.current["SE-L"] = smoothRef.current["SE-L"];

          if (smoothRef.current["SE-R"]) lastValidPoints.current["SE-R"] = smoothRef.current["SE-R"];

          if (smoothRef.current["UE"]) lastValidPoints.current["UE"] = smoothRef.current["UE"];

          if (smoothRef.current["UN"]) lastValidPoints.current["UN"] = smoothRef.current["UN"];

          if (smoothRef.current["CH"]) lastValidPoints.current["CH"] = smoothRef.current["CH"];

          if (smoothRef.current["CB"]) lastValidPoints.current["CB"] = smoothRef.current["CB"];

          if (smoothRef.current["TH"]) lastValidPoints.current["TH"] = smoothRef.current["TH"];



          const nowTap = performance.now();

          const currentGuide = guideEngineRef.current;



          // @ts-ignore

          const leftHand  = (res as any).leftHandLandmarks;

          // @ts-ignore

          const rightHand = (res as any).rightHandLandmarks;



          if (currentGuide.running && currentGuide.phase === "tapping") {

            const curStep = SEQUENCE[currentGuide.stepIdx];

            const curId = curStep.id;



            const curPt: Pt | null =

              curId === "EB"   ? smoothRef.current["EB"]   || lastValidPoints.current["EB"]   :

              curId === "SE-L" ? smoothRef.current["SE-L"] || lastValidPoints.current["SE-L"] :

              curId === "SE-R" ? smoothRef.current["SE-R"] || lastValidPoints.current["SE-R"] :

              curId === "UE"   ? smoothRef.current["UE"]   || lastValidPoints.current["UE"]   :

              curId === "UN"   ? smoothRef.current["UN"]   || lastValidPoints.current["UN"]   :

              curId === "CH"   ? smoothRef.current["CH"]   || lastValidPoints.current["CH"]   :

              curId === "CB"   ? smoothRef.current["CB"]   || lastValidPoints.current["CB"]   :

              curId === "TH"   ? smoothRef.current["TH"]   || lastValidPoints.current["TH"]   :

              null;



            if (curPt && (leftHand || rightHand)) {

              const fingers: Pt[] = [];



              const pushFinger = (hand: any, idx: number) => {

                if (hand && hand[idx]) {

                  fingers.push({ x: px(hand[idx]), y: py(hand[idx]) });

                }

              };



              if (leftHand) {

                pushFinger(leftHand, 8);

              }

              if (rightHand) {

                pushFinger(rightHand, 8);

              }



              let hit = false;

              for (const f of fingers) {

                const dx = f.x - curPt.x;

                const dy = f.y - curPt.y;

                const distSq = dx * dx + dy * dy;

                if (distSq <= TAP_DISTANCE_PX * TAP_DISTANCE_PX) {

                  hit = true;

                  break;

                }

              }



              if (hit && nowTap - lastTapTimeRef.current > TAP_COOLDOWN_MS) {

                lastTapTimeRef.current = nowTap;



                if (moodScoreRef.current > 0) {

                  const next = moodScoreRef.current - 1;



                  moodScoreRef.current = next;

                  setMoodScore(next);



                  lastBubblePopTimeRef.current = nowTap;



                  // 🫧 DOM 버블 위치 (비율) 저장 + 리렌더 트리거

                  setBubblePos({

                    x: curPt.x / c.width,

                    y: curPt.y / c.height,

                  });

                  setBubblePopKey((k) => k + 1);





                  try {

                    const pitch = 800 + next * 100;

                    playBeep(pitch, 80);

                  } catch (e) {

                    console.warn("playBeep error", e);

                  }



                  if (typeof navigator !== "undefined" && "vibrate" in navigator) {

                    navigator.vibrate(40);

                  }



                  //0이 되면 다음 포인트로 넘기는 로직은 옵션

                  if (next <= 0) {

                    guideEngineRef.current.deadlineMs = nowTap;

                  }

                }

              }

            }

          }



          setReady(true);

        });



        camera = new Camera(v, {

          onFrame: async () => {

            if (stoppedRef.current || sendingRef.current) return;



            const h = holisticRef.current;

            const vEl = videoRef.current;

            if (!h || !vEl || !vEl.videoWidth || !vEl.videoHeight) return;



            sendingRef.current = true;

            try {

              await h.send({ image: vEl });

            } catch (e: any) {

              console.warn("holistic.send failed", e);

              stoppedRef.current = true;

              try { camera?.stop(); } catch {}

              try { h.close(); } catch {}

              holisticRef.current = null;

            } finally {

              sendingRef.current = false;

            }

          },

          width: 640, height: 480,

        });

        camera.start();



        const drawOverlay = (t: number) => {

          pulseRef.current = t;

          const now = performance.now();



          if (guideEngineRef.current.running) {

            const eng = guideEngineRef.current;



            if (eng.phase === "tapping") {

              const cur = SEQUENCE[eng.stepIdx];

              const remainMs = Math.max(0, eng.deadlineMs - now);

              const remainSec = Math.ceil(remainMs / 1000);



              setStepIdx(eng.stepIdx);

              setStepRemaining(remainSec);



              if (remainMs <= 0) {

                const nextStep = eng.stepIdx + 1;

                if (nextStep < SEQUENCE.length) {

                  guideEngineRef.current = {

                    ...eng,

                    stepIdx: nextStep,

                    deadlineMs: now + SEQUENCE[nextStep].seconds * 1000,

                  };

                  setStepIdx(nextStep);

                  setStepRemaining(SEQUENCE[nextStep].seconds);

                  console.log(`라운드 ${eng.round + 1}/3 - ${SEQUENCE[nextStep].label_ko} 시작`);

                  playBeep(880, 150);

                  vibrate(100);

                } else {

                  const nextRound = eng.round + 1;

                  if (nextRound < TAPPING_ROUNDS) {

                    guideEngineRef.current = {

                      running: true,

                      phase: "tapping",

                      stepIdx: 0,

                      round: nextRound,

                      deadlineMs: now + SEQUENCE[0].seconds * 1000,

                    };

                    setStepIdx(0);

                    setStepRemaining(SEQUENCE[0].seconds);

                    console.log(`라운드 ${nextRound + 1}/3 시작!`);

                    playBeep(1100, 200);

                    vibrate(150);

                  } else {

                    guideEngineRef.current = {

                      running: true,

                      phase: "breath",

                      stepIdx: 0,

                      round: nextRound,

                      deadlineMs: 0,

                      breathPart: "INHALE",

                      breathDeadlineMs: now + BREATH_INHALE * 1000,

                    };

                    console.log("🌬️ 탭핑 완료! 호흡 단계 시작 - 들이쉬기");

                    playBeep(660, 300);

                    vibrate(200);

                  }

                }

              }

            } else if (eng.phase === "breath") {

              const end = eng.breathDeadlineMs ?? now;

              const remainMs = Math.max(0, end - now);

              const remainSec = Math.ceil(remainMs / 1000);



              if (remainMs <= 0) {

                if (eng.breathPart === "INHALE") {

                  guideEngineRef.current.breathPart = "HOLD";

                  guideEngineRef.current.breathDeadlineMs = now + BREATH_HOLD * 1000;

                  console.log("🫁 호흡 - 멈추기 단계");

                  playBeep(550, 100);

                  vibrate(80);

                } else if (eng.breathPart === "HOLD") {

                  guideEngineRef.current.breathPart = "EXHALE";

                  guideEngineRef.current.breathDeadlineMs = now + BREATH_EXHALE * 1000;

                  console.log("💨 호흡 - 내쉬기 단계");

                  playBeep(440, 200);

                  vibrate(120);

                } else {

                  guideEngineRef.current.running = false;

                  guideEngineRef.current.phase = "done";

                  setIsGuiding(false);

                  console.log("🎉 EFT 세션 완전 종료!");

                  playBeep(1320, 500);

                  vibrate(300);

                }

              }

            }

          }



          ctx.clearRect(0, 0, c.width, c.height);



          const drawPoint = (key: StepId, label: string, color: string, isCurrentPoint = false) => {

            const p = smoothRef.current[key] || lastValidPoints.current[key];

            if (!p) return;



            if (key === "SE-L" && arParams.side === "right") return;

            if (key === "SE-R" && arParams.side === "left") return;



            if (isCurrentPoint) {

              const pulseScale = 1.5 + Math.sin(t * 0.008) * 0.3;

              ctx.beginPath();

              ctx.arc(p.x, p.y, 15 * pulseScale, 0, Math.PI * 2);

              ctx.strokeStyle = "rgba(255,255,0,0.8)";

              ctx.lineWidth = 4;

              ctx.stroke();



              ctx.beginPath();

              ctx.arc(p.x, p.y, 20 * pulseScale, 0, Math.PI * 2);

              ctx.strokeStyle = "rgba(255,255,0,0.3)";

              ctx.lineWidth = 2;

              ctx.stroke();

            }



            ctx.beginPath();

            ctx.arc(p.x, p.y, isCurrentPoint ? 9 : 7, 0, Math.PI * 2);

            ctx.fillStyle = isCurrentPoint ? "rgba(255,255,0,1)" : color;

            ctx.fill();



            ctx.font = isCurrentPoint ? "14px system-ui, sans-serif" : "12px system-ui, sans-serif";

            ctx.fillStyle = isCurrentPoint ? "rgba(255,255,0,0.9)" : "rgba(0,0,0,0.7)";

            ctx.fillText(label, p.x + 9, p.y - 9);

          };



          const guide = guideEngineRef.current;

          const guideActiveId: StepId | null =

            guide.running && guide.phase === "tapping"

              ? SEQUENCE[guide.stepIdx].id

              : null;



          const activePointId: StepId | null = guideActiveId;

          const isGuidedMode = !!guideActiveId;



          const allPoints: Array<{key: StepId, label: string, color: string}> = [

            {key: "EB",   label: "EB",   color: "rgba(0,200,255,0.95)"},

            {key: "SE-L", label: "SE-L", color: "rgba(255,120,0,0.95)"},

            {key: "SE-R", label: "SE-R", color: "rgba(255,120,0,0.95)"},

            {key: "UE",   label: "UE",   color: "rgba(50,200,50,0.95)"},

            {key: "UN",   label: "UN",   color: "rgba(150,120,255,0.95)"},

            {key: "CH",   label: "CH",   color: "rgba(255,80,160,0.95)"},

            {key: "CB",   label: "CB",   color: "rgba(0,160,255,0.95)"},

            {key: "TH",   label: "TH",   color: "rgba(255,200,0,0.95)"},

          ];



          allPoints.forEach(({key, label, color}) => {

            if (isGuidedMode && activePointId && key !== activePointId) return;

            const isCurrentPoint = !!activePointId && activePointId === key;

            drawPoint(key, label, color, isCurrentPoint);

          });



          if (arParams.emotion != null && typeof arParams.intensity === "number") {

            const emotionText = `감정: ${arParams.emotion} (${arParams.intensity}/10)`;

            drawPill(ctx, 10, 10, emotionText, { font: "14px system-ui, sans-serif" });

          }



          if (round && arParams.rounds) {

            const roundText = `라운드: ${round}/${arParams.rounds}  (${elapsed}s / ${arParams.durationSec}s)`;

            drawPill(ctx, 10, 44, roundText, { font: "12px system-ui, sans-serif" });

          }



          if (activePointId) {

            const meta = SEQUENCE.find(s => s.id === activePointId);

            const labelKo = meta?.label_ko ?? activePointId;

            const labelEn = meta?.label_en ?? activePointId;



            const textKo = guideActiveId

              ? `여기를 가볍게 두드려 주세요: ${labelKo}`

              : `현재 포인트: ${labelKo}`;

            const textEn = guideActiveId

              ? `Tap gently here: ${labelEn}`

              : `Current point: ${labelEn}`;



            const pointText = lang === "ko" ? textKo : textEn;



            ctx.save();

            ctx.font = "16px system-ui, sans-serif";

            const w = ctx.measureText(pointText).width;

            const x = (c.width - w) / 2;

            const y = c.height - 48;

            ctx.fillStyle = "rgba(0,0,0,0.6)";

            ctx.fillRect(x - 10, y - 20, w + 20, 30);

            ctx.fillStyle = "rgba(255,255,0,1)";

            ctx.fillText(pointText, x, y);

            ctx.restore();

          }



          if (arParams.affirm) {

            const nowT = typeof t === "number" ? t : performance.now();

            const alpha = Math.min(1, Math.max(0, (nowT % 3000) / 1200));

            ctx.save();

            ctx.globalAlpha = alpha;

            drawCenteredWrapped(ctx, c, arParams.affirm, {

              font: "18px system-ui, sans-serif",

              maxWidthRatio: 0.9,

              lineHeight: 28,

              centerY: c.height / 2 + 80,

              box: "rgba(0,0,0,0.45)",

              color: "rgba(255,255,255,1)",

            });

            ctx.restore();

          }



          if (guideEngineRef.current.running || isGuidingRef.current) {

            const eng = guideEngineRef.current;



            if (eng.phase === "tapping") {

              const cur = SEQUENCE[eng.stepIdx];

              const p = smoothRef.current[cur.id] || lastValidPoints.current[cur.id];



              if (p && guideEngineRef.current.running) {

                const elapsedSincePop = now - lastBubblePopTimeRef.current;



                if (elapsedSincePop >= 0 && elapsedSincePop <= BUBBLE_POP_DURATION) {

                  let progress = elapsedSincePop / BUBBLE_POP_DURATION;

                  progress = Math.min(1, Math.max(0, progress));

                  const easeOut = 1 - Math.pow(1 - progress, 3);



                  const currentRadius = 5 + easeOut * (BUBBLE_MAX_RADIUS - 5);

                  const opacity = 1 - progress;



                  ctx.save();



                  ctx.beginPath();

                  ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2);

                  const gradient = ctx.createRadialGradient(

                    p.x, p.y, currentRadius * 0.8,

                    p.x, p.y, currentRadius

                  );

                  gradient.addColorStop(0, `rgba(200, 230, 255, 0)`);

                  gradient.addColorStop(0.8, `rgba(173, 216, 230, ${opacity * 0.8})`);

                  gradient.addColorStop(1, `rgba(255, 255, 255, ${opacity * 0.6})`);

                  ctx.strokeStyle = gradient;

                  ctx.lineWidth = 4 * (1 - progress);

                  ctx.stroke();



                  ctx.beginPath();

                  ctx.arc(p.x, p.y, currentRadius * 0.65, 0, Math.PI * 2);

                  ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.4})`;

                  ctx.lineWidth = 2 * (1 - progress);

                  ctx.stroke();



                  if (progress < 0.5) {

                    ctx.beginPath();

                    ctx.arc(

                      p.x - currentRadius * 0.3,

                      p.y - currentRadius * 0.3,

                      3 * (1 - progress * 2),

                      0,

                      Math.PI * 2

                    );

                    ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.9})`;

                    ctx.fill();

                  }



                  ctx.font = "bold 15px system-ui, sans-serif";

                  ctx.textAlign = "center";

                  ctx.textBaseline = "middle";

                  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, opacity + 0.2)})`;

                  ctx.fillText("무드톡", p.x, p.y - 4);



                  ctx.font = "bold 17px system-ui, sans-serif";

                  ctx.fillText(String(moodScoreRef.current), p.x, p.y + 16);



                  ctx.restore();

                }

              }



              if (guideEngineRef.current.running) {

                const remainMs = Math.max(0, eng.deadlineMs - now);

                const remainSec = Math.ceil(remainMs / 1000);

                const ratio = 1 - remainMs / (SEQUENCE[eng.stepIdx].seconds * 1000);



                const pad = 14;

                const barW = Math.min(420, c.width - pad * 2);

                const barH = 10;

                const x = (c.width - barW) / 2;

                const y = 18;



                ctx.fillStyle = "rgba(255,255,255,0.9)";

                ctx.fillRect(x - 12, y - 32, barW + 24, 44);

                ctx.strokeStyle = "rgba(0,0,0,0.15)";

                ctx.strokeRect(x - 12, y - 32, barW + 24, 44);



                ctx.font = "14px system-ui, sans-serif";

                ctx.fillStyle = "rgba(20,20,20,0.9)";

                ctx.textAlign = "left";

                const roundTxt = TEXTS[lang].round(eng.round + 1, TAPPING_ROUNDS);

                const remainTxt = TEXTS[lang].remaining(remainSec);

                const cur = SEQUENCE[eng.stepIdx];

                const label = lang === "ko" ? cur.label_ko : cur.label_en;

                ctx.fillText(`${roundTxt} - ${label} — ${remainTxt}`, x, y - 12);



                ctx.fillStyle = "rgba(0,120,255,0.9)";

                ctx.fillRect(x, y, barW * ratio, barH);

                ctx.fillStyle = "rgba(0,0,0,0.15)";

                ctx.fillRect(x + barW * ratio, y, barW * (1 - ratio), barH);

                ctx.strokeStyle = "rgba(0,0,0,0.25)";

                ctx.strokeRect(x, y, barW, barH);

              }

            } else if (eng.phase === "breath") {

              const end = eng.breathDeadlineMs ?? now;

              const remainMs = Math.max(0, end - now);

              const remainSec = Math.ceil(remainMs / 1000);



              const cx = c.width / 2, cy = c.height / 2;

              let radius = BREATH_RADIUS_MIN;



              if (eng.breathPart === "INHALE") {

                const total = BREATH_INHALE * 1000;

                const progress = 1 - remainMs / total;

                radius = BREATH_RADIUS_MIN + (BREATH_RADIUS_MAX - BREATH_RADIUS_MIN) * progress;

              } else if (eng.breathPart === "HOLD") {

                radius = BREATH_RADIUS_MAX;

              } else if (eng.breathPart === "EXHALE") {

                const total = BREATH_EXHALE * 1000;

                const progress = 1 - remainMs / total;

                radius = BREATH_RADIUS_MAX - (BREATH_RADIUS_MAX - BREATH_RADIUS_MIN) * progress;

              }



              ctx.beginPath();

              ctx.arc(cx, cy, radius, 0, Math.PI * 2);

              ctx.strokeStyle = "rgba(0, 200, 255, 0.9)";

              ctx.lineWidth = 6;

              ctx.stroke();



              const phaseLabel =

                eng.breathPart === "INHALE" ? TEXTS[lang].breathInhale :

                eng.breathPart === "HOLD"   ? TEXTS[lang].breathHold   : TEXTS[lang].breathExhale;

              ctx.font = "18px system-ui, sans-serif";

              ctx.fillStyle = "rgba(0,0,0,0.8)";

              ctx.textAlign = "center";

              ctx.textBaseline = "middle";

              const ty = Math.max(24, cy - radius - 16);

              const remainTxt = TEXTS[lang].remaining(remainSec);

              ctx.fillText(`${phaseLabel} — ${remainTxt}`, cx, ty);

            }

          }



          rafOverlayRef.current = requestAnimationFrame(drawOverlay);

        };

        rafOverlayRef.current = requestAnimationFrame(drawOverlay);



        const startGuide = () => {

          console.log("🚀 startGuide 호출됨! 7포인트 × 3라운드 + 호흡 시작");

          const now = performance.now();

          const firstStep = SEQUENCE[0];



          setMoodScore(8);

          moodScoreRef.current = 8;



          guideEngineRef.current = {

            running: true,

            phase: "tapping",

            stepIdx: 0,

            round: 0,

            deadlineMs: now + firstStep.seconds * 1000,

          };



          setIsGuiding(true);

          setStepIdx(0);

          setStepRemaining(firstStep.seconds);



          console.log("라운드 1/3 시작 - 탭핑 단계 진입");

          playBeep(1000, 200);

          vibrate(150);

        };



        (window as any).__startEFTGuide = startGuide;

        (window as any).__startCamera = startCameraOnce;

      } catch (e: any) {

        console.error(e);

        setError(e?.message ?? "초기화 실패");

      }

    };



    setup();



    return () => {

      stoppedRef.current = true;

      guideEngineRef.current.running = false;

      guideEngineRef.current.phase = "tapping";

      guideEngineRef.current.round = 0;

      guideEngineRef.current.breathPart = undefined;

      guideEngineRef.current.breathDeadlineMs = 0;



      try { camera?.stop(); } catch {}

      try { holisticRef.current?.close(); } catch {}

      holisticRef.current = null;



      if (rafOverlayRef.current) {

        cancelAnimationFrame(rafOverlayRef.current);

        rafOverlayRef.current = null;

      }



      if ((window as any).__startEFTGuide) delete (window as any).__startEFTGuide;

      const s = videoRef.current?.srcObject as MediaStream | null;

      s?.getTracks().forEach(t => t.stop());

    };

  }, []);



  return (

    <div className="min-h-screen bg-gray-50 p-4">

      <div className="max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-4">

          <div className="flex gap-2">

            <button

              onClick={() => handleBack("back")}

              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"

            >

              {texts.backToAI}

            </button>

            <button

              onClick={() => handleBack("dashboard")}

              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"

            >

              {texts.dashboard}

            </button>

            <button

              onClick={() => handleBack("home")}

              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"

            >

              {texts.home}

            </button>

          </div>

          <h1 className="text-3xl font-bold">{texts.title}</h1>

          <div className="flex items-center gap-2">

            <button

              onClick={() => setLang(lang === "ko" ? "en" : "ko")}

              className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"

              title={lang === "ko" ? "영어로 전환" : "Switch to Korean"}

            >

              {lang === "ko" ? "EN" : "한"}

            </button>

          </div>

        </div>



        {error && (

          <div className="mb-3 p-3 bg-red-100 border border-red-300 rounded-md">

            <p className="text-red-700">{texts.error} {error}</p>

          </div>

        )}



        {/* 4:3 종횡비 컨테이너 */}

        <div className="relative w-full max-w-2xl mx-auto">

          <div className="relative w-full aspect-[4/3] rounded-lg shadow overflow-hidden bg-black/10">

            <video

              ref={videoRef}

              className="absolute inset-0 w-full h-full object-cover"

              autoPlay

              muted

              playsInline

              style={{ transform: "scaleX(-1)" }}

              onLoadedMetadata={() => {

                const v = videoRef.current;

                const c = canvasRef.current;

                if (v && c && v.videoWidth && v.videoHeight) {

                  if (c.width !== v.videoWidth || c.height !== v.videoHeight) {

                    c.width = v.videoWidth; c.height = v.videoHeight;

                  }

                }

              }}

            />

            <canvas

              ref={canvasRef}

              className="absolute inset-0 w-full h-full"

              style={{ zIndex: 10, pointerEvents: "none" }}

            />



            {/* 🫧 EFT 포인트에서 팝 되는 버블 */}

{bubblePos && (

  <div

    key={bubblePopKey}

    className="mood-bubble"

    style={{

      position: "absolute",

      left: `${bubblePos.x * 100}%`,

      top: `${bubblePos.y * 100}%`,

      transform: "translate(-50%, -50%)",

      pointerEvents: "none",

      animation: "mood-bubble-pop 0.8s ease-out forwards",

      zIndex: 30,

    }}

  >

    <div className="mood-bubble-text">

      <div style={{ fontSize: 18, marginBottom: 2 }}>톡!</div>

      <div style={{ fontSize: 24, fontWeight: 700 }}>{moodScore}</div>

    </div>

  </div>

)}



          </div>   {/* aspect-[4/3] div 닫힘 */}

        </div>     {/* max-w-2xl div 닫힘 */}





        {needsTap && (

          <div className="mt-2 text-center">

            <button

              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"

              onClick={async () => {

                try {

                  await (window as any).__startCamera?.();

                  setNeedsTap(false);

                } catch (e: any) {

                  console.error("Camera start failed", e);

                  setError(e?.message || "카메라 시작 실패");

                }

              }}

            >

              {texts.cameraStart}

            </button>

          </div>

        )}



        <div className="mt-3 flex items-center justify-center gap-2">

          <button

            className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"

            onClick={() => setIsGuiding(true)}

            disabled={isGuiding || !ready}

            title={lang === "ko" ? "가이드 수동 시작(타이머는 아래 버튼)" : "Manual guide start (timer below)"}

          >

            {texts.highlight}

          </button>

          <button

            className="px-4 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"

            onClick={() => {

              (window as any).__startEFTGuide?.();

            }}

            disabled={!ready}

          >

            {texts.startGuide}

          </button>

          <button

            className="px-4 py-2 rounded bg-gray-200 text-gray-800 text-sm hover:bg-gray-300"

            onClick={() => {

              guideEngineRef.current.running = false;

              guideEngineRef.current.phase = "tapping";

              guideEngineRef.current.round = 0;

              guideEngineRef.current.breathPart = undefined;

              guideEngineRef.current.breathDeadlineMs = 0;



              stoppedRef.current = true;

              try { holisticRef.current?.close(); } catch {}

              holisticRef.current = null;



              setIsGuiding(false);

              setStepIdx(0);

              setStepRemaining(SEQUENCE[0].seconds);

              console.log("🛑 EFT 가이드 완전 초기화 및 중지 (WASM 안전)");

            }}

          >

            {texts.stop}

          </button>

        </div>

      </div>

    </div>

  );

}