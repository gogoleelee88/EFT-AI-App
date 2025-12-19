import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { useNavigate } from 'react-router-dom';
import SUDSModal from '../components/modals/SUDSModal';
import bgImage from './sky.png' 

// --- Types & Interfaces ---
type GamePhase = 'IDLE' | 'PREVIEW' | 'PLAYING' | 'FEEDBACK' | 'FINISHED';

interface Star {
  id: number;
  x: number;
  y: number;
  isCaught: boolean;
}

interface GameState {
  phase: GamePhase;
  globalStep: number;
  sideIndex: number;
  targetCount: number;
  currentStarIndex: number;
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
const BOX_SIZE_RATIO = 0.75;
const STAR_RADIUS = 25; 
const TOTAL_CYCLES = 3;

// 🐌 릴랙스 모드 설정값
const PREVIEW_DURATION = 3000; 
const ARROW_SPEED = 4000;      
const PULSE_SPEED = 800;       

const SIDE_LABELS: string[] = [
  '들이마시기 (Inhale)', // [최종 수정] 동작 이름만 남김
  '멈추기 (Hold)',    
  '내쉬기 (Exhale)',   
  '멈추기 (Hold)',    
];

const ARBoxBreathingPage: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const requestRef = useRef<number>();

  // --- Game Refs ---
  const gameState = useRef<GameState>({
    phase: 'IDLE', // 초기 상태는 IDLE (대기)
    globalStep: 0,
    sideIndex: 0,
    targetCount: 4,
    currentStarIndex: 0,
    caughtCount: 0,
    startTime: Date.now(),
  });

  const [showPostSUDS, setShowPostSUDS] = useState(false);
  const fingerRef = useRef<{ x: number, y: number } | null>(null);
  const starsRef = useRef<Star[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const stopTimerRef = useRef<number>(0);

  // --- UI State ---
  const [uiMessage, setUiMessage] = useState("");
  const [uiFeedback, setUiFeedback] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cycleDisplay, setCycleDisplay] = useState(1);
  const [isStarted, setIsStarted] = useState(false); // 게임 시작 여부

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
    
    let startP = { x: 0, y: 0 };
    let endP = { x: 0, y: 0 };

    switch (sideIdx) {
      case 0: startP = { x: startX, y: startY }; endP = { x: startX + boxSize, y: startY }; break;
      case 1: startP = { x: startX + boxSize, y: startY }; endP = { x: startX + boxSize, y: startY + boxSize }; break;
      case 2: startP = { x: startX + boxSize, y: startY + boxSize }; endP = { x: startX, y: startY + boxSize }; break;
      case 3: startP = { x: startX, y: startY + boxSize }; endP = { x: startX, y: startY }; break;
    }

    for (let i = 0; i < count; i++) {
      const progress = (i + 1) / (count + 1); 
      const x = startP.x + (endP.x - startP.x) * progress;
      const y = startP.y + (endP.y - startP.y) * progress;
      stars.push({ id: i, x, y, isCaught: false });
    }
    return stars;
  };

  // 게임 시작 버튼을 누르면 호출됨
  const handleStartGame = () => {
    setIsStarted(true);
    startNextStep(0);
  };

  const startNextStep = (nextStepIndex: number) => {
    if (nextStepIndex >= 4 * TOTAL_CYCLES) {
      gameState.current.phase = 'FINISHED';
      setUiMessage("모든 훈련 완료!");
      setUiFeedback("수고하셨습니다! 🎉");
      setShowPostSUDS(true);
      return;
    }

    const sideIdx = nextStepIndex % 4;
    const currentCycle = Math.floor(nextStepIndex / 4) + 1;
    
    // [수정] 호흡 시간(별 개수)을 4~6개로 설정 (4초 호흡 기반)
    const target = Math.floor(Math.random() * 3) + 4; // 4, 5, 6 중 랜덤
    const totalStars = target + 2;

    gameState.current = {
      phase: 'PREVIEW',
      globalStep: nextStepIndex,
      sideIndex: sideIdx,
      targetCount: target,
      currentStarIndex: 0,
      caughtCount: 0,
      startTime: Date.now(),
    };

    starsRef.current = generateStarsForSide(sideIdx, totalStars);
    stopTimerRef.current = 0;

    setCycleDisplay(currentCycle);
    setUiMessage(`${SIDE_LABELS[sideIdx]}\n⭐ 별 ${target}개를 잡고 멈추세요!`);
    setUiFeedback(null);
  };

  // --- Logic Functions ---

  const checkGameLogic = (finger: { x: number, y: number }) => {
    if (gameState.current.phase !== 'PLAYING') return;

    const fingerX = finger.x * CANVAS_WIDTH;
    const fingerY = finger.y * CANVAS_HEIGHT;
    const { currentStarIndex, caughtCount, targetCount } = gameState.current;

    const activeStar = starsRef.current[currentStarIndex];

    // 🔍 디버깅: 현재 상태 출력
    console.log('🎯 Game State:', {
      phase: gameState.current.phase,
      currentStarIndex,
      caughtCount,
      targetCount,
      fingerPos: { x: fingerX, y: fingerY },
      activeStar: activeStar ? { x: activeStar.x, y: activeStar.y, isCaught: activeStar.isCaught } : null
    });

    if (activeStar && !activeStar.isCaught) {
      const dist = Math.hypot(fingerX - activeStar.x, fingerY - activeStar.y);
      console.log('📏 Distance to star:', dist, 'Required:', STAR_RADIUS + 15);

      if (dist < STAR_RADIUS + 15) {
        console.log('⭐ Star caught!');
        activeStar.isCaught = true;
        gameState.current.caughtCount++;
        gameState.current.currentStarIndex++;
        // createExplosionParticles 제거: 별이 터지지 않고 별자리가 됨
      }
    }

    if (gameState.current.caughtCount > targetCount) {
      evaluateResult(false, "너무 많아요!"); 
      return;
    }

    if (gameState.current.caughtCount === targetCount) {
       stopTimerRef.current += 1;
       if (stopTimerRef.current > 60) { // 약 1초 정지
         evaluateResult(true, 'PERFECT'); // 한글 대신 정의된 리터럴 타입을 전달
       }
    } else {
      stopTimerRef.current = 0;
    }
  };

  const evaluateResult = (isSuccess: boolean, type: 'FAST' | 'SLOW' | 'PERFECT') => {
    // 성공 여부나 타입에 따라 피드백 메시지 설정
    if (type === 'PERFECT') {
      setUiFeedback("완벽합니다! ✨");
    } else if (type === 'FAST') {
      setUiFeedback("조금만 더 천천히 숨을 들이마셔보세요.");
    }

    // 1초 후 피드백을 지우고 다음 단계로 이동
    setTimeout(() => {
      setUiFeedback(null);
      startNextStep(gameState.current.globalStep + 1);
    }, 1000);
  };

  // --- Drawing Functions ---

  const drawBackgroundBox = (ctx: CanvasRenderingContext2D) => {
    const { boxSize, startX, startY } = getBoxCoordinates();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'white';
    ctx.lineWidth = 5;
    ctx.strokeRect(startX, startY, boxSize, boxSize);
    ctx.restore();
  };

  const drawActiveSide = (ctx: CanvasRenderingContext2D, sideIdx: number) => {
    const { boxSize, startX, startY } = getBoxCoordinates();
    ctx.save();
    ctx.strokeStyle = '#4ADE80';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#4ADE80';
    ctx.beginPath();
    
    let sx = 0, sy = 0, ex = 0, ey = 0;
    let angle = 0;

    switch (sideIdx) {
      case 0: sx = startX; sy = startY; ex = startX + boxSize; ey = startY; angle = 0; break;
      case 1: sx = startX + boxSize; sy = startY; ex = sx; ey = startY + boxSize; angle = Math.PI / 2; break;
      case 2: sx = startX + boxSize; sy = startY + boxSize; ex = startX; ey = sy; angle = Math.PI; break;
      case 3: sx = startX; sy = startY + boxSize; ex = sx; ey = startY; angle = -Math.PI / 2; break;
    }
    
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    const elapsed = Date.now() - gameState.current.startTime;
    const arrowProgress = (elapsed % ARROW_SPEED) / ARROW_SPEED; 
    const arrowX = sx + (ex - sx) * arrowProgress;
    const arrowY = sy + (ey - sy) * arrowProgress;

    ctx.translate(arrowX, arrowY); 
    ctx.rotate(angle); 

    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(10, 0);   
    ctx.lineTo(-8, 6);   
    ctx.lineTo(-8, -6);  
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  const drawConstellation = (ctx: CanvasRenderingContext2D) => {
    const stars = starsRef.current;
    const currentIndex = gameState.current.currentStarIndex;

    ctx.save();

    // 1. 별자리 선 그리기 (잡은 별들끼리 연결)
    if (gameState.current.caughtCount > 0) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)'; // 황금색 선
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#FFD700';

      let firstPoint = true;
      for (let i = 0; i < stars.length; i++) {
        if (stars[i].isCaught) {
          if (firstPoint) {
            ctx.moveTo(stars[i].x, stars[i].y);
            firstPoint = false;
          } else {
            ctx.lineTo(stars[i].x, stars[i].y);
          }
        }
      }
      // 현재 타겟하고 있는 별까지 선을 잇고 싶다면 아래 주석 해제
      // if (stars[currentIndex] && !stars[currentIndex].isCaught) {
      //   ctx.lineTo(stars[currentIndex].x, stars[currentIndex].y);
      // }
      ctx.stroke();
    }

    // 2. 별 그리기 (잡은 별 + 현재 목표 별 모두 표시)
    stars.forEach((star, idx) => {
      // 이미 잡았거나, 현재 목표인 경우 그리기
      if (star.isCaught || idx === currentIndex) {
        const isCurrentTarget = idx === currentIndex;
        
        ctx.beginPath();
        // 잡은 별은 고정 크기, 현재 목표는 펄스 효과
        const pulse = isCurrentTarget ? Math.sin(Date.now() / PULSE_SPEED) * 5 : 0;
        const radius = STAR_RADIUS + pulse;
        
        // 색상 구분: 현재 목표는 진한 골드, 잡은 별은 약간 연하게
        ctx.fillStyle = isCurrentTarget ? '#FFD700' : '#FFFACD'; 
        ctx.shadowBlur = isCurrentTarget ? 20 : 10;
        ctx.shadowColor = '#FFD700';
        
        ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 내부 흰 원
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(star.x, star.y, radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.restore();
  };

  const drawGhostPath = (ctx: CanvasRenderingContext2D, sideIdx: number) => {
    const { boxSize, startX, startY } = getBoxCoordinates();
    ctx.save();
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 20]);
    
    let sx = 0, sy = 0, ex = 0, ey = 0;
    switch (sideIdx) {
      case 0: sx = startX; sy = startY; ex = startX + boxSize; ey = startY; break;
      case 1: sx = startX + boxSize; sy = startY; ex = sx; ey = startY + boxSize; break;
      case 2: sx = startX + boxSize; sy = startY + boxSize; ex = startX; ey = sy; break;
      case 3: sx = startX; sy = startY + boxSize; ex = sx; ey = startY; break;
    }

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  const createExplosionParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      particlesRef.current.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1.0, size: Math.random() * 5 + 3, color,
      });
    }
  };

  const triggerSuccessParticles = () => {
    const { startX, startY, boxSize } = getBoxCoordinates();
    const cx = startX + boxSize / 2;
    const cy = startY + boxSize / 2;
    for (let i = 0; i < 50; i++) {
      particlesRef.current.push({
        x: cx, y: cy, 
        vx: (Math.random() - 0.5) * 15, 
        vy: (Math.random() - 0.5) * 15,
        life: 1.0, size: Math.random() * 8 + 2, color: '#4ADE80',
      });
    }
  };

  const updateAndDrawParticles = (ctx: CanvasRenderingContext2D) => {
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
      else {
        ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
  };

const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 루프가 끊기지 않도록 항상 다음 프레임을 예약합니다.
    requestRef.current = requestAnimationFrame(draw);

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const { phase, sideIndex } = gameState.current;
    const finger = fingerRef.current;

    drawBackgroundBox(ctx); // 배경 박스 그리기
    
    // IDLE 상태일 때도 루프는 돌지만, 로직만 실행하지 않고 리턴합니다.
    if (phase === 'IDLE') {
        return; 
    }

    if (phase === 'PREVIEW') {
      drawGhostPath(ctx, sideIndex);
      if (Date.now() - gameState.current.startTime > PREVIEW_DURATION) {
        gameState.current.phase = 'PLAYING';
      }
    }
    else if (phase === 'PLAYING') {
      // [수정 완료] 진행 방향(초록선+화살표) 그리기 함수 복구!
      drawActiveSide(ctx, sideIndex);

      // 별자리 그리기
      drawConstellation(ctx); 

      if (finger) {
        checkGameLogic(finger);
        
        // 손가락 위치 표시
        ctx.save(); 
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowBlur = 10; ctx.shadowColor = 'white';
        ctx.beginPath(); 
        ctx.arc(finger.x * CANVAS_WIDTH, finger.y * CANVAS_HEIGHT, 15, 0, Math.PI * 2); 
        ctx.fill(); 
        ctx.restore();
      }
    }

    updateAndDrawParticles(ctx);
    requestRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults((results) => {
      setIsLoaded(true);
      if (results.multiHandLandmarks?.[0]) {
        const indexTip = results.multiHandLandmarks[0][8];
        fingerRef.current = { x: 1 - indexTip.x, y: indexTip.y };

        // 🔍 디버깅: 손가락 인식 확인
        if (gameState.current.phase === 'PLAYING') {
          console.log('👆 Hand detected:', fingerRef.current);
        }
      } else {
        fingerRef.current = null;
        if (gameState.current.phase === 'PLAYING') {
          console.log('🚫 No hand detected');
        }
      }
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

  // 드로우 루프를 최초 1회 시작시킵니다. (draw 내부에서 스스로를 재호출함)
  useEffect(() => {
    requestRef.current = requestAnimationFrame(draw);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []); // 의존성 배열을 비워 처음에만 실행되게 합니다.

  // 🔥 개발자 스킵 모드 (Ctrl+Shift+S)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        console.log('🔥 [개발자 모드] 호흡 훈련 즉시 완료!');
        gameState.current.phase = 'FINISHED';
        setUiMessage("모든 훈련 완료!");
        setUiFeedback("수고하셨습니다! 🎉");
        setShowPostSUDS(true);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div 
      className="relative w-full h-screen overflow-hidden flex flex-col items-center justify-center"
      // [수정] 배경 이미지를 설정하는 스타일 추가
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',       // 화면 꽉 차게
        backgroundPosition: 'center',  // 중앙 정렬
        backgroundRepeat: 'no-repeat'  // 반복 없음
      }}
    >
      {/* [유지] 웹캠을 반투명(opacity-30)하게 깔아서 배경과 겹쳐 보이게 함 */}
      <Webcam ref={webcamRef} mirrored className="absolute w-full h-full object-cover opacity-10" />
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="absolute w-full h-full object-contain z-10" />

      {/* --- 시작 전 안내 모달 (Intro Overlay) --- */}
      {!isStarted && (
        <div className="absolute z-50 inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="max-w-2xl w-full bg-gray-900 border border-green-500/30 rounded-3xl p-8 text-center shadow-2xl">
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
              📦 박스 호흡 (Box Breathing)
            </h1>
            
            <div className="text-left text-gray-300 space-y-4 mb-8 text-lg">
              <p>
                <span className="text-green-400 font-bold">네이비씰(Navy SEALs)</span>이 극한의 상황에서 
                평정심을 유지하기 위해 사용하는 강력한 호흡법입니다.
              </p>
              
              <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h3 className="text-white font-bold mb-3 text-xl">✨ 게임 방법</h3>
                <ul className="space-y-2 list-disc list-inside">
                  <li>화면에 나타나는 <span className="text-yellow-400">별</span>을 검지 손가락으로 잡으세요.</li>
                  <li>별 하나가 1초입니다. 마음속으로 숫자를 세세요.</li>
                  <li>목표 개수만큼 잡았다면, <span className="text-blue-400">손가락과 숨을 멈추세요.</span></li>
                  <li>네온 박스를 따라 4초씩 4단계를 반복합니다.</li>
                </ul>
              </div>
            </div>

            {isLoaded ? (
              <button 
                onClick={handleStartGame}
                className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white text-2xl font-bold rounded-2xl shadow-lg transform transition hover:scale-[1.02] active:scale-95"
              >
                숨쉬기 시작하기
              </button>
            ) : (
              <div className="text-yellow-400 animate-pulse text-xl font-bold">
                📸 카메라와 손을 인식 중입니다...
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- 게임 UI Overlay --- */}
      {isStarted && (
        <div className="absolute z-20 w-full h-full flex flex-col items-center justify-between pointer-events-none py-10">
          <div className="flex flex-col items-center mt-10 w-full px-4">
            <h2 className="text-xl text-green-300 font-semibold drop-shadow-md">Cycle {cycleDisplay} / {TOTAL_CYCLES}</h2>
            
            <h1 className="text-3xl md:text-4xl text-white font-bold drop-shadow-lg mt-4 whitespace-pre-wrap text-center leading-relaxed">
              {uiMessage}
            </h1>
          </div>

          {uiFeedback && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30">
              <div className="bg-black/70 px-8 py-4 rounded-xl backdrop-blur-sm border border-yellow-400">
                <div className="text-3xl md:text-4xl text-yellow-300 font-bold animate-bounce drop-shadow-lg whitespace-nowrap">
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
      )}
    {showPostSUDS && (
    <SUDSModal
      open={true}
      label="post"
      onClose={() => setShowPostSUDS(false)}
      onSubmit={async (score) => {
        await fetch("/suds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "manual",
            score,
            session_id: "box-breathing-session", // 필요시 실제 session_id 사용
          }),
        });
        setShowPostSUDS(false);
        navigate("/dashboard"); // 완료 후 대시보드로 이동
      }}
    />
  )}
    </div>
  );
};

export default ARBoxBreathingPage;

// 여기서 방향을 알려주는 코드 알랴달라고 하기 