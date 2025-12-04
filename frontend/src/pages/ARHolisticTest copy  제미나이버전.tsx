// src/pages/ARHolisticTest.tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Holistic, POSE_LANDMARKS, VERSION } from "@mediapipe/holistic";
import { Camera } from "@mediapipe/camera_utils";
import type { EFTCode } from "@/types/eftCodes";

// ... (기존 타입 정의 및 상수들은 그대로 유지) ...
type EmotionKey = "anger" | "anxiety" | "sadness" | "shame" | "guilt" | "stress" | "fear" | "loneliness" | "confusion";
type SideKey = "both" | "left" | "right";

interface ARParams {
  emotion: EmotionKey;
  intensity: number;
  points: EFTCode[];
  durationSec: number;
  rounds: number;
  tempoBpm: number;
  side: SideKey;
  affirm?: string;
}

const ALLOWED_POINTS = new Set<EFTCode>(["TH","EB","SE-L","SE-R","UE","UN","CH","CB"]);
const ALLOWED_EMOTIONS: EmotionKey[] = ["anger","anxiety","sadness","shame","guilt","stress","fear","loneliness","confusion"];
const DEFAULT_PARAMS: ARParams = {
  emotion: "stress", intensity: 6, points: ["TH","EB","SE-L","SE-R","UE","UN","CH","CB"],
  durationSec: 60, rounds: 3, tempoBpm: 50, side: "both", affirm: undefined,
};

// ... (파서 유틸 함수들은 그대로 유지: clamp, pickEnum, normalizePoints 등) ...
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function pickEnum<T extends string>(val: string | null, allowed: readonly T[], fallback: T): T {
  return (val && (allowed as string[]).includes(val)) ? (val as T) : fallback;
}
function getNum(sp: URLSearchParams, key: string, def: number, min: number, max: number) {
  const raw = sp.get(key); if (raw == null) return def; const n = Number(raw); return Number.isFinite(n) ? clamp(n, min, max) : def;
}
function getStr(sp: URLSearchParams, key: string, def?: string) {
  const raw = sp.get(key); return raw == null || raw.trim() === "" ? def : raw;
}
function normalizePoints(input: string[] | undefined): EFTCode[] {
  if (!input || input.length === 0) return ["TH","EB","SE-L","SE-R","UE","UN","CH","CB"];
  const out: EFTCode[] = [];
  for (const raw of input) {
    const key = (raw || "").trim().toUpperCase();
    if (key === "UA" || key === "SE") {
        if(key === "SE") ["SE-L","SE-R"].forEach(k => { if (ALLOWED_POINTS.has(k as EFTCode)) out.push(k as EFTCode); });
        continue; 
    }
    if (ALLOWED_POINTS.has(key as EFTCode)) out.push(key as EFTCode);
  }
  return Array.from(new Set(out));
}
function parsePoints(sp: URLSearchParams, def: EFTCode[]): EFTCode[] {
  const raw = sp.get("points"); if (!raw) return def; return normalizePoints(raw.split(",").map(s => s.trim()).filter(Boolean));
}
function parseSide(sp: URLSearchParams, def: SideKey): SideKey {
  const raw = sp.get("side"); return (raw === "left" || raw === "right" || raw === "both") ? raw : def;
}
function parseEmotion(sp: URLSearchParams, def: EmotionKey): EmotionKey {
  return pickEnum(sp.get("emotion"), ALLOWED_EMOTIONS, def);
}
const PRESETS: Record<string, EFTCode[]> = {
  full:  ["TH","EB","SE-L","SE-R","UE","UN","CH","CB"],
  short: ["EB","UE","CH","CB"],
  upper: ["TH","EB","SE-L","SE-R","UE","UN"],
};
function parseARParams(sp: URLSearchParams): ARParams {
  const sudsRaw = sp.get("suds");
  const sudsValue = sudsRaw != null ? Number(sudsRaw) : null;
  const intensityValue = (sudsValue !== null && Number.isFinite(sudsValue)) ? clamp(sudsValue, 0, 10) : getNum(sp, "intensity", DEFAULT_PARAMS.intensity, 0, 10);
  const base: ARParams = {
    emotion:      parseEmotion(sp, DEFAULT_PARAMS.emotion),
    intensity:    intensityValue,
    points:       parsePoints(sp, DEFAULT_PARAMS.points),
    durationSec: getNum(sp, "duration",    DEFAULT_PARAMS.durationSec, 15, 600),
    rounds:       getNum(sp, "rounds",      DEFAULT_PARAMS.rounds, 1, 20),
    tempoBpm:     getNum(sp, "tempo",       DEFAULT_PARAMS.tempoBpm, 30, 120),
    side:         parseSide(sp, DEFAULT_PARAMS.side),
    affirm:       getStr(sp, "affirm", DEFAULT_PARAMS.affirm),
  };
  const preset = sp.get("preset");
  if (preset && PRESETS[preset]) base.points = PRESETS[preset];
  return base;
}

// ... (오디오, 진동, 다국어 텍스트 등 유틸 유지) ...
function playBeep(frequency = 880, duration = 200) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = frequency; osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch (e) { console.warn("AudioContext error", e); }
}
function vibrate(ms = 200) { if ("vibrate" in navigator) navigator.vibrate(ms); }

const TEXTS = {
  ko: { title: "EFT 가이드", startGuide: "가이드 시작", highlight: "포인트 보기", stop: "중지", backToAI: "← AI 대화", dashboard: "대시보드", home: "홈", round: (r:number, t:number)=>`${r}/${t}`, remaining: (s:number)=>`${s}초`, breathInhale: "들이쉬기", breathHold: "멈추기", breathExhale: "내쉬기", cameraStart: "📷 카메라 시작", error: "오류:" },
  en: { title: "EFT Guide", startGuide: "Start Guide", highlight: "Highlight", stop: "Stop", backToAI: "← Back", dashboard: "Dashboard", home: "Home", round: (r:number, t:number)=>`${r}/${t}`, remaining: (s:number)=>`${s}s`, breathInhale: "Inhale", breathHold: "Hold", breathExhale: "Exhale", cameraStart: "📷 Start Camera", error: "Error:" },
};
type Lang = keyof typeof TEXTS;
function ema(prev: number | null, next: number, alpha = 0.35) { return prev == null ? next : prev * (1 - alpha) + next * alpha; }

const TAPPING_ROUNDS = 3;
const STEP_SECONDS = 5;
const BREATH_INHALE = 4; const BREATH_HOLD = 4; const BREATH_EXHALE = 6;
type StepId = "TH" | "EB" | "SE-L" | "SE-R" | "UE" | "UN" | "CH" | "CB";
type Pt = { x: number; y: number };

const OFF = { EB: { dx:0.079, dy: -0.010 }, UE: { dx: -0.0, dy:  0.055 } };
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

// ✋ 탭 감지 설정
const TAP_DISTANCE_PX = 60;  // 버블이 크므로 감지 범위 약간 증가
const TAP_COOLDOWN_MS = 1000; // 버블이 다시 나타나는 시간과 맞춤

export default function ARHolisticTest() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [arParams, setArParams] = useState<ARParams>(DEFAULT_PARAMS);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // 비눗방울/파티클 컨테이너
  const holisticRef = useRef<Holistic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [moodScore, setMoodScore] = useState(8);
  const moodScoreRef = useRef(8);
  const [lang, setLang] = useState<Lang>("ko");
  const texts = TEXTS[lang];

  // 🫧 버블 상태 (DOM 기반)
  const [bubblePos, setBubblePos] = useState<Pt | null>(null); // 화면 비율 (0~1)
  const [isBubbleVisible, setIsBubbleVisible] = useState(true);
  
  const lastTapTimeRef = useRef<number>(-Infinity);
  const smoothRef = useRef<Record<StepId, Pt | null>>({
    "EB": null, "SE-L": null, "SE-R": null, "UE": null, "UN": null, "CH": null, "CB": null, "TH": null
  });
  const lastValidPoints = useRef<Record<StepId, Pt | null>>({
    "EB": null, "SE-L": null, "SE-R": null, "UE": null, "UN": null, "CH": null, "CB": null, "TH": null
  });

  // 애니메이션 & 로직 참조
  const rafOverlayRef = useRef<number | null>(null);
  const guideEngineRef = useRef({ running: false, phase: "tapping", stepIdx: 0, round: 0, deadlineMs: 0, breathPart: undefined as any, breathDeadlineMs: 0 });
  const [isGuiding, setIsGuiding] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [stepRemaining, setStepRemaining] = useState(SEQUENCE[0].seconds);
  const [round, setRound] = useState(1);
  const [elapsed, setElapsed] = useState(0);

  // URL 파라미터 로드
  useEffect(() => setArParams(parseARParams(searchParams)), [searchParams]);
  useEffect(() => { moodScoreRef.current = moodScore; }, [moodScore]);

  // 💥 파티클 효과 함수 (CSS 스타일 기반)
  const createBurst = (x: number, y: number) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    // 1. "톡!" 텍스트 생성
    const popText = document.createElement('div');
    popText.className = 'pop-text';
    popText.textContent = '톡!';
    popText.style.left = `${x}px`;
    popText.style.top = `${y}px`;
    container.appendChild(popText);

    popText.animate([
      { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 1 },
      { transform: 'translate(-50%, -100px) scale(1.5)', opacity: 0 }
    ], { duration: 600, easing: 'ease-out', fill: 'forwards' }).onfinish = () => popText.remove();

    // 2. 파티클 생성
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      container.appendChild(particle);

      const size = Math.random() * 10 + 5; 
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;

      const destX = (Math.random() - 0.5) * 300; 
      const destY = (Math.random() - 0.5) * 300;

      particle.animate([
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(${destX}px, ${destY}px) scale(0)`, opacity: 0 }
      ], {
        duration: Math.random() * 500 + 300,
        easing: 'cubic-bezier(0, .9, .57, 1)',
        fill: 'forwards'
      }).onfinish = () => particle.remove();
    }
  };

  const handleBack = () => { /* (이전 코드와 동일 - 생략) */ navigate(-1); };

  useEffect(() => {
    // ... (카메라 권한 및 초기화 로직 동일) ...
    let camera: Camera | null = null;
    let holistic: Holistic | null = null;

    const setup = async () => {
      try {
        holistic = new Holistic({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@${VERSION}/${file}` });
        holistic.setOptions({ selfieMode: true, modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
        holisticRef.current = holistic;

        const c = canvasRef.current!;
        const ctx = c.getContext("2d")!;
        const v = videoRef.current!;
        
        // ... (좌표 계산 로직 동일: FACE_IDX, px, py) ...
        const FACE_IDX = { eyeOuterL: 130, eyeOuterR: 359, noseTip: 2, mouthLower: 17 };
        const px = (p: any) => p.x * c.width;
        const py = (p: any) => p.y * c.height;

        holistic.onResults((res) => {
          if (!v.videoWidth) return;
          c.width = v.videoWidth; c.height = v.videoHeight;
          const w = c.width, h = c.height;
          const face = res.faceLandmarks; const pose = res.poseLandmarks;
          if (!face) return;

          // ... (포인트 좌표 계산 로직 동일: EB, SE, UE, UN, CH, CB, TH ...) ...
          // 기존 코드의 좌표 계산 부분 유지
          const browL = face[70];
          const EB = browL ? { x: px(browL) + OFF.EB.dx * w, y: py(browL) + OFF.EB.dy * h } : null;
          const SE_L = face[FACE_IDX.eyeOuterL] ? { x: px(face[FACE_IDX.eyeOuterL]), y: py(face[FACE_IDX.eyeOuterL]) } : null;
          const SE_R = face[FACE_IDX.eyeOuterR] ? { x: px(face[FACE_IDX.eyeOuterR]), y: py(face[FACE_IDX.eyeOuterR]) } : null;
          const leLower = face[159];
          const UE = leLower ? { x: px(leLower) + OFF.UE.dx * w, y: py(leLower) + OFF.UE.dy * h } : null;
          const UN = face[FACE_IDX.noseTip] ? { x: px(face[FACE_IDX.noseTip]), y: py(face[FACE_IDX.noseTip]) + 0.02 * h } : null;
          const CH = face[FACE_IDX.mouthLower] ? { x: px(face[FACE_IDX.mouthLower]), y: py(face[FACE_IDX.mouthLower]) + 0.02 * h } : null;
          let CB = null;
          if (pose?.[11] && pose?.[12]) CB = { x: ((pose[11].x + pose[12].x) / 2) * w, y: ((pose[11].y + pose[12].y) / 2) * h + 0.06 * h };
          else if(face[152]) CB = { x: px(face[152]), y: py(face[152]) + 0.15 * h };
          let TH = null;
          if (browL && face[300]) TH = { x: (px(browL) + px(face[300])) / 2, y: (py(browL) + py(face[300])) / 2 - 0.20 * h };

          // 스무딩 처리
          const apply = (key: StepId, pt: Pt | null) => {
            const prev = smoothRef.current[key];
            const next = pt ? { x: ema(prev?.x ?? null, pt.x), y: ema(prev?.y ?? null, pt.y) } : null;
            smoothRef.current[key] = next;
            if (next) lastValidPoints.current[key] = next;
          };
          apply("EB", EB); apply("SE-L", SE_L); apply("SE-R", SE_R); apply("UE", UE);
          apply("UN", UN); apply("CH", CH); apply("CB", CB); apply("TH", TH);

          // ✋ 탭핑 및 버블 로직
          const now = performance.now();
          const currentGuide = guideEngineRef.current;

          if (currentGuide.running && currentGuide.phase === "tapping") {
            const curId = SEQUENCE[currentGuide.stepIdx].id;
            const curPt = smoothRef.current[curId] || lastValidPoints.current[curId];

            if (curPt) {
              // 버블 위치 업데이트 (화면 비율로 저장하여 CSS left/top에 사용)
              setBubblePos({ x: curPt.x / w, y: curPt.y / h });

              // 손가락 충돌 감지
              // @ts-ignore
              const hands = [...(res.leftHandLandmarks ? [res.leftHandLandmarks] : []), ...(res.rightHandLandmarks ? [res.rightHandLandmarks] : [])];
              let hit = false;
              for (const hand of hands) {
                if (hand[8]) { // 검지 끝
                  const fx = px(hand[8]); const fy = py(hand[8]);
                  const dist = Math.sqrt((fx - curPt.x) ** 2 + (fy - curPt.y) ** 2);
                  if (dist <= TAP_DISTANCE_PX) { hit = true; break; }
                }
              }

              // ✨ 터짐 조건: 히트 + 쿨타임 지남 + 현재 버블이 보이는 상태
              if (hit && now - lastTapTimeRef.current > TAP_COOLDOWN_MS) {
                lastTapTimeRef.current = now;
                
                // 1. 점수 감소
                if (moodScoreRef.current > 0) {
                  const nextScore = moodScoreRef.current - 1;
                  moodScoreRef.current = nextScore;
                  setMoodScore(nextScore);
                }

                // 2. 시각적 터짐 효과 실행
                setIsBubbleVisible(false); // 버블 숨김
                createBurst(curPt.x, curPt.y); // 파티클 생성
                playBeep(800 + moodScoreRef.current * 50, 80);
                vibrate(40);

                // 3. 일정 시간 후 버블 다시 표시
                setTimeout(() => {
                  setIsBubbleVisible(true);
                }, 1500);
              }
            }
          } else {
            // 가이드 중이 아니거나 호흡 단계면 버블 숨김
            setBubblePos(null);
          }
          setReady(true);
        });

        // ... (Camera 생성 및 start 부분 동일) ...
        camera = new Camera(v, {
          onFrame: async () => { if(holisticRef.current) await holisticRef.current.send({ image: v }); },
          width: 640, height: 480
        });
        camera.start();

        // 🎨 Canvas 오버레이 (버블 제외 나머지 정보 표시)
        const drawOverlay = () => {
           if (!c) return;
           ctx.clearRect(0, 0, c.width, c.height);
           
           // 현재 타겟이 아닌 나머지 포인트들을 작게 표시 (위치 참고용)
           const guide = guideEngineRef.current;
           const activeId = (guide.running && guide.phase === "tapping") ? SEQUENCE[guide.stepIdx].id : null;
           
           (Object.keys(smoothRef.current) as StepId[]).forEach(key => {
             if (key === activeId) return; // 현재 타겟은 DOM 버블로 표시하므로 캔버스에서 제외
             const p = smoothRef.current[key] || lastValidPoints.current[key];
             if (p) {
               ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
               ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fill();
             }
           });

           // 텍스트 정보 (라운드, 호흡 등) 그리기 - 기존 로직 유지
           if (guide.running && guide.phase === "tapping") {
             // ... 상단 진행 바 등 ...
             const cur = SEQUENCE[guide.stepIdx];
             const label = lang === "ko" ? cur.label_ko : cur.label_en;
             ctx.font = "bold 20px system-ui"; ctx.fillStyle = "white"; ctx.textAlign = "center";
             ctx.fillText(label, c.width/2, 40);
           }
           
           rafOverlayRef.current = requestAnimationFrame(drawOverlay);
        };
        rafOverlayRef.current = requestAnimationFrame(drawOverlay);
      } catch (e: any) { setError(e.message); }
    };
    setup();
    // ... (cleanup 함수 동일) ...
    return () => {
      try { holistic?.close(); camera?.stop(); } catch{}
      if(rafOverlayRef.current) cancelAnimationFrame(rafOverlayRef.current);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 p-4 flex flex-col items-center">
      {/* 스타일 주입 (제공해주신 CSS 적용) */}
      <style>{`
        .mood-bubble {
          width: 120px; height: 120px;
          border-radius: 50%;
          position: absolute;
          cursor: pointer;
          /* 탁한 유리 질감 그라데이션 */
          background: radial-gradient(
            120% 120% at 30% 30%, 
            rgba(255, 255, 255, 0.1) 20%, 
            rgba(150, 160, 160, 0.4) 50%, 
            rgba(80, 80, 80, 0.6) 80%, 
            rgba(40, 40, 40, 0.8) 100%
          );
          box-shadow: 
            inset 10px 10px 20px rgba(255, 255, 255, 0.2),
            inset -10px -10px 20px rgba(0, 0, 0, 0.5),
            0 10px 20px rgba(0,0,0,0.3);
          backdrop-filter: blur(3px);
          border: 1px solid rgba(255,255,255,0.3);
          animation: float 4s ease-in-out infinite;
          display: flex; justify-content: center; align-items: center;
          flex-direction: column;
          z-index: 50;
          transition: opacity 0.3s;
        }
        @keyframes float {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-15px); }
        }
        .bubble-label { font-size: 14px; color: rgba(255,255,255,0.7); pointer-events: none; }
        .bubble-score { font-size: 36px; font-weight: bold; color: rgba(255,255,255,0.95); text-shadow: 0 2px 4px rgba(0,0,0,0.5); pointer-events: none; }
        
        /* 파티클 및 팝 텍스트 */
        .particle {
          position: absolute; border-radius: 50%; background: rgba(200, 210, 210, 0.9); pointer-events: none; z-index: 60;
        }
        .pop-text {
          position: absolute; font-size: 48px; font-weight: bold; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.8);
          pointer-events: none; z-index: 70; transform: translate(-50%, -50%); font-family: sans-serif;
        }
      `}</style>

      {/* 상단 헤더 영역 생략 (기존과 동일) */}
      <h1 className="text-white text-2xl mb-4">{texts.title}</h1>

      {/* 메인 컨텐츠 영역 */}
      <div className="relative w-full max-w-2xl mx-auto">
        {/* 비디오/캔버스 컨테이너 */}
        <div 
          ref={containerRef}
          className="relative w-full aspect-[4/3] rounded-xl shadow-2xl overflow-hidden bg-black"
        >
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" autoPlay muted playsInline />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* 🫧 찐 비눗방울 (DOM Overlay) */}
          {bubblePos && (
            <div
              className="mood-bubble"
              style={{
                left: `${bubblePos.x * 100}%`,
                top: `${bubblePos.y * 100}%`,
                opacity: isBubbleVisible ? 1 : 0,
                transform: isBubbleVisible ? undefined : 'translate(-50%, -50%) scale(1.2)'
              }}
            >
              <div className="bubble-label">Mood</div>
              <div className="bubble-score">{moodScore}</div>
            </div>
          )}
        </div>
      </div>

      {/* 컨트롤 버튼 */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={() => {
            setMoodScore(8);
            setIsGuiding(true);
            guideEngineRef.current = { running: true, phase: "tapping", stepIdx: 0, round: 0, deadlineMs: performance.now() + SEQUENCE[0].seconds*1000, breathPart: undefined, breathDeadlineMs: 0 };
          }}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50"
          disabled={!ready}
        >
          {texts.startGuide}
        </button>
      </div>
    </div>
  );
}