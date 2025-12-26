// 🕳 두더지 프레임 이미지 (128x119)
import up1 from "@/assets/motion/up1.png";
import up2 from "@/assets/motion/up2.png";
import up3 from "@/assets/motion/up3.png";

import stand1 from "@/assets/motion/stand1.png";
import stand2 from "@/assets/motion/stand2.png";
import stand3 from "@/assets/motion/stand3.png";

import down1 from "@/assets/motion/down1.png";
import down2 from "@/assets/motion/down2.png";
import down3 from "@/assets/motion/down3.png";

// 올라오는 3장 → 서있는 3장 → 내려가는 3장 순서
const MOLE_FRAMES = [
  up1, up2, up3,        // 올라오는 3장
  stand1, stand2, stand3, // 서있는 3장
  down1, down2, down3,  // 내려가는 3장
];

import introImg from "@/assets/moodtoc-intro.png"; // 🔹 인트로 이미지 경로 (네가 저장한 위치에 맞게 수정)

import { useEffect, useRef, useState } from "react";

import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEFTScript } from '../contexts/EFTScriptContext';
import SUDSModal from '../components/modals/SUDSModal';
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

  emotion: EmotionKey;     // 감정 키

  intensity: number;       // 0~10 (SUDS)

  points: EFTCode[];       // 탭핑 포인트

  durationSec: number;     // 라운드 당 지속(초)

  rounds: number;          // 라운드 수

  tempoBpm: number;        // 가이드 템포(BPM)

  side: SideKey;           // 양쪽/좌/우

  affirm?: string;         // 확언 문구 (옵션)

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

  full:  ["TH","EB","SE-L","SE-R","UE","UN","CH","CB"], // UA 제거

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

    emotion:     parseEmotion(sp, DEFAULT_PARAMS.emotion),

    intensity:   intensityValue,

    points:      parsePoints(sp, DEFAULT_PARAMS.points),

    durationSec: getNum(sp, "duration",   DEFAULT_PARAMS.durationSec, 15, 600),

    rounds:      getNum(sp, "rounds",     DEFAULT_PARAMS.rounds, 1, 20),

    tempoBpm:    getNum(sp, "tempo",      DEFAULT_PARAMS.tempoBpm, 30, 120),

    side:        parseSide(sp, DEFAULT_PARAMS.side),

    affirm:      getStr(sp, "affirm", DEFAULT_PARAMS.affirm),

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

// 🔊 오디오 피드백 유틸 (싱글톤 AudioContext + 에러 시 자동 비활성화)
let globalAudioCtx: AudioContext | null = null;
let audioBroken = false;

function getAudioContext(): AudioContext | null {
  if (audioBroken) return null;
  try {
    if (!globalAudioCtx) {
      const AC = (window.AudioContext ||
        (window as any).webkitAudioContext) as typeof AudioContext;
      globalAudioCtx = new AC();

      // 상태 변화를 보다가 문제가 생기면 비활성화
      globalAudioCtx.onstatechange = () => {
        if (globalAudioCtx && globalAudioCtx.state === "closed") {
          audioBroken = true;
          globalAudioCtx = null;
        }
      };
    }

    if (globalAudioCtx.state === "suspended") {
      // 유저 제스처 이후라면 resume 가능
      globalAudioCtx.resume().catch(() => {
        audioBroken = true;
        globalAudioCtx = null;
      });
    }

    return globalAudioCtx;
  } catch (e) {
    console.warn("AudioContext 생성 실패, 이후 비프 비활성화", e);
    audioBroken = true;
    globalAudioCtx = null;
    return null;
  }
}

function playBeep(frequency = 880, duration = 200) {
  if (audioBroken) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = frequency;

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    const durSec = duration / 1000;

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durSec);

    osc.start(now);
    osc.stop(now + durSec);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch (e) {
    console.warn("playBeep 실패, 오디오 비활성화", e);
    audioBroken = true;
    if (globalAudioCtx) {
      try {
        globalAudioCtx.close();
      } catch {}
      globalAudioCtx = null;
    }
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

    //title: "EFT 가이드",

    startGuide: "시작하기",

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

const BREATH_HOLD   = 4;

const BREATH_EXHALE = 6;



// 호흡 UI (원 애니메이션) 반경 범위

const BREATH_RADIUS_MIN = 30;

const BREATH_RADIUS_MAX = 120;



type StepId = "TH" | "EB" | "SE-L" | "SE-R" | "UE" | "UN" | "CH" | "CB";

type GuidePhase = "tapping" | "breath" | "done";

type GuideEngine = {

  running: boolean;

  phase: GuidePhase;

  stepIdx: number;     // 탭핑 단계 인덱스

  round: number;       // 현재 몇 라운드(0~TAPPING_ROUNDS-1)

  deadlineMs: number;  // 현재 단계 마감시각

  breathPart?: "INHALE" | "HOLD" | "EXHALE";

  breathDeadlineMs?: number;

};



// 좌표 미세조정(비율). 필요시 숫자만 바꿔서 튜닝해요.

const OFF = {

  EB: { dx:0.079, dy: -0.010 }, // 원래 위치로 (좌우 이동 없음)

  UE: { dx: -0.0, dy:  0.055 }, // 왼쪽/아래로 살짝

};



const SEQUENCE: Array<{ id: StepId; label_ko: string; label_en: string; seconds: number }> = [

  { id: "TH",   label_ko: "정수리",       label_en: "Top of Head",   seconds: STEP_SECONDS },

  { id: "EB",   label_ko: "눈썹 앞",      label_en: "Eyebrow",       seconds: STEP_SECONDS },

  { id: "SE-L", label_ko: "눈 옆 (좌)",   label_en: "Side (L)",      seconds: STEP_SECONDS },

  { id: "SE-R", label_ko: "눈 옆 (우)",   label_en: "Side (R)",      seconds: STEP_SECONDS },

  { id: "UE",   label_ko: "눈 밑",        label_en: "Under Eye",     seconds: STEP_SECONDS },

  { id: "UN",   label_ko: "코 밑",        label_en: "Under Nose",    seconds: STEP_SECONDS },

  { id: "CH",   label_ko: "입술 아래",    label_en: "Chin",          seconds: STEP_SECONDS },

  { id: "CB",   label_ko: "쇄골",         label_en: "Collarbone",    seconds: STEP_SECONDS },

];



// 🫧 버블 애니메이션 설정 (EFT 포인트 버블용)

const BUBBLE_POP_DURATION = 800;   // 한 번 터질 때까지(ms)

const BUBBLE_MAX_RADIUS = 45;      // 버블 최대 반경(px)



// ✋ 탭 감지 설정

const TAP_DISTANCE_PX = 40;        // 손가락 ↔ 포인트 거리 임계값(px)

const TAP_COOLDOWN_MS = 250;       // 연속 탭 중복 감지 방지(ms)



export default function ARHolisticTest() {


  const [showPostSUDS, setShowPostSUDS] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { strictIntake?: any; intensity_before?: number } | undefined) || {};
  const strictIntake = locationState?.strictIntake;
  const intensityBefore = locationState?.intensity_before;

  // EFT Script Context에서 데이터 가져오기
  const { eftScript } = useEFTScript();

  // 디버깅: Context로부터 받은 스크립트 내용을 확인합니다.
  useEffect(() => {
    console.log("[DEBUG] Script received from context:", eftScript);
  }, [eftScript]);
  
  const setupPhrase = eftScript?.setup_phrase || '';
  const focusWords = eftScript?.focus_words || [];
  
  // URL 파라미터 (AR 설정용)
  const [searchParams] = useSearchParams();

  const [arParams, setArParams] = useState<ARParams>(DEFAULT_PARAMS);

  const videoRef = useRef<HTMLVideoElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const holisticRef = useRef<Holistic | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [ready, setReady] = useState(false);

  const [needsTap, setNeedsTap] = useState(false);

  const [introPhase, setIntroPhase] = useState<'title' | 'setup' | 'game'>('title'); // 🔹 처음엔 인트로 보여주기
  const [sessionDone, setSessionDone] = useState(false);

  const handleStartBoxBreathing = () => {
    navigate("/ar-box-breathing", {
      state: {
        strictIntake,
        intensity_before: intensityBefore,
      },
    });
  };

  const handleStartIntro = async () => {
    // 게임 단계로 변경
    setIntroPhase('game');
    try {
      // 카메라 먼저 안전하게 시작 (있으면)
      await (window as any).__startCamera?.();
    } catch (e) {
      console.warn("startCamera from intro failed", e);
    }
    // EFT 가이드 시작
    (window as any).__startEFTGuide?.();

    // 🔸 선택: 재방문 시 인트로 스킵하고 싶으면 이 줄 활성화
    // localStorage.setItem("eft-ar-intro-seen", "true");
  };




  // 🧠 무드 점수 (각 포인트마다 8 → 0)

    const [moodScore, setMoodScore] = useState(8);
    const [activeFocusWord, setActiveFocusWord] = useState<string>("");

    const moodScoreRef = useRef(8);

    const [isBubbleVisible, setIsBubbleVisible] = useState(true); // 비눗방울 보임 여부 

    // 🕳 두더지 상태
  const [molePos, setMolePos] = useState<{ x: number; y: number } | null>(null); // 0~1 비율
  const [moleFrame, setMoleFrame] = useState(3);  // 기본은 서 있는 프레임 (stand1)
  const [moleActive, setMoleActive] = useState(false);

  // hit 애니메이션 타이머 관리
  // hit 애니메이션 타이머 관리
const moleHideTimeoutRef = useRef<number | null>(null);

// 🫧 비눗방울 리필 타이머 (8회 태핑용)
const bubbleRespawnTimeoutRef = useRef<number | null>(null);


  useEffect(() => {

    moodScoreRef.current = moodScore;

  }, [moodScore]);

  // ⏱ 두더지 프레임 애니메이션 (위→서기→아래 반복)
  useEffect(() => {
    if (!moleActive) return;

    // 프레임 속도 (ms) – 필요하면 80~150 사이에서 조절
    const FRAME_MS = 90;

    // 단순 0~8 순환 대신, 위→서기→아래 느낌 주고 싶으면 이런 패턴 써도 됨
    const animSeq = [0,1,2,3,4,5,4,3,2,1,0]; // 살짝 올라갔다 다시 내려오는 루프

    let idx = 0;
    setMoleFrame(animSeq[0]);

    const id = window.setInterval(() => {
      idx = (idx + 1) % animSeq.length;
      setMoleFrame(animSeq[idx]);
    }, FRAME_MS);

    return () => window.clearInterval(id);
  }, [moleActive]);

  // 🔸 선택: 첫 방문에만 인트로 보여주기
  useEffect(() => {
    const seen = localStorage.getItem("eft-ar-intro-seen");
    if (seen === "true") {
      setShowIntro(false);
    }
  }, []);



    // 🫧 DOM 버블 위치 & 리렌더 트리거

// (삭제) bubblePos / bubblePopKey 상태 제거

    // 💬 "톡!" 텍스트 DOM 생성
  const spawnPopText = (x: number, y: number) => {
    const popText = document.createElement("div");
    popText.className = "mood-bubble-pop-text";
    popText.textContent = "톡!";
    popText.style.left = `${x}px`;
    popText.style.top = `${y}px`;
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
  };

  // 💥 MoodTalk 비눗방울 터지는 파티클
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

  // 🔔 한 번에 "톡!" + 파티클 발동
  const triggerBubblePopEffect = (screenX: number, screenY: number) => {
    spawnPopText(screenX, screenY);
    createBubbleBurst(screenX, screenY);
  };




  // 버블/탭 타이밍

  const lastBubblePopTimeRef = useRef<number>(-Infinity);

  const lastTapTimeRef = useRef<number>(-Infinity);
// 🔥 비눗방울이 지금 '있는지' 즉시 확인하는 잠금장치
const isBubbleVisibleRef = useRef(true); 

// State와 Ref를 동기화 (화면 업데이트와 로직 잠금을 동시에 관리)
useEffect(() => {
  isBubbleVisibleRef.current = isBubbleVisible;
}, [isBubbleVisible]);



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

  // useEffect(() => {
  //   // 포인트 바뀌면 기본 서 있는 프레임으로 리셋
  //   setMoleFrame(3);      // stand1 (MOLE_FRAMES[3])
  //   setMoleActive(true);  // 새 포인트에서 다시 보이기
  // }, [stepIdx]);

  // 🔁 가이드 포인트가 바뀔 때마다 두더지 다시 올라오게 + 단어 설정
  useEffect(() => {
    // ✅ 이전 포인트 리필 타이머 정리
    if (bubbleRespawnTimeoutRef.current) {
      window.clearTimeout(bubbleRespawnTimeoutRef.current);
      bubbleRespawnTimeoutRef.current = null;
    }

    // 🔥 포인트 변경 시 점수(8) 및 잠금장치 초기화
    moodScoreRef.current = 8;
    setMoodScore(8);
    isBubbleVisibleRef.current = true;
    setIsBubbleVisible(true);
  
    if (focusWords && focusWords.length > 0) {
      const randomWord = focusWords[Math.floor(Math.random() * focusWords.length)];
      setActiveFocusWord(randomWord);
    } else {
      setActiveFocusWord(""); 
    }
  }, [stepIdx, focusWords]);



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

          const leftHand = (res as any).leftHandLandmarks;
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

            if (curPt) {
              setMolePos({
                x: curPt.x / c.width,
                y: curPt.y / c.height,
              });
              setMoleActive(true);
            } else {
              setMoleActive(false);
            }

            if (curPt && (leftHand || rightHand)) {
              const fingers: Pt[] = [];
              const pushFinger = (hand: any, idx: number) => {
                if (hand && hand[idx]) {
                  fingers.push({ x: px(hand[idx]), y: py(hand[idx]) });
                }
              };

              if (leftHand) pushFinger(leftHand, 8);
              if (rightHand) pushFinger(rightHand, 8);

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

              // 🔥 수정된 핵심 로직: hit이고 쿨다운 지났으며 비눗방울이 보이는 상태일 때만!
              if (hit && (nowTap - lastTapTimeRef.current > TAP_COOLDOWN_MS) && isBubbleVisibleRef.current) {
                lastTapTimeRef.current = nowTap;
                
                // 즉시 잠금
                isBubbleVisibleRef.current = false;
                setIsBubbleVisible(false);

                if (moodScoreRef.current > 0) {
                  const next = moodScoreRef.current - 1;
                  moodScoreRef.current = next;
                  setMoodScore(next);

                  const rect = c.getBoundingClientRect();
                  const screenX = rect.left + (curPt.x / c.width) * rect.width;
                  const screenY = rect.top + (curPt.y / c.height) * rect.height;
                  triggerBubblePopEffect(screenX, screenY);

                  playBeep(800 + next * 50, 80);
                  vibrate(40);

                  if (bubbleRespawnTimeoutRef.current) window.clearTimeout(bubbleRespawnTimeoutRef.current);
                  if (next > 0) {
                    bubbleRespawnTimeoutRef.current = window.setTimeout(() => {
                      isBubbleVisibleRef.current = true;
                      setIsBubbleVisible(true);
                    }, 400); 
                  } else {
                    guideEngineRef.current.deadlineMs = nowTap; 
                  }
                }

                if (moleHideTimeoutRef.current) window.clearTimeout(moleHideTimeoutRef.current);
                const downFrames = [6, 7, 8];
                downFrames.forEach((frame, i) => {
                  window.setTimeout(() => {
                    setMoleFrame(frame);
                    if (i === downFrames.length - 1) {
                      moleHideTimeoutRef.current = window.setTimeout(() => setMoleActive(false), 40);
                    }
                  }, i * 80);
                });
              }
            }
          } else {
            setMoleActive(false);
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

  const c = canvasRef.current;
  const ctx = c?.getContext("2d");
  if (!c || !ctx) {
    rafOverlayRef.current = requestAnimationFrame(drawOverlay);
    return;
  }

  // 매 프레임 초기화
  ctx.clearRect(0, 0, c.width, c.height);

  const eng = guideEngineRef.current;

  // -----------------------------
  // 1) 가이드 상태 업데이트 (타이머, 단계 전환)
  // -----------------------------
  if (eng.running) {
    if (eng.phase === "tapping") {
      const cur = SEQUENCE[eng.stepIdx];
      const remainMs = Math.max(0, eng.deadlineMs - now);
      const remainSec = Math.ceil(remainMs / 1000);

      setStepIdx(eng.stepIdx);
      setStepRemaining(remainSec);

      if (remainMs <= 0) {
        const nextStep = eng.stepIdx + 1;

        if (nextStep < SEQUENCE.length) {
          // 같은 라운드, 다음 포인트
          guideEngineRef.current = {
            ...eng,
            stepIdx: nextStep,
            deadlineMs: now + SEQUENCE[nextStep].seconds * 1000,
          };
          setStepIdx(nextStep);
          setStepRemaining(SEQUENCE[nextStep].seconds);

          console.log(
            `라운드 ${eng.round + 1}/${TAPPING_ROUNDS} - ${SEQUENCE[nextStep].label_ko} 시작`
          );
          playBeep(880, 150);
          vibrate(100);
        } else {
          // 라운드 종료 → 다음 라운드 or 호흡 단계
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

            console.log(`라운드 ${nextRound + 1}/${TAPPING_ROUNDS} 시작!`);
            playBeep(1100, 200);
            vibrate(150);
          } else {
            // 🔁 탭핑 모두 끝 → 호흡 단계 진입
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
      // 호흡 단계 타이머 & 상태 전환
      const end = eng.breathDeadlineMs ?? now;
      const remainMs = Math.max(0, end - now);
      const remainSec = Math.ceil(remainMs / 1000);

      if (remainMs <= 0) {
        if (eng.breathPart === "INHALE") {
          guideEngineRef.current = {
            ...eng,
            breathPart: "HOLD",
            breathDeadlineMs: now + BREATH_HOLD * 1000,
          };
          console.log("🫁 호흡 - 멈추기 단계");
          playBeep(550, 100);
          vibrate(80);
        } else if (eng.breathPart === "HOLD") {
          guideEngineRef.current = {
            ...eng,
            breathPart: "EXHALE",
            breathDeadlineMs: now + BREATH_EXHALE * 1000,
          };
          console.log("💨 호흡 - 내쉬기 단계");
          playBeep(440, 200);
          vibrate(120);
        } else {
          // EXHALE 끝 → 세션 종료
          guideEngineRef.current = {
            running: false,
            phase: "done",
            stepIdx: eng.stepIdx,
            round: eng.round,
            deadlineMs: 0,
          };
          setIsGuiding(false);
          setSessionDone(true);
          console.log("🎉 EFT 세션 완전 종료!");
          playBeep(1320, 500);
          vibrate(300);
                                                                                   setShowPostSUDS(true);         
        }
      }

      // -----------------------------
      // 2) 호흡 원 애니메이션 그리기
      // -----------------------------
      const cur = guideEngineRef.current;
      const part = cur.breathPart ?? "INHALE";
      const end2 = cur.breathDeadlineMs ?? now;
      const remainMs2 = Math.max(0, end2 - now);

      const cx = c.width / 2;
      const cy = c.height / 2;

      // 진행도 계산 (0~1)
      const phaseTotalMs =
        part === "INHALE"
          ? BREATH_INHALE * 1000
          : part === "HOLD"
          ? BREATH_HOLD * 1000
          : BREATH_EXHALE * 1000;

      let progress = 0;
      if (part === "INHALE") {
        progress = 1 - remainMs2 / phaseTotalMs; // 0 → 1
      } else if (part === "HOLD") {
        progress = 1;
      } else {
        progress = remainMs2 / phaseTotalMs; // 1 → 0
      }
      progress = Math.min(1, Math.max(0, progress));

      // 이징
      const eased =
        part === "HOLD"
          ? 1
          : (1 - Math.cos(progress * Math.PI)) / 2;

      const radius =
        BREATH_RADIUS_MIN +
        (BREATH_RADIUS_MAX - BREATH_RADIUS_MIN) *
          (part === "EXHALE" ? 1 - eased : eased);

      const haloRadius =
        radius + 16 + Math.sin(pulseRef.current * 0.003) * 4;

      // 살짝 어두운 배경
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();

      // 바깥 오라
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0, 200, 255, 0.35)";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.restore();

      // 메인 공기방울
      ctx.save();
      const gradient = ctx.createRadialGradient(
        cx,
        cy,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      gradient.addColorStop(0, "rgba(200, 240, 255, 0.9)");
      gradient.addColorStop(0.5, "rgba(140, 210, 255, 0.8)");
      gradient.addColorStop(1, "rgba(0, 140, 255, 0.6)");

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.stroke();
      ctx.restore();

      // 텍스트 (들이쉬기 / 멈추기 / 내쉬기 + 남은 초)
      const phaseLabel =
        part === "INHALE"
          ? TEXTS[lang].breathInhale
          : part === "HOLD"
          ? TEXTS[lang].breathHold
          : TEXTS[lang].breathExhale;

      const remainTxt = TEXTS[lang].remaining(remainSec);

      ctx.save();
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(phaseLabel, cx, cy - 10);
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(remainTxt, cx, cy + 16);
      ctx.restore();
    }
  }

  // -----------------------------
  // 3) 탭핑 모드 오버레이 (포인트, 라벨, 확언)
  //    ※ 호흡 단계일 땐 숨겨둠
  // -----------------------------
  const guide = guideEngineRef.current;
  const activePointId: StepId | null =
    guide.running && guide.phase === "tapping"
      ? SEQUENCE[guide.stepIdx].id
      : null;

  const isGuidedMode = !!activePointId;

  if (guide.phase !== "breath") {
    const allPoints: Array<{ key: StepId; label: string; color: string }> = [
      { key: "EB",   label: "EB",   color: "rgba(0,200,255,0.95)" },
      { key: "SE-L", label: "SE-L", color: "rgba(255,120,0,0.95)" },
      { key: "SE-R", label: "SE-R", color: "rgba(255,120,0,0.95)" },
      { key: "UE",   label: "UE",   color: "rgba(50,200,50,0.95)" },
      { key: "UN",   label: "UN",   color: "rgba(150,120,255,0.95)" },
      { key: "CH",   label: "CH",   color: "rgba(255,80,160,0.95)" },
      { key: "CB",   label: "CB",   color: "rgba(0,160,255,0.95)" },
      { key: "TH",   label: "TH",   color: "rgba(255,200,0,0.95)" },
    ];

    const drawPoint = (
      key: StepId,
      label: string,
      color: string,
      highlight: boolean
    ) => {
      const pt =
        smoothRef.current[key] || lastValidPoints.current[key];
      if (!pt) return;

      const baseR = 13;
      const pulse = 3 * Math.sin(pulseRef.current * 0.01 + key.charCodeAt(0));
      const r = baseR + (highlight ? 6 : pulse);

      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fillStyle = highlight
        ? "rgba(0, 255, 180, 0.9)"
        : color;
      ctx.fill();

      if (highlight) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.stroke();
      }
      ctx.restore();
    };

    allPoints.forEach(({ key, label, color }) => {
      if (isGuidedMode && activePointId && key !== activePointId) return;
      const isCurrentPoint =
        !!activePointId && activePointId === key;
      drawPoint(key, label, color, isCurrentPoint);
    });

    // 감정/강도 표시
    if (arParams.emotion != null && typeof arParams.intensity === "number") {
      const emotionText = `감정: ${arParams.emotion} (${arParams.intensity}/10)`;
      drawPill(ctx, 10, 10, emotionText, {
        font: "14px system-ui, sans-serif",
      });
    }

    // 라운드 진행 표시
    if (round && arParams.rounds) {
      const roundText = `라운드: ${round}/${arParams.rounds}  (${elapsed}s / ${arParams.durationSec}s)`;
      drawPill(ctx, 10, 44, roundText, {
        font: "12px system-ui, sans-serif",
      });
    }

    // 현재 포인트 텍스트
    if (activePointId) {
      const meta = SEQUENCE.find((s) => s.id === activePointId);
      const labelKo = meta?.label_ko ?? activePointId;
      const labelEn = meta?.label_en ?? activePointId;

      const textKo = guide.running
        ? `여기를 가볍게 두드려 주세요: ${labelKo}`
        : `현재 포인트: ${labelKo}`;
      const textEn = guide.running
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

    // 확언 문구
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
  }

  // 다음 프레임
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



//   return (

//     <div className="min-h-screen bg-gray-50 p-4">

//       <div className="max-w-4xl mx-auto">

//         <div className="flex items-center justify-between mb-4">

//           <div className="flex gap-2">

//             <button

//               onClick={() => handleBack("back")}

//               className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"

//             >

//               {texts.backToAI}

//             </button>

//             <button

//               onClick={() => handleBack("dashboard")}

//               className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"

//             >

//               {texts.dashboard}

//             </button>

//             <button

//               onClick={() => handleBack("home")}

//               className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"

//             >

//               {texts.home}

//             </button>

//           </div>

//           <h1 className="text-3xl font-bold">{texts.title}</h1>

//           <div className="flex items-center gap-2">

//             <button

//               onClick={() => setLang(lang === "ko" ? "en" : "ko")}

//               className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"

//               title={lang === "ko" ? "영어로 전환" : "Switch to Korean"}

//             >

//               {lang === "ko" ? "EN" : "한"}

//             </button>

//           </div>

//         </div>



//         {error && (

//           <div className="mb-3 p-3 bg-red-100 border border-red-300 rounded-md">

//             <p className="text-red-700">{texts.error} {error}</p>

//           </div>

//         )}



//         {/* 4:3 종횡비 컨테이너 */}

//         <div className="relative w-full max-w-2xl mx-auto">

//           <div className="relative w-full aspect-[4/3] rounded-lg shadow overflow-hidden bg-black/10">

//             <video

//               ref={videoRef}

//               className="absolute inset-0 w-full h-full object-cover"

//               autoPlay

//               muted

//               playsInline

//               style={{ transform: "scaleX(-1)" }}

//               onLoadedMetadata={() => {

//                 const v = videoRef.current;

//                 const c = canvasRef.current;

//                 if (v && c && v.videoWidth && v.videoHeight) {

//                   if (c.width !== v.videoWidth || c.height !== v.videoHeight) {

//                     c.width = v.videoWidth; c.height = v.videoHeight;

//                   }

//                 }

//               }}

//             />

//             <canvas

//               ref={canvasRef}

//               className="absolute inset-0 w-full h-full"

//               style={{ zIndex: 10, pointerEvents: "none" }}

//             />



//              {/* 🫧 EFT 포인트에서 팝 되는 버블 */}
// {bubblePos && (
//   <div
//     key={bubblePopKey}
//     className="mood-bubble"
//     style={{
//       position: "absolute",
//       left: `${bubblePos.x * 100}%`,
//       top: `${bubblePos.y * 100}%`,
//       transform: "translate(-50%, -50%)",
//       pointerEvents: "none",
//       animation: "mood-bubble-pop 0.8s ease-out forwards",
//       zIndex: 30,
//     }}
//   >
//     <div className="mood-bubble-text">
//       <div style={{ fontSize: 18, marginBottom: 4 }}>무드톡</div>
//       <div style={{ fontSize: 26, fontWeight: 700 }}>{moodScore}</div>
//     </div>
//   </div>
// )}




//           </div>   {/* aspect-[4/3] div 닫힘 */}

//         </div>     {/* max-w-2xl div 닫힘 */}





//         {needsTap && (

//           <div className="mt-2 text-center">

//             <button

//               className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"

//               onClick={async () => {

//                 try {

//                   await (window as any).__startCamera?.();

//                   setNeedsTap(false);

//                 } catch (e: any) {

//                   console.error("Camera start failed", e);

//                   setError(e?.message || "카메라 시작 실패");

//                 }

//               }}

//             >

//               {texts.cameraStart}

//             </button>

//           </div>

//         )}



//         <div className="mt-3 flex items-center justify-center gap-2">

//           <button

//             className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"

//             onClick={() => setIsGuiding(true)}

//             disabled={isGuiding || !ready}

//             title={lang === "ko" ? "가이드 수동 시작(타이머는 아래 버튼)" : "Manual guide start (timer below)"}

//           >

//             {texts.highlight}

//           </button>

//           <button

//             className="px-4 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"

//             onClick={() => {

//               (window as any).__startEFTGuide?.();

//             }}

//             disabled={!ready}

//           >

//             {texts.startGuide}

//           </button>

//           <button

//             className="px-4 py-2 rounded bg-gray-200 text-gray-800 text-sm hover:bg-gray-300"

//             onClick={() => {

//               guideEngineRef.current.running = false;

//               guideEngineRef.current.phase = "tapping";

//               guideEngineRef.current.round = 0;

//               guideEngineRef.current.breathPart = undefined;

//               guideEngineRef.current.breathDeadlineMs = 0;



//               stoppedRef.current = true;

//               try { holisticRef.current?.close(); } catch {}

//               holisticRef.current = null;



//               setIsGuiding(false);

//               setStepIdx(0);

//               setStepRemaining(SEQUENCE[0].seconds);

//               console.log("🛑 EFT 가이드 완전 초기화 및 중지 (WASM 안전)");

//             }}

//           >

//             {texts.stop}

//           </button>

//         </div>

//       </div>

//     </div>

//   );

// }

  // 🔥 개발자 스킵 모드 (Ctrl+Shift+S)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        console.log('🔥 [개발자 모드] EFT 세션 즉시 완료!');

        // 세션 종료 상태 설정
        guideEngineRef.current = {
          ...guideEngineRef.current,
          phase: "DONE",
          round: guideEngineRef.current.round,
          deadlineMs: 0,
        };

        setIsGuiding(false);
        setSessionDone(true);
        playBeep(1320, 500);
        vibrate(300);
        setShowPostSUDS(true);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="h-screen w-full bg-gray-50 flex flex-col overflow-hidden">
      {/* 상단 헤더 */}
      <div className="flex-none p-3 bg-gray-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => handleBack("back")}
              className="px-3 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700 text-xs sm:text-sm"
            >
              {texts.backToAI}
            </button>
            <button
              onClick={() => handleBack("dashboard")}
              className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs sm:text-sm"
            >
              {texts.dashboard}
            </button>
            <button
              onClick={() => handleBack("home")}
              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-xs sm:text-sm hidden sm:inline-block"
            >
              {texts.home}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "ko" ? "en" : "ko")}
              className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition-colors"
            >
              {lang === "ko" ? "EN" : "한"}
            </button>
          </div>
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-md max-w-4xl mx-auto">
            <p className="text-red-700 text-xs">
              {texts.error} {error}
            </p>
          </div>
        )}
      </div>

      {/* 카메라 영역 - 세로 기준 */}
      <div className="flex-1 min-h-0 flex items-center justify-center bg-black">
        {/* 세로 꽉 차게, 가로는 4:3 비율로 자동 계산 */}
        <div className="h-full aspect-[4/3] max-w-full relative">
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-contain"
              autoPlay
              muted
              playsInline
              style={{ transform: "scaleX(-1)" }}
              onLoadedMetadata={() => {
                const v = videoRef.current;
                const c = canvasRef.current;
                if (v && c && v.videoWidth && v.videoHeight) {
                  if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
                    c.width = v.videoWidth;
                    c.height = v.videoHeight;
                  }
                }
              }}
            />

            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ zIndex: 10, pointerEvents: "none" }}
            />


            {/* 🕳 태핑 포인트에 올라오는 두더지 + 🫧 머리 위 비눗방울 */}
            {moleActive && molePos && (
              <>
                {/* 1. 두더지 캐릭터 (필수!) */}
                <img
                  src={MOLE_FRAMES[moleFrame]}
                  alt="moodtalk mole"
                  style={{
                    position: "absolute",
                    left: `${molePos.x * 100}%`,
                    top: `${molePos.y * 100}%`,
                    transform: "translate(-50%, -80%)", // 두더지 위치 보정
                    width: 128,
                    height: 119,
                    pointerEvents: "none",
                    imageRendering: "pixelated",
                    zIndex: 25,
                  }}
                />

                {/* 🫧 감정 단어 비눗방울 (안 터진 상태일 때만 보임) */}
                {activeFocusWord && isBubbleVisible && (
                  <div
                    onClick={() => {
                      // 1) 즉시 사라짐
                      setIsBubbleVisible(false);

                      // 2) 같은 위치에 Splash
                      const rect = canvasRef.current?.getBoundingClientRect();
                      if (rect) {
                        const screenX = rect.left + molePos.x * rect.width;
                        const screenY = rect.top + molePos.y * rect.height;
                        triggerBubblePopEffect(screenX, screenY);
                      }
                    }}
                    style={{
                      position: "absolute",
                      left: `${molePos.x * 100}%`,
                      top: `${molePos.y * 100}%`,
                      // 두더지 머리 위쪽으로 비눗방울 배치 (-150% 위로 올림)
                      transform: "translate(-50%, -50%)", 
                      width: "100px",
                      height: "100px",
                      borderRadius: "50%",
                      
                      // ✨ 영롱한 비눗방울 스타일
                      background: "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.4) 20%, rgba(173, 216, 230, 0.6) 50%, rgba(100, 149, 237, 0.4) 80%, rgba(255, 255, 255, 0.8) 100%)",
                      boxShadow: "inset 0 0 10px rgba(255, 255, 255, 0.6), 0 0 10px rgba(255, 255, 255, 0.2)",
                      border: "1px solid rgba(255, 255, 255, 0.5)",
                      
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 30, // 두더지보다 앞에
                      backdropFilter: "blur(1px)",
                      animation: "float 2s ease-in-out infinite", // 둥둥 떠있는 효과
                      cursor: "pointer"
                    }}
                  >
                    <span style={{ 
                      color: "#333", 
                      fontWeight: "bold", 
                      fontSize: "16px", 
                      textAlign: "center",
                      textShadow: "0 0 4px rgba(255,255,255,0.8)"
                    }}>
                      {activeFocusWord}
                    </span>
                  </div>
                )}
              </>
            )}


            {/* 수동 시작 버튼 (카메라 영역 내부) */}
            {needsTap && (
              <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/40">
                <button
                  className="px-6 py-3 bg-blue-600 text-white rounded-full text-lg shadow-lg hover:bg-blue-700"
                  onClick={async () => {
                    try {
                      await (window as any).__startCamera?.();
                      setNeedsTap(false);
                    } catch (e: any) {
                      setError(e?.message || "카메라 시작 실패");
                    }
                  }}
                >
                  {texts.cameraStart}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 하단 컨트롤 버튼 */}
      <div className="flex-none p-3 bg-gray-50">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2">
          <button
            className="flex-1 max-w-[120px] px-3 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
            onClick={() => setIsGuiding(true)}
            disabled={isGuiding || !ready}
          >
            {texts.highlight}
          </button>

          <button
            className="flex-1 max-w-[120px] px-3 py-2 rounded bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
            onClick={handleStartIntro}
            disabled={!ready}
          >
            {texts.startGuide}
          </button>

          <button
            className="flex-1 max-w-[80px] px-3 py-2 rounded bg-gray-200 text-gray-800 text-sm hover:bg-gray-300 whitespace-nowrap"
            onClick={() => {
              guideEngineRef.current.running = false;
              guideEngineRef.current.phase = "tapping";
              guideEngineRef.current.round = 0;
              stoppedRef.current = true;
              try { holisticRef.current?.close(); } catch {}
              holisticRef.current = null;
              setIsGuiding(false);
              setStepIdx(0);
              setStepRemaining(SEQUENCE[0].seconds);
            }}
          >
            {texts.stop}
          </button>
        </div>
      </div>

      {sessionDone && (
        <div className="fixed inset-x-0 bottom-6 flex justify-center z-40 px-4">
          <button
            className="w-full max-w-xs rounded-xl bg-emerald-600 px-4 py-3 text-center text-base font-semibold text-white shadow-lg hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            onClick={handleStartBoxBreathing}
          >
            🧘 박스 호흡 시작하기
          </button>
        </div>
      )}


{/* 인트로 & 셋업 오버레이 (최상위) */}
{introPhase !== 'game' && (
        <div
          className="fixed z-50 inset-0 bg-black flex items-center justify-center"
        >
          {/* 1. 타이틀 이미지 화면 */}
          {introPhase === 'title' && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={introImg}
                alt="Moodtoc Game Intro"
                className="max-w-full max-h-full object-contain"
              />
              {/* 투명 클릭 영역 -> Setup 단계로 이동 */}
              <button
                onClick={() => setIntroPhase('setup')}
                className="absolute inset-0 w-full h-full cursor-pointer bg-transparent border-none"
                aria-label="연상어구 화면으로 이동"
              />
            </div>
          )}

          {/* 2. 연상어구(Setup Phrase) 가이드 화면 */}
          {introPhase === 'setup' && (
            <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/90 text-white p-6 text-center space-y-8 animate-fadeIn">
              
              <div className="space-y-4 max-w-2xl">
                <h2 className="text-gray-400 text-lg font-medium">
                  쇄골 타점을 두드리며<br/>소리 내어 읽어주세요
                </h2>
                <div className="p-8 border border-white/20 rounded-2xl bg-white/5 backdrop-blur-sm">
                  <p className="text-3xl md:text-4xl font-bold leading-relaxed text-indigo-100">
                    "{setupPhrase || '나는 비록 스트레스를 받지만, 나 자신을 깊이 이해하고 받아들입니다.'}"
                  </p>
                </div>
              </div>

              <button
                onClick={handleStartIntro}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xl font-bold rounded-full shadow-lg transform transition active:scale-95"
              >
                시작하기
              </button>
            </div>
          )}
        </div>
      )}
    
    {showPostSUDS && (
    <SUDSModal
      open={true}
      label="post"
      onClose={() => setShowPostSUDS(false)}
      onSubmit={async (score) => {
        const intensityBefore = locationState?.intensity_before;
        await fetch("/suds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "manual",
            score,
            session_id: "eft-session", // 필요시 실제 session_id 사용
          }),
        });

        // Notion 기록 (선택사항)
        if (intensityBefore && locationState?.strictIntake) {
          await fetch("/api/notion/create-emotion-page", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_email: "user@example.com", // 실제 이메일로 변경
              strict_intake: locationState.strictIntake,
              intensity_after: score,
              solution: "EFT 탭핑"
            }),
          });
        }

        setShowPostSUDS(false);
        navigate("/dashboard"); // 완료 후 대시보드로 이동
      }}
    />
  )}

    </div>
  );
}