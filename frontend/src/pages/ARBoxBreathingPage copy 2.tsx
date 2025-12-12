// import React, { useEffect, useRef, useState, useCallback } from 'react';
// import Webcam from 'react-webcam';
// import { Hands, Results } from '@mediapipe/hands';
// import { Camera } from '@mediapipe/camera_utils';
// import { useNavigate } from 'react-router-dom';

// // --- Types & Interfaces ---
// type GamePhase = 'PREVIEW' | 'PLAYING' | 'EVALUATING' | 'FEEDBACK';
// type Side = 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';

// interface Star {
//   id: number;
//   x: number;
//   y: number;
//   isCaught: boolean;
//   isDecoy: boolean;
// }

// interface GameState {
//   phase: GamePhase;
//   sideIndex: number;
//   targetCount: number;
//   caughtCount: number;
//   startTime: number;
// }

// interface Particle {
//   x: number;
//   y: number;
//   vx: number;
//   vy: number;
//   life: number;
//   size: number;
//   color: string;
// }

// // --- Constants ---
// const CANVAS_WIDTH = 1280;
// const CANVAS_HEIGHT = 720;
// const BOX_SIZE_RATIO = 0.6;
// const STAR_RADIUS = 15;
// const STOP_VELOCITY_THRESHOLD = 0.005;
// const STOP_FRAME_THRESHOLD = 30; // ~0.5초 (60fps 기준)

// const SIDES: Side[] = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'];
// const SIDE_LABELS: Record<Side, string> = {
//   TOP: '들이마세요 (Inhale)',
//   RIGHT: '멈추세요 (Hold)',
//   BOTTOM: '내쉬세요 (Exhale)',
//   LEFT: '멈추세요 (Hold)',
// };

// const ARBoxBreathingPage: React.FC = () => {
//   const webcamRef = useRef<Webcam>(null);
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const navigate = useNavigate();
//   const requestRef = useRef<number>();

//   // --- Game Refs ---
//   const gameState = useRef<GameState>({
//     phase: 'PREVIEW',
//     sideIndex: 0,
//     targetCount: 4,
//     caughtCount: 0,
//     startTime: Date.now(),
//   });

//   const fingerRef = useRef<{ x: number, y: number } | null>(null);
//   const prevFingerRef = useRef<{ x: number, y: number } | null>(null);
//   const stopTimerRef = useRef<number>(0);
//   const starsRef = useRef<Star[]>([]);
//   const particlesRef = useRef<Particle[]>([]);

//   // --- UI State ---
//   const [uiMessage, setUiMessage] = useState("별을 잡고 정확히 멈추세요!");
//   const [uiFeedback, setUiFeedback] = useState<string | null>(null);
//   const [isLoaded, setIsLoaded] = useState(false);
//   const [currentCycle, setCurrentCycle] = useState(0);
//   const [totalCycles] = useState(4); // 4회 반복

//   // --- Helper Functions ---

//   const getBoxCoordinates = () => {
//     const boxSize = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * BOX_SIZE_RATIO;
//     const startX = (CANVAS_WIDTH - boxSize) / 2;
//     const startY = (CANVAS_HEIGHT - boxSize) / 2;
//     return { boxSize, startX, startY };
//   };

//   const generateStarsForSide = (side: number, count: number): Star[] => {
//     const { boxSize, startX, startY } = getBoxCoordinates();
//     const stars: Star[] = [];

//     for (let i = 0; i < count; i++) {
//       const progress = (i + 0.5) / count; // 등간격 배치
//       let x = 0, y = 0;

//       switch (side % 4) {
//         case 0: // TOP (Left -> Right)
//           x = startX + boxSize * progress;
//           y = startY;
//           break;
//         case 1: // RIGHT (Top -> Bottom)
//           x = startX + boxSize;
//           y = startY + boxSize * progress;
//           break;
//         case 2: // BOTTOM (Right -> Left)
//           x = startX + boxSize - (boxSize * progress);
//           y = startY + boxSize;
//           break;
//         case 3: // LEFT (Bottom -> Top)
//           x = startX;
//           y = startY + boxSize - (boxSize * progress);
//           break;
//       }

//       stars.push({
//         id: i,
//         x,
//         y,
//         isCaught: false,
//         isDecoy: i >= gameState.current.targetCount, // 목표 개수 이후는 미끼
//       });
//     }

//     return stars;
//   };

//   const startNewSide = (sideIdx: number) => {
//     if (sideIdx >= 4 * totalCycles) {
//       // 게임 완료
//       setUiMessage("완료! 결과를 저장하세요.");
//       setUiFeedback("🎉 모든 호흡 사이클을 완료했습니다!");
//       return;
//     }

//     const target = Math.floor(Math.random() * 3) + 4; // 4~6
//     const spawnCount = target + Math.floor(Math.random() * 2) + 2; // 목표 + 2~3개 미끼

//     gameState.current = {
//       phase: 'PREVIEW',
//       sideIndex: sideIdx % 4,
//       targetCount: target,
//       caughtCount: 0,
//       startTime: Date.now(),
//     };

//     starsRef.current = generateStarsForSide(sideIdx % 4, spawnCount);
//     stopTimerRef.current = 0;

//     const currentSide = SIDES[sideIdx % 4];
//     setUiMessage(`${SIDE_LABELS[currentSide]} - 별 ${target}개를 잡고 멈추세요!`);
//     setUiFeedback(null);
//     setCurrentCycle(Math.floor(sideIdx / 4) + 1);
//   };

//   // --- Drawing Functions ---

//   const drawNeonPath = (ctx: CanvasRenderingContext2D, sideIndex: number) => {
//     const { boxSize, startX, startY } = getBoxCoordinates();

//     ctx.save();
//     ctx.strokeStyle = '#4ADE80';
//     ctx.lineWidth = 3;
//     ctx.shadowBlur = 15;
//     ctx.shadowColor = '#4ADE80';

//     ctx.beginPath();
//     ctx.rect(startX, startY, boxSize, boxSize);
//     ctx.stroke();

//     ctx.restore();
//   };

//   const drawGhostPath = (ctx: CanvasRenderingContext2D, sideIndex: number) => {
//     const { boxSize, startX, startY } = getBoxCoordinates();
//     const elapsed = Date.now() - gameState.current.startTime;
//     const progress = (elapsed % 1500) / 1500; // 1.5초 주기 애니메이션

//     ctx.save();
//     ctx.strokeStyle = '#FFFF00';
//     ctx.lineWidth = 4;
//     ctx.setLineDash([10, 10]);
//     ctx.shadowBlur = 20;
//     ctx.shadowColor = '#FFFF00';

//     ctx.beginPath();

//     switch (sideIndex % 4) {
//       case 0: // TOP
//         const topEnd = startX + boxSize * progress;
//         ctx.moveTo(startX, startY);
//         ctx.lineTo(topEnd, startY);
//         break;
//       case 1: // RIGHT
//         const rightEnd = startY + boxSize * progress;
//         ctx.moveTo(startX + boxSize, startY);
//         ctx.lineTo(startX + boxSize, rightEnd);
//         break;
//       case 2: // BOTTOM
//         const bottomEnd = startX + boxSize - (boxSize * progress);
//         ctx.moveTo(startX + boxSize, startY + boxSize);
//         ctx.lineTo(bottomEnd, startY + boxSize);
//         break;
//       case 3: // LEFT
//         const leftEnd = startY + boxSize - (boxSize * progress);
//         ctx.moveTo(startX, startY + boxSize);
//         ctx.lineTo(startX, leftEnd);
//         break;
//     }

//     ctx.stroke();
//     ctx.restore();
//   };

//   const drawStar = (ctx: CanvasRenderingContext2D, star: Star) => {
//     ctx.save();
//     ctx.fillStyle = '#FFD700';
//     ctx.shadowBlur = 15;
//     ctx.shadowColor = '#FFD700';

//     // 별 모양 그리기 (5각 별)
//     const spikes = 5;
//     const outerRadius = STAR_RADIUS;
//     const innerRadius = STAR_RADIUS * 0.4;

//     ctx.beginPath();
//     for (let i = 0; i < spikes * 2; i++) {
//       const radius = i % 2 === 0 ? outerRadius : innerRadius;
//       const angle = (Math.PI / spikes) * i - Math.PI / 2;
//       const x = star.x + Math.cos(angle) * radius;
//       const y = star.y + Math.sin(angle) * radius;
//       if (i === 0) ctx.moveTo(x, y);
//       else ctx.lineTo(x, y);
//     }
//     ctx.closePath();
//     ctx.fill();

//     ctx.restore();
//   };

//   const checkStarCollisions = (finger: { x: number, y: number }) => {
//     const fingerX = finger.x * CANVAS_WIDTH;
//     const fingerY = finger.y * CANVAS_HEIGHT;

//     starsRef.current.forEach(star => {
//       if (!star.isCaught) {
//         const dist = Math.hypot(fingerX - star.x, fingerY - star.y);
//         if (dist < STAR_RADIUS + 10) {
//           star.isCaught = true;
//           gameState.current.caughtCount++;
//           createExplosionParticles(star.x, star.y);
//         }
//       }
//     });
//   };

//   const checkStopCondition = (finger: { x: number, y: number }) => {
//     if (!prevFingerRef.current) {
//       prevFingerRef.current = finger;
//       return;
//     }

//     const dx = finger.x - prevFingerRef.current.x;
//     const dy = finger.y - prevFingerRef.current.y;
//     const velocity = Math.hypot(dx, dy);

//     if (velocity < STOP_VELOCITY_THRESHOLD && gameState.current.caughtCount > 0) {
//       stopTimerRef.current += 1;
//     } else {
//       stopTimerRef.current = 0;
//     }

//     if (stopTimerRef.current > STOP_FRAME_THRESHOLD) {
//       evaluateResult();
//     }

//     prevFingerRef.current = finger;
//   };

//   const evaluateResult = () => {
//     gameState.current.phase = 'FEEDBACK';
//     const { caughtCount, targetCount } = gameState.current;

//     if (caughtCount === targetCount) {
//       setUiFeedback(`✅ 완벽해요! 정확히 ${targetCount}개!`);
//       triggerSuccessParticles();
//     } else if (caughtCount > targetCount) {
//       setUiFeedback(`🚨 ${caughtCount}개는 너무 많아요! (목표: ${targetCount}개)`);
//     } else {
//       setUiFeedback(`⚠️ ${caughtCount}개는 부족해요! (목표: ${targetCount}개)`);
//     }

//     setTimeout(() => {
//       startNewSide(Math.floor(currentCycle - 1) * 4 + gameState.current.sideIndex + 1);
//     }, 2000);
//   };

//   // --- Particle System ---

//   const createExplosionParticles = (x: number, y: number) => {
//     for (let i = 0; i < 10; i++) {
//       const angle = (Math.PI * 2 * i) / 10;
//       const speed = Math.random() * 3 + 2;
//       particlesRef.current.push({
//         x,
//         y,
//         vx: Math.cos(angle) * speed,
//         vy: Math.sin(angle) * speed,
//         life: 1.0,
//         size: Math.random() * 4 + 2,
//         color: '#FFD700',
//       });
//     }
//   };

//   const triggerSuccessParticles = () => {
//     const centerX = CANVAS_WIDTH / 2;
//     const centerY = CANVAS_HEIGHT / 2;

//     for (let i = 0; i < 50; i++) {
//       const angle = Math.random() * Math.PI * 2;
//       const speed = Math.random() * 5 + 3;
//       particlesRef.current.push({
//         x: centerX,
//         y: centerY,
//         vx: Math.cos(angle) * speed,
//         vy: Math.sin(angle) * speed,
//         life: 1.0,
//         size: Math.random() * 6 + 3,
//         color: '#4ADE80',
//       });
//     }
//   };

//   const updateAndDrawParticles = (ctx: CanvasRenderingContext2D) => {
//     for (let i = particlesRef.current.length - 1; i >= 0; i--) {
//       const p = particlesRef.current[i];
//       p.x += p.vx;
//       p.y += p.vy;
//       p.life -= 0.02;

//       if (p.life <= 0) {
//         particlesRef.current.splice(i, 1);
//       } else {
//         ctx.save();
//         ctx.globalAlpha = p.life;
//         ctx.fillStyle = p.color;
//         ctx.beginPath();
//         ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
//         ctx.fill();
//         ctx.restore();
//       }
//     }
//   };

//   // --- Animation Loop ---

//   const draw = useCallback(() => {
//     const canvas = canvasRef.current;
//     if (!canvas) return;
//     const ctx = canvas.getContext('2d');
//     if (!ctx) return;

//     ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

//     const { phase, sideIndex } = gameState.current;
//     const finger = fingerRef.current;

//     // A. 네온 박스 경로 그리기
//     drawNeonPath(ctx, sideIndex);

//     // B. 단계별 처리
//     if (phase === 'PREVIEW') {
//       drawGhostPath(ctx, sideIndex);

//       if (Date.now() - gameState.current.startTime > 1500) {
//         gameState.current.phase = 'PLAYING';
//       }
//     } else if (phase === 'PLAYING') {
//       // 별 그리기
//       starsRef.current.forEach(star => {
//         if (!star.isCaught) drawStar(ctx, star);
//       });

//       // 충돌 감지 및 정지 체크
//       if (finger) {
//         checkStarCollisions(finger);
//         checkStopCondition(finger);

//         // 손가락 커서 그리기
//         const fingerX = finger.x * CANVAS_WIDTH;
//         const fingerY = finger.y * CANVAS_HEIGHT;
//         ctx.save();
//         ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
//         ctx.shadowBlur = 10;
//         ctx.shadowColor = '#FFFFFF';
//         ctx.beginPath();
//         ctx.arc(fingerX, fingerY, 12, 0, Math.PI * 2);
//         ctx.fill();
//         ctx.restore();
//       }
//     }

//     // C. 파티클 업데이트
//     updateAndDrawParticles(ctx);

//     requestRef.current = requestAnimationFrame(draw);
//   }, []);

//   // --- MediaPipe Init ---

//   useEffect(() => {
//     const hands = new Hands({
//       locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
//     });

//     hands.setOptions({
//       maxNumHands: 1,
//       modelComplexity: 1,
//       minDetectionConfidence: 0.5,
//       minTrackingConfidence: 0.5,
//     });

//     hands.onResults((results: Results) => {
//       setIsLoaded(true);
//       if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
//         const landmarks = results.multiHandLandmarks[0];
//         const indexTip = landmarks[8]; // INDEX_FINGER_TIP
//         fingerRef.current = { x: 1 - indexTip.x, y: indexTip.y }; // 미러링
//       } else {
//         fingerRef.current = null;
//       }
//     });

//     if (webcamRef.current && webcamRef.current.video) {
//       const camera = new Camera(webcamRef.current.video, {
//         onFrame: async () => {
//           if (webcamRef.current?.video) {
//             await hands.send({ image: webcamRef.current.video });
//           }
//         },
//         width: 1280,
//         height: 720,
//       });
//       camera.start();
//     }

//     return () => {
//       hands.close();
//       if (requestRef.current) cancelAnimationFrame(requestRef.current);
//     };
//   }, []);

//   // 게임 시작
//   useEffect(() => {
//     startNewSide(0);
//   }, []);

//   // 애니메이션 루프 시작
//   useEffect(() => {
//     requestRef.current = requestAnimationFrame(draw);
//     return () => {
//       if (requestRef.current) cancelAnimationFrame(requestRef.current);
//     };
//   }, [draw]);

//   return (
//     <div className="relative w-full h-screen bg-black overflow-hidden">
//       {/* 웹캠 배경 */}
//       <Webcam
//         ref={webcamRef}
//         mirrored={true}
//         className="absolute top-0 left-0 w-full h-full object-cover opacity-50"
//         onUserMedia={() => console.log("Webcam started")}
//       />

//       {/* Canvas 오버레이 */}
//       <canvas
//         ref={canvasRef}
//         width={CANVAS_WIDTH}
//         height={CANVAS_HEIGHT}
//         className="absolute top-0 left-0 w-full h-full object-contain z-10"
//       />

//       {/* UI 오버레이 */}
//       <div className="absolute z-20 w-full h-full flex flex-col items-center justify-between pointer-events-none py-10">
//         {/* 상단 정보 */}
//         <div className="flex flex-col items-center mt-10">
//           {!isLoaded && (
//             <div className="text-xl text-yellow-300 animate-pulse font-bold mb-4">
//               🖐️ 손을 인식 중입니다...
//             </div>
//           )}
//           <h2 className="text-2xl text-green-300 font-semibold drop-shadow-md">
//             Cycle {currentCycle} / {totalCycles}
//           </h2>
//           <h1 className="text-3xl text-white font-bold drop-shadow-lg mt-2">
//             {uiMessage}
//           </h1>
//         </div>

//         {/* 피드백 메시지 */}
//         {uiFeedback && (
//           <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
//             <div className="text-4xl text-yellow-300 font-bold animate-bounce drop-shadow-lg">
//               {uiFeedback}
//             </div>
//           </div>
//         )}

//         {/* 하단 버튼 */}
//         <div className="mb-10 pointer-events-auto">
//           {currentCycle >= totalCycles && (
//             <button
//               onClick={() => navigate('/result')}
//               className="px-8 py-4 bg-gradient-to-r from-green-400 to-blue-500 text-white text-xl font-bold rounded-full shadow-lg hover:scale-105 transition-transform animate-bounce"
//             >
//               결과 저장하기
//             </button>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default ARBoxBreathingPage;
import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { useNavigate } from 'react-router-dom';

// --- Types & Interfaces ---
type GamePhase = 'PREVIEW' | 'PLAYING' | 'FEEDBACK' | 'FINISHED';
type Side = 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';

interface Star {
  id: number;
  x: number;
  y: number;
  isCaught: boolean;
  isDecoy: boolean;
}

interface GameState {
  phase: GamePhase;
  globalStep: number; // 전체 진행 단계 (0 ~ 11, 총 12변)
  sideIndex: number;  // 0~3 (TOP, RIGHT, BOTTOM, LEFT)
  targetCount: number;
  caughtCount: number;
  startTime: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

// --- Constants ---
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const BOX_SIZE_RATIO = 0.6;
const STAR_RADIUS = 15;
const STOP_VELOCITY_THRESHOLD = 0.005;
const STOP_FRAME_THRESHOLD = 30; 
const TOTAL_CYCLES = 3; // 3세트 반복 (총 12변)

const SIDE_LABELS: string[] = [
  '들이마세요 (Inhale)', // TOP
  '멈추세요 (Hold)',    // RIGHT
  '내쉬세요 (Exhale)',   // BOTTOM
  '멈추세요 (Hold)',    // LEFT
];

const ARBoxBreathingPage: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const requestRef = useRef<number>();

  // --- Game Refs ---
  // 상태 꼬임을 방지하기 위해 globalStep으로 전체 진행을 관리합니다.
  const gameState = useRef<GameState>({
    phase: 'PREVIEW',
    globalStep: 0,
    sideIndex: 0,
    targetCount: 4,
    caughtCount: 0,
    startTime: Date.now(),
  });

  const fingerRef = useRef<{ x: number, y: number } | null>(null);
  const prevFingerRef = useRef<{ x: number, y: number } | null>(null);
  const stopTimerRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  // --- UI State ---
  const [uiMessage, setUiMessage] = useState("준비하세요...");
  const [uiFeedback, setUiFeedback] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cycleDisplay, setCycleDisplay] = useState(1);

  // --- Helper Functions ---

  const getBoxCoordinates = () => {
    const boxSize = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * BOX_SIZE_RATIO;
    const startX = (CANVAS_WIDTH - boxSize) / 2;
    const startY = (CANVAS_HEIGHT - boxSize) / 2;
    return { boxSize, startX, startY };
  };

  const generateStarsForSide = (sideIdx: number, count: number): Star[] => {
    const { boxSize, startX, startY } = getBoxCoordinates();
    const stars: Star[] = [];
    
    // 시작점과 끝점 계산
    let startP = { x: 0, y: 0 };
    let endP = { x: 0, y: 0 };

    switch (sideIdx) {
      case 0: // TOP (Left -> Right)
        startP = { x: startX, y: startY };
        endP = { x: startX + boxSize, y: startY };
        break;
      case 1: // RIGHT (Top -> Bottom)
        startP = { x: startX + boxSize, y: startY };
        endP = { x: startX + boxSize, y: startY + boxSize };
        break;
      case 2: // BOTTOM (Right -> Left)
        startP = { x: startX + boxSize, y: startY + boxSize };
        endP = { x: startX, y: startY + boxSize };
        break;
      case 3: // LEFT (Bottom -> Top)
        startP = { x: startX, y: startY + boxSize };
        endP = { x: startX, y: startY };
        break;
    }

    for (let i = 0; i < count; i++) {
      const progress = (i + 1) / (count + 1); // 양 끝점 제외하고 균등 배치
      const x = startP.x + (endP.x - startP.x) * progress;
      const y = startP.y + (endP.y - startP.y) * progress;

      stars.push({
        id: i,
        x,
        y,
        isCaught: false,
        isDecoy: i >= gameState.current.targetCount,
      });
    }

    return stars;
  };

  const startNextStep = (nextStepIndex: number) => {
    // 종료 조건
    if (nextStepIndex >= 4 * TOTAL_CYCLES) {
      gameState.current.phase = 'FINISHED';
      setUiMessage("모든 호흡이 완료되었습니다.");
      setUiFeedback("수고하셨습니다! 🎉");
      return;
    }

    const sideIdx = nextStepIndex % 4;
    const currentCycle = Math.floor(nextStepIndex / 4) + 1;
    
    // 난이도 설정
    const target = Math.floor(Math.random() * 3) + 4; // 4~6개
    const spawnCount = target + Math.floor(Math.random() * 2) + 2; // +2~3개 더미

    // 상태 업데이트
    gameState.current = {
      phase: 'PREVIEW',
      globalStep: nextStepIndex,
      sideIndex: sideIdx,
      targetCount: target,
      caughtCount: 0,
      startTime: Date.now(),
    };

    starsRef.current = generateStarsForSide(sideIdx, spawnCount);
    stopTimerRef.current = 0; // 정지 타이머 리셋

    // UI 업데이트
    setCycleDisplay(currentCycle);
    setUiMessage(`${SIDE_LABELS[sideIdx]} - 별 ${target}개를 잡고 멈추세요!`);
    setUiFeedback(null);
  };

  // --- Drawing Functions ---

  // 1. 전체 희미한 박스 그리기 (경로 가이드)
  const drawBackgroundBox = (ctx: CanvasRenderingContext2D) => {
    const { boxSize, startX, startY } = getBoxCoordinates();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; // 희미한 흰색
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, boxSize, boxSize);
    ctx.restore();
  };

  // 2. 현재 활성화된 변만 네온으로 그리기
  const drawActiveSide = (ctx: CanvasRenderingContext2D, sideIdx: number) => {
    const { boxSize, startX, startY } = getBoxCoordinates();
    ctx.save();
    ctx.strokeStyle = '#4ADE80'; // Bright Green
    ctx.lineWidth = 5;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#4ADE80';
    ctx.lineCap = 'round';

    ctx.beginPath();
    switch (sideIdx) {
      case 0: // TOP
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + boxSize, startY);
        break;
      case 1: // RIGHT
        ctx.moveTo(startX + boxSize, startY);
        ctx.lineTo(startX + boxSize, startY + boxSize);
        break;
      case 2: // BOTTOM
        ctx.moveTo(startX + boxSize, startY + boxSize);
        ctx.lineTo(startX, startY + boxSize);
        break;
      case 3: // LEFT
        ctx.moveTo(startX, startY + boxSize);
        ctx.lineTo(startX, startY);
        break;
    }
    ctx.stroke();
    ctx.restore();
  };

  // 3. 프리뷰 화살표 애니메이션
  const drawGhostPath = (ctx: CanvasRenderingContext2D, sideIdx: number) => {
    const { boxSize, startX, startY } = getBoxCoordinates();
    const elapsed = Date.now() - gameState.current.startTime;
    const progress = (elapsed % 1500) / 1500; // 0~1 loop

    ctx.save();
    ctx.strokeStyle = '#FFFF00'; // Yellow
    ctx.lineWidth = 4;
    ctx.setLineDash([15, 15]); // 점선
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#FFFF00';
    
    // 점선 이동 효과
    ctx.lineDashOffset = -progress * 30; 

    ctx.beginPath();
    // (위 drawActiveSide와 동일한 좌표 로직 사용)
    switch (sideIdx) {
      case 0: ctx.moveTo(startX, startY); ctx.lineTo(startX + boxSize, startY); break;
      case 1: ctx.moveTo(startX + boxSize, startY); ctx.lineTo(startX + boxSize, startY + boxSize); break;
      case 2: ctx.moveTo(startX + boxSize, startY + boxSize); ctx.lineTo(startX, startY + boxSize); break;
      case 3: ctx.moveTo(startX, startY + boxSize); ctx.lineTo(startX, startY); break;
    }
    ctx.stroke();
    ctx.restore();
  };

  const drawStar = (ctx: CanvasRenderingContext2D, star: Star) => {
    ctx.save();
    ctx.fillStyle = '#FFD700';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#FFD700';

    const spikes = 5;
    const outerRadius = STAR_RADIUS;
    const innerRadius = STAR_RADIUS * 0.4;

    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (Math.PI / spikes) * i - Math.PI / 2;
      const x = star.x + Math.cos(angle) * radius;
      const y = star.y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // --- Logic Functions ---

  const checkStarCollisions = (finger: { x: number, y: number }) => {
    // FEEDBACK 상태에서는 더 이상 별을 잡지 않음 (중복 방지)
    if (gameState.current.phase !== 'PLAYING') return;

    const fingerX = finger.x * CANVAS_WIDTH;
    const fingerY = finger.y * CANVAS_HEIGHT;

    starsRef.current.forEach(star => {
      if (!star.isCaught) {
        const dist = Math.hypot(fingerX - star.x, fingerY - star.y);
        if (dist < STAR_RADIUS + 20) { // 히트박스 여유있게
          star.isCaught = true;
          gameState.current.caughtCount++;
          createExplosionParticles(star.x, star.y);
        }
      }
    });
  };

  const checkStopCondition = (finger: { x: number, y: number }) => {
    if (gameState.current.phase !== 'PLAYING') return;
    
    if (!prevFingerRef.current) {
      prevFingerRef.current = finger;
      return;
    }

    const dx = finger.x - prevFingerRef.current.x;
    const dy = finger.y - prevFingerRef.current.y;
    const velocity = Math.hypot(dx, dy);

    // 속도가 매우 느리고, 최소 1개 이상 잡았을 때 타이머 작동
    if (velocity < STOP_VELOCITY_THRESHOLD && gameState.current.caughtCount > 0) {
      stopTimerRef.current += 1;
    } else {
      stopTimerRef.current = 0;
    }

    // 정지 판정 (약 0.5초)
    if (stopTimerRef.current > STOP_FRAME_THRESHOLD) {
      evaluateResult();
    }

    prevFingerRef.current = finger;
  };

  const evaluateResult = () => {
    // 상태를 즉시 FEEDBACK으로 변경하여 중복 실행 방지
    gameState.current.phase = 'FEEDBACK';
    
    const { caughtCount, targetCount, globalStep } = gameState.current;

    // 피드백 메시지 설정
    if (caughtCount === targetCount) {
      setUiFeedback(`✅ 성공! 정확히 ${targetCount}개!`);
      triggerSuccessParticles();
    } else if (caughtCount > targetCount) {
      setUiFeedback(`🚨 ${caughtCount}개 잡음! (너무 많아요)`);
    } else {
      setUiFeedback(`⚠️ ${caughtCount}개 잡음! (너무 적어요)`);
    }

    // 2초 후 무조건 다음 단계로 이동
    setTimeout(() => {
      startNextStep(globalStep + 1);
    }, 2000);
  };

  // --- Particles ---
  // (기존과 동일하지만 간단히 포함)
  const createExplosionParticles = (x: number, y: number) => {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = Math.random() * 3 + 2;
      particlesRef.current.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1.0, size: Math.random() * 5 + 2, color: '#FFD700',
      });
    }
  };

  const triggerSuccessParticles = () => {
    const { startX, startY, boxSize } = getBoxCoordinates();
    const cx = startX + boxSize / 2;
    const cy = startY + boxSize / 2;
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 4;
      particlesRef.current.push({
        x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1.0, size: Math.random() * 8 + 4, color: '#4ADE80',
      });
    }
  };

  const updateAndDrawParticles = (ctx: CanvasRenderingContext2D) => {
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
      else {
        ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
  };

  // --- Animation Loop ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const { phase, sideIndex } = gameState.current;
    const finger = fingerRef.current;

    // 1. 배경 박스 (항상 표시) -> 이제 경로가 보입니다!
    drawBackgroundBox(ctx);

    // 2. 현재 활성 변 (네온)
    drawActiveSide(ctx, sideIndex);

    // 3. 단계별 로직
    if (phase === 'PREVIEW') {
      drawGhostPath(ctx, sideIndex);
      // 1.5초 후 게임 시작
      if (Date.now() - gameState.current.startTime > 1500) {
        gameState.current.phase = 'PLAYING';
      }
    } 
    else if (phase === 'PLAYING') {
      starsRef.current.forEach(star => {
        if (!star.isCaught) drawStar(ctx, star);
      });

      if (finger) {
        checkStarCollisions(finger);
        checkStopCondition(finger);

        // 손가락 커서
        const fingerX = finger.x * CANVAS_WIDTH;
        const fingerY = finger.y * CANVAS_HEIGHT;
        ctx.save(); ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath(); ctx.arc(fingerX, fingerY, 15, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    else if (phase === 'FEEDBACK') {
      // 결과 보여주는 동안은 별만 그리고 상호작용 안함
      starsRef.current.forEach(star => {
        if (!star.isCaught) drawStar(ctx, star);
      });
    }

    updateAndDrawParticles(ctx);
    requestRef.current = requestAnimationFrame(draw);
  }, []);

  // --- Init ---
  useEffect(() => {
    const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults((results) => {
      setIsLoaded(true);
      if (results.multiHandLandmarks?.[0]) {
        const indexTip = results.multiHandLandmarks[0][8];
        fingerRef.current = { x: 1 - indexTip.x, y: indexTip.y };
      } else fingerRef.current = null;
    });

    if (webcamRef.current?.video) {
      const camera = new Camera(webcamRef.current.video, {
        onFrame: async () => { if (webcamRef.current?.video) await hands.send({ image: webcamRef.current.video }); },
        width: 1280, height: 720,
      });
      camera.start();
    }
    return () => { hands.close(); if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  useEffect(() => {
    startNextStep(0); // 게임 시작
  }, []);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [draw]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center">
      <Webcam ref={webcamRef} mirrored className="absolute w-full h-full object-cover opacity-30" />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute w-full h-full object-contain z-10" />

      {/* UI Layer */}
      <div className="absolute z-20 w-full h-full flex flex-col items-center justify-between pointer-events-none py-10">
        <div className="flex flex-col items-center mt-10">
          {!isLoaded && <div className="text-xl text-yellow-300 animate-pulse font-bold mb-4">🖐️ 손을 인식 중...</div>}
          <h2 className="text-xl text-green-300 font-semibold drop-shadow-md">Cycle {cycleDisplay} / {TOTAL_CYCLES}</h2>
          <h1 className="text-3xl text-white font-bold drop-shadow-lg mt-2 transition-all">{uiMessage}</h1>
        </div>

        {uiFeedback && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
            <div className="bg-black/70 px-8 py-4 rounded-xl backdrop-blur-sm border border-yellow-400">
              <div className="text-4xl text-yellow-300 font-bold animate-bounce drop-shadow-lg whitespace-nowrap">
                {uiFeedback}
              </div>
            </div>
          </div>
        )}

        <div className="mb-10 pointer-events-auto">
          {gameState.current.phase === 'FINISHED' && (
            <button onClick={() => navigate('/result')} className="px-8 py-4 bg-blue-500 text-white text-xl font-bold rounded-full shadow-lg hover:scale-105 animate-bounce">
              결과 저장하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ARBoxBreathingPage;