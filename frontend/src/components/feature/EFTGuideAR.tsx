/**
 * AR EFT 탭핑 가이드 컴포넌트
 * MediaPipe Face Mesh를 사용한 실시간 얼굴 인식 및 탭핑 포인트 오버레이
 * 468개의 정확한 얼굴 랜드마크를 사용하여 정밀한 EFT 포인트 매핑 제공
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Hands } from '@mediapipe/hands';
import { Pose } from '@mediapipe/pose';
import { useCamera } from '../../modules/ar/useCamera';
import Calibration from '../../modules/ar/components/Calibration';

// EFT 포인트와 얼굴 랜드마크 매핑 (MediaPipe Face Mesh 정확한 인덱스)
const EFT_FACE_MAPPINGS = [
  { 
    id: 'eyebrow', 
    name: '눈썹', 
    landmarkIndex: 9, // 미간 중앙 부분 (Face Mesh)
    offset: { x: 0, y: -20 },
    color: '#4ecdc4' 
  },
  { 
    id: 'side_eye', 
    name: '눈가', 
    landmarkIndex: 33, // 오른쪽 눈 바깥쪽 (Face Mesh)
    offset: { x: 10, y: 0 },
    color: '#45b7d1' 
  },
  { 
    id: 'under_eye', 
    name: '눈 밑', 
    landmarkIndex: 159, // 오른쪽 눈 아래 중앙 (Face Mesh)
    offset: { x: 0, y: 10 },
    color: '#f9ca24' 
  },
  { 
    id: 'under_nose', 
    name: '코 밑', 
    landmarkIndex: 2, // 코끝 아래 인중 부위 (Face Mesh)
    offset: { x: 0, y: 15 },
    color: '#f0932b' 
  },
  { 
    id: 'chin', 
    name: '턱', 
    landmarkIndex: 175, // 턱 중앙 아래 (Face Mesh)
    offset: { x: 0, y: 10 },
    color: '#eb4d4b' 
  }
] as const;

// 정수리 좌표 계산 함수 (Face Oval 최상단 + 턱까지 세로거리 비율 오프셋)
const computeCrownPoint = (landmarks: any[], canvasW: number, canvasH: number) => {
  // 대표적인 Face Oval 인덱스 집합(최상단 탐색용)
  const OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
  ];
  let top = { x: canvasW * 0.5, y: canvasH }; // 최상단 후보
  for (const idx of OVAL) {
    const p = landmarks[idx];
    if (!p) continue;
    const y = p.y * canvasH;
    if (y < top.y) top = { x: p.x * canvasW, y };
  }
  // 중앙 턱: 152 (MediaPipe FaceMesh에서 chin tip로 널리 사용)
  const chin = landmarks[152];
  if (chin) {
    const chinY = chin.y * canvasH;
    const vertical = chinY - top.y;     // 턱→최상단 세로거리
    return {
      x: top.x,
      y: top.y - vertical * 0.38,       // 필요시 0.35~0.45 사이 튜닝
    };
  }
  // 폴백: 고정 오프셋
  return { x: top.x, y: top.y - 60 };
};

// 🔄 거울 모드 좌우 라벨 교환 함수 (문장 전체에 대해 스왑)
const MIRROR_MODE = true; // 비디오/캔버스가 scaleX(-1)라면 true
const swapLeftRightForMirror = (label: string): string => {
  if (!MIRROR_MODE) return label;
  let out = label;
  // 한글
  out = out.replace(/왼쪽/g, '__TMP_RIGHT__');
  out = out.replace(/오른쪽/g, '왼쪽');
  out = out.replace(/__TMP_RIGHT__/g, '오른쪽');
  // 영어
  out = out.replace(/Left /g, '__TMP_RIGHT__ ');
  out = out.replace(/Right /g, 'Left ');
  out = out.replace(/__TMP_RIGHT__ /g, 'Right ');
  return out;
};

// 추가 포인트들 (얼굴이 아닌 부위) - 정수리 제외
const ADDITIONAL_POINTS = [
  { id: 'collarbone', name: '쇄골', position: { x: 0.5, y: 0.85 }, color: '#6c5ce7' },
  { id: 'under_arm', name: '겨드랑이', position: { x: 0.2, y: 0.65 }, color: '#a29bfe' },
  { id: 'karate_chop', name: '손날', position: { x: 0.8, y: 0.7 }, color: '#fd79a8' }
] as const;

// crown 포함 총 포인트 수
const TOTAL_POINTS =
  EFT_FACE_MAPPINGS.length + ADDITIONAL_POINTS.length + 1; // +1: crown

interface TappingPoint {
  x: number;
  y: number;
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  isCompleted: boolean;
}

interface EFTGuideARProps {
  isActive: boolean;
  onSessionComplete?: () => void;
  onPointProgress?: (pointIndex: number, isCompleted: boolean) => void;
}

export const EFTGuideAR: React.FC<EFTGuideARProps> = ({
  isActive,
  onSessionComplete,
  onPointProgress
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const handsRef = useRef<Hands | null>(null);
  const didInitRef = useRef(false); // 🔒 중복 초기화 가드
  
  // ── 세션/루프/처리 상태 ───────────────────────────────────────────────
  const sessionStartedRef = useRef(false);
  const loopRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  
  // 개선된 카메라 훅 사용
  const camera = useCamera();

  // 좌우 반전 좌표 변환: logicalX -> canvas pixel X
  const canvasX = (x: number, canvas?: HTMLCanvasElement | null) => {
    const w = canvas?.width ?? 640; // DPR 반영된 내부 픽셀폭 사용
    return w - x;
  };

  const [isLoading, setIsLoading] = useState(true);
  const [calibrationReady, setCalibrationReady] = useState(false);
  const calibrationLockedRef = useRef(false); // 🔒 캘리브레이션 잠금
  
  // ── 임계치 튜닝용 ref ─────────────────────────────────────────────────
  const lastDetectedRef = useRef<number>(0);
  const tunedAtRef = useRef<number>(0);
  const loosenedOnceRef = useRef<boolean>(false);
  const startTimeRef = useRef<number>(performance.now());

  // ── 페이지 가시성 ref ────────────────────────────────────────────────
  const pageVisibleRef = useRef(true);
  const resumeJitterBlockRef = useRef<number>(0);
  
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [completedPoints, setCompletedPoints] = useState<boolean[]>(
    new Array(TOTAL_POINTS).fill(false)
  );
  const [sessionStarted, setSessionStarted] = useState(false);
  const [detectedPoints, setDetectedPoints] = useState<TappingPoint[]>([]);
  const [handPosition, setHandPosition] = useState<{ x: number; y: number } | null>(null);
  const [bodyPoints, setBodyPoints] = useState<TappingPoint[]>([]);
  const poseRef = useRef<Pose | null>(null);
  const poseFrameCountRef = useRef(0);
  const poseLoadedRef = useRef(false);
  const poseRetryDelayRef = useRef(300);
  const [showHint, setShowHint] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(true);
  const framesRef = useRef(0);
  const lastHitRef = useRef<number>(Date.now());
  const frameNoRef = useRef(0);

  // MediaPipe 모델 초기화
  const initializeMediaPipe = useCallback(async () => {
    // ----- Pose 초기화 (쇄골 포인트 전용) -----
    if (!poseRef.current) {
      try {
        poseRef.current = new Pose({
          locateFile: (file) => `${import.meta.env.BASE_URL}mediapipe/pose/${file}`,
        });
        poseRef.current.setOptions({
          modelComplexity: 0, // 가볍게 시작
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        poseRef.current.onResults((results: any) => {
          if (!poseLoadedRef.current) {
            poseLoadedRef.current = true; // 첫 성공 지점
          }
          const lms = results?.poseLandmarks;
          if (!lms || !canvasRef.current) return;
          const W = canvasRef.current.width || 640;
          const H = canvasRef.current.height || 480;
          const toCanvas = (p: any) => ({ x: p.x * W, y: p.y * H });
          const pts: TappingPoint[] = [];
          const L = lms[11]; // left_shoulder
          const R = lms[12]; // right_shoulder
          const visOK = (p: any) => (p?.visibility ?? 1) > 0.5;
          const inFrame = (p: any) => p?.x >= 0.05 && p?.x <= 0.95 && p?.y >= 0.05 && p?.y <= 0.95;

          // Left clavicle: 신뢰도 + 프레임 내일 때만 반영
          if (L?.x != null && L?.y != null && visOK(L) && inFrame(L)) {
            const lc = toCanvas(L);
            pts.push({ id: 'left_clavicle', name: 'Left Clavicle', x: lc.x, y: lc.y - 10, color: '#00ffff', isActive: false, isCompleted: false });
          } else if (process.env.NODE_ENV === 'development') {
            console.warn('[pose] skip left_clavicle (vis/inFrame fail)', {
              vis: L?.visibility, x: L?.x, y: L?.y
            });
          }

          // Right clavicle: 신뢰도 + 프레임 내일 때만 반영
          if (R?.x != null && R?.y != null && visOK(R) && inFrame(R)) {
            const rc = toCanvas(R);
            pts.push({ id: 'right_clavicle', name: 'Right Clavicle', x: rc.x, y: rc.y - 10, color: '#00ffff', isActive: false, isCompleted: false });
          } else if (process.env.NODE_ENV === 'development') {
            console.warn('[pose] skip right_clavicle (vis/inFrame fail)', {
              vis: R?.visibility, x: R?.x, y: R?.y
            });
          }
          setBodyPoints(pts);
        });
      } catch (e) {
        console.warn('Pose init skipped:', e);
      }
    }

    try {
      setIsLoading(true);
      
      // 얼굴 메시 모델 설정 (468개 랜드마크 제공)
      console.log('🎯 FaceMesh 초기화 시작...');
      const base = import.meta.env.DEV
        ? 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619'
        : '/mediapipe/face_mesh';
      console.log('📦 MediaPipe base:', base);

      const faceMesh = new FaceMesh({ 
        locateFile: (f: string) => `${base}/${f}` 
      });

      faceMesh.setOptions({
        selfieMode: true,
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.2,   // 초기 관대
        minTrackingConfidence: 0.2,
      });

      let boosted = false;

      function onFaceResults(res: any) {
        const pts = res?.multiFaceLandmarks?.[0];
        console.log('🧪 onResults:', { hasFace: !!pts, len: pts?.length ?? 0 });
        
        if (pts && pts.length) {
          if (boosted) {
            // 붙은 뒤엔 품질 복원
            faceMesh.setOptions({
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5,
              refineLandmarks: true,
            });
            boosted = false;
            console.log('🔁 Restored FaceMesh thresholds');
          }
          lastHitRef.current = Date.now();
          setDetecting(false);
        } else {
          setDetecting(true);
        }
        
        if (canvasRef.current && videoRef.current) {
          drawFaceOverlay(pts ? { multiFaceLandmarks: [pts] } : null);
        }
      }

      faceMesh.onResults(onFaceResults);

      // 손 인식 모델 설정
      const hands = new Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults((results) => {
        if (results.multiHandLandmarks && results.multiHandLandmarks[0]) {
          const landmark = results.multiHandLandmarks[0][8]; // 검지손가락 끝
          const newPosition = {
            x: landmark.x * (canvasRef.current?.width || 0),
            y: landmark.y * (canvasRef.current?.height || 0)
          };
          setHandPosition(newPosition);
          // console.log('Hand detected at:', newPosition);
        } else {
          setHandPosition(null);
          // console.log('No hand detected');
        }
      });

      faceMeshRef.current = faceMesh;
      handsRef.current = hands;
      setIsLoading(false);

    } catch (err) {
      console.error('MediaPipe 초기화 오류:', err);
      setErrorMsg(err instanceof Error ? err.message : 'AR 기능을 초기화할 수 없습니다.');
      setIsLoading(false);
    }
  }, []);

  // 🎥 콜백 ref: DOM 붙는 순간에 카메라 초기화
  // 🎥 비디오 ref 콜백 (동기 함수로 변경)
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    
    if (!node) {
      // Video element unmounted - 로그 노이즈 제거
      return;
    }

    console.log('📹 Video element mounted, ready for camera init');
  }, []);

  // 🎥 카메라 초기화 (비디오 DOM이 준비된 후 별도 실행)
  const initializeCamera = useCallback(async () => {
    if (!videoRef.current || didInitRef.current) {
      console.log('🔒 Camera already initialized or video not ready');
      return;
    }

    try {
      console.log('🎥 Initializing camera with DOM-ready video element...');
      didInitRef.current = true;
      
      await camera.startCamera(videoRef.current, { 
        width: 640, 
        height: 480, 
        facingMode: 'user' 
      });
      
      console.log('✅ Camera initialized successfully');
      
    } catch (err: any) {
      console.error('🚨 Camera initialization failed:', err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      didInitRef.current = false; // 실패하면 다시 시도 허용
    }
  }, [camera]);

  // 캘리브레이션 완료 핸들러 (한 번만 실행)
  const handleCalibrationReady = useCallback(() => {
    if (calibrationLockedRef.current) return; // 이미 완료됨
    calibrationLockedRef.current = true;
    setCalibrationReady(true);
    console.log('Calibration completed, AR session ready (locked)');
  }, []);

  // 카메라 준비 상태 대기 헬퍼 (레이스 조건 해결)
  const waitUntil = useCallback((pred: () => boolean, timeoutMs = 1500, stepMs = 50) => {
    return new Promise<boolean>(resolve => {
      const start = performance.now();
      const tick = () => {
        if (pred()) return resolve(true);
        if (performance.now() - start >= timeoutMs) return resolve(false);
        setTimeout(tick, stepMs);
      };
      tick();
    });
  }, []);

  const ensureCameraReady = useCallback(async () => {
    // 1) 이미 활성화면 패스
    if (camera.isActive || (videoRef.current?.readyState ?? 0) >= 2) return true;

    // 2) 초기화 시도
    await initializeCamera();

    // 3) "isActive OR readyState≥2" 둘 중 하나 될 때까지 대기
    const ok = await waitUntil(
      () => camera.isActive || (videoRef.current?.readyState ?? 0) >= 2,
      1500, 50
    );
    return ok;
  }, [camera, initializeCamera, waitUntil]);

  // 🎯 FaceMesh 초기화 함수
  const createFaceMesh = useCallback(async (): Promise<FaceMesh> => {
    console.log('🎯 createFaceMesh 초기화 시작...');
    const fm = new FaceMesh({
      locateFile: (file) => {
        const url = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        console.log('📦 Loading MediaPipe file:', url);
        return url;
      }
    });
    
    fm.setOptions({
      selfieMode: true,
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.2,   // ↓ 0.5 → 0.2 (초기 탐지 더 관대하게)
      minTrackingConfidence: 0.2,    // ↓ 0.5 → 0.2 (초기 탐지 더 관대하게)
    });
    
    // 결과 핸들러 등록
    fm.onResults((results) => {
      const lm = results?.multiFaceLandmarks?.[0];
      const now = performance.now();
      const has = !!(lm && lm.length);
      
      // 디버그
      console.log('🧪 onResults:', { has, lm: lm?.length ?? 0, w: results.image?.width, h: results.image?.height });

      if (has) {
        lastDetectedRef.current = now;
        lastHitRef.current = Date.now();
        // 감지 성공 후 3초 쿨다운마다 살짝 상향
        if (now - (tunedAtRef.current || 0) > 3000) {
          fm.setOptions({ minDetectionConfidence: 0.4, minTrackingConfidence: 0.4 });
          tunedAtRef.current = now;
          console.log('✅ Face detected → tightened thresholds to 0.4');
        }
        setDetecting(false);
      } else {
        // 초기에만 1회 완화(스팸 방지)
        if (!loosenedOnceRef.current) {
          fm.setOptions({ minDetectionConfidence: 0.2, minTrackingConfidence: 0.2 });
          loosenedOnceRef.current = true;
          console.log('🔽 Loosened thresholds to 0.2 for warm-up');
        }
        setDetecting(true);
      }
      
      if (canvasRef.current && videoRef.current) {
        drawFaceOverlay(results);
      }
    });
    
    return fm;
  }, []);


  // ── RAF 탐지 루프(플래그/재진입 가드) ─────────────────────────────────
  const loop = useCallback(async () => {
    if (!sessionStartedRef.current) {
      // 세션 중단 시 루프 종료
      return;
    }
    const video = videoRef.current;
    const fm = faceMeshRef.current;
    const now = performance.now();
    
    // 탭 복귀 직후 잠깐 스킵(노이즈 감소)
    if (now < resumeJitterBlockRef.current) {
      loopRef.current = requestAnimationFrame(loop);
      return;
    }
    
    if (video && video.readyState >= 2 && fm && !processingRef.current) {
      processingRef.current = true;
      try {
        await fm.send({ image: video });
        if (handsRef.current) {
          await handsRef.current.send({ image: video });
        }
      } catch (e) {
        console.error('send error', e);
        setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        processingRef.current = false;
      }
    }
    loopRef.current = requestAnimationFrame(loop);
  }, []);



  // 얼굴 오버레이 그리기
  const drawFaceOverlay = (results: any) => {
    if (!canvasRef.current) return;
    
    // Pose 프레임 전송 (2프레임에 1회, 로딩 실패시 백오프)
    const trySendPose = async () => {
      if (!poseRef.current || !videoRef.current) return;
      poseFrameCountRef.current = (poseFrameCountRef.current + 1) % 2;
      if (poseFrameCountRef.current !== 0) return;
      try {
        await poseRef.current.send({ image: videoRef.current });
        // 성공하면 딘레이 초기화
        if (poseLoadedRef.current) poseRetryDelayRef.current = 300;
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.warn('pose send failed (backing off):', e);
        // 실패 시 재시도 딘레이 점증
        poseRetryDelayRef.current = Math.min(poseRetryDelayRef.current * 2, 4000);
        setTimeout(() => { /* no-op timer to space out sends */ }, poseRetryDelayRef.current);
      }
    };
    void trySendPose(); // fire-and-forget: 렌더 블로킹 방지
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 동적 조정
    if (videoRef.current) {
      const video = videoRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    // 캔버스 클리어
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 캔버스 좌표계 보정 (상위 스코프의 canvasX 함수 사용)

    // 안전 프레임(패딩 가이드) — 프레임의 10% 안쪽으로 박스 표시
    const padX = canvas.width * 0.10;
    const padY = canvas.height * 0.10;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(padX, padY, canvas.width - padX * 2, canvas.height - padY * 2);
    ctx.restore();

    // --- 렌더 순서: body → hands → face ---
    // 1) Body(쇄골) 먼저 렌더
    try {
      for (const p of bodyPoints) {
        drawTappingPoint(ctx, p, false);
      }
    } catch {}
    // 2) (필요 시) Hands 시각화
    // 3) Face 포인트는 기존대로 이후에 렌더

    // 항상 기본 포인트들을 먼저 추가 (얼굴 감지 여부와 관계없이)
    const points: TappingPoint[] = [];
    
    // 얼굴 랜드마크에서 정수리 계산 후 포인트 추가
    try {
      const lms = results?.multiFaceLandmarks?.[0];
      if (lms && canvasRef.current) {
        const W = canvasRef.current.width;
        const H = canvasRef.current.height;
        const crown = computeCrownPoint(lms, W, H);
        if (crown) {
          const crownIndex = EFT_FACE_MAPPINGS.length + ADDITIONAL_POINTS.length; // crown point index
          points.push({
            id: 'crown',
            name: '정수리',
            x: crown.x, 
            y: crown.y,
            color: '#ff6b6b', 
            isActive: crownIndex === currentPointIndex && sessionStarted,
            isCompleted: completedPoints[crownIndex]
          });
          // Crown point calculated - 로그 노이즈 제거
        } else if (process.env.NODE_ENV === 'development') {
          console.warn('crown missing for this frame');
        }
      }
    } catch {}
    
    // 1. 추가 포인트(고정) 추가하되, bodyPoints로 대체 가능한 항목은 제외
    const liveBodyIds = new Set(bodyPoints.map(p => p.id));
    ADDITIONAL_POINTS.forEach((point, index) => {
      // pose가 제공하는 실시간 포인트가 있으면 해당 고정 포인트는 건너뛰
      if (
        (liveBodyIds.has('left_clavicle') || liveBodyIds.has('right_clavicle')) && point.id === 'collarbone'
      ) {
        return;
      }
      const realIndex = EFT_FACE_MAPPINGS.length + index;
      const x = point.position.x * canvas.width;
      const y = point.position.y * canvas.height;
      
      points.push({
        x,
        y,
        id: point.id,
        name: point.name,
        color: point.color,
        isActive: realIndex === currentPointIndex && sessionStarted,
        isCompleted: completedPoints[realIndex]
      });
      
      // Fixed point logged - 로그 노이즈 제거
    });
    
    // 2. 얼굴 기반 포인트들 (얼굴이 감지된 경우만) - Face Mesh 결과 사용
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const faceLandmarks = results.multiFaceLandmarks[0]; // 첫 번째 얼굴만 사용
      
      // 얼굴 감지되면 detecting 상태 해제
      if (detecting) {
        setDetecting(false);
      }

      // Face mesh detected - 로그 간소화
      
      EFT_FACE_MAPPINGS.forEach((mapping, index) => {
        if (faceLandmarks[mapping.landmarkIndex]) {
          const landmark = faceLandmarks[mapping.landmarkIndex];
          const x = landmark.x * canvas.width + mapping.offset.x;
          const y = landmark.y * canvas.height + mapping.offset.y;

          points.push({
            x,
            y,
            id: mapping.id,
            name: mapping.name,
            color: mapping.color,
            isActive: index === currentPointIndex && sessionStarted,
            isCompleted: completedPoints[index]
          });
          
          // Face point logged - 로그 노이즈 제거
        } else {
          console.warn(`Landmark ${mapping.landmarkIndex} not found for ${mapping.name}`);
        }
      });
    } else {
      console.log('No face mesh detected, showing fixed points only');
    }
    
    // Total points to draw logged - 로그 간소화

    setDetectedPoints(points);

    // 포인트들 그리기
    points.forEach((point, index) => {
      drawTappingPoint(ctx, point, index === currentPointIndex && sessionStarted);
    });

    // 손 위치 표시
    if (handPosition) {
      drawHandIndicator(ctx, handPosition);
      
      // 탭핑 감지 (세션이 시작된 경우만)
      if (sessionStarted) {
        checkTappingInteraction(points);
      }
    }
  };

  // 탭핑 포인트 그리기 (크기 절반으로 축소)
  const drawTappingPoint = (
    ctx: CanvasRenderingContext2D,
    point: TappingPoint,
    isCurrentTarget: boolean
  ) => {
    const radius = isCurrentTarget ? 18 : 12; // 절반 크기로 축소 (35→18, 25→12)
    const alpha = point.isCompleted ? 0.5 : 1.0;
    
    // 초대형 탭핑 포인트 그리기 (카메라에서 잘 보이도록)
    // Drawing point logged - 로그 노이즈 제거
    
    ctx.save();

    // 배경 원 (적절한 크기로)
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(canvasX(point.x, canvas), point.y, radius + 5, 0, 2 * Math.PI); // 10→5로 축소
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();
    
    // 메인 원 (적절한 크기로)
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(canvasX(point.x, canvas), point.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = isCurrentTarget ? '#ffff00' : point.color; // 활성 시 노란색
    ctx.fill();
    
    // 테두리 (적절한 두께로)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3; // 6→3으로 축소
    ctx.stroke();

    if (isCurrentTarget) {
      // 펄싱 효과 (적절한 크기로)
      const pulseRadius = radius + Math.sin(Date.now() / 120) * 12; // 25→12로 축소
      ctx.beginPath();
      ctx.arc(canvasX(point.x, canvas), point.y, pulseRadius, 0, 2 * Math.PI);
      ctx.strokeStyle = '#ff0000'; // 빨간색으로 강조
      ctx.lineWidth = 4; // 8→4로 축소
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      
      // 두 번째 펄싱 링
      const pulse2 = radius + Math.sin(Date.now() / 100) * 18; // 35→18로 축소
      ctx.beginPath();
      ctx.arc(canvasX(point.x, canvas), point.y, pulse2, 0, 2 * Math.PI);
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2; // 4→2로 축소
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      
      // Active point pulsing - 로그 노이즈 제거
    }

    // 적절한 크기의 라벨
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#ffff00'; // 노란색 텍스트
    ctx.strokeStyle = '#000000'; // 검은색 외곽선
    ctx.lineWidth = 3; // 6→3으로 축소
    ctx.font = 'bold 16px Arial'; // 28px→16px로 축소
    ctx.textAlign = 'center';
    
    const labelY = point.y - radius - 15; // 25→15로 축소
    ctx.strokeText(point.name, canvasX(point.x, canvas), labelY);
    ctx.fillText(point.name, canvasX(point.x, canvas), labelY);
    
    ctx.restore();
  };

  // 손 위치 표시
  const drawHandIndicator = (
    ctx: CanvasRenderingContext2D,
    position: { x: number; y: number }
  ) => {
    const canvasEl = canvasRef.current ?? (ctx.canvas as HTMLCanvasElement | null);

    ctx.save();

    // 본체 채우기
    ctx.beginPath();
    ctx.arc(canvasX(position.x, canvasEl), position.y, 10, 0, 2 * Math.PI);
    ctx.fillStyle = '#00b894';
    ctx.fill();

    // 외곽선(흰색 링)
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
  };

  // 탭핑 상호작용 감지
  const checkTappingInteraction = (points: TappingPoint[]) => {
    if (!handPosition || !sessionStarted) {
      // console.log('Tapping check skipped:', { handPosition: !!handPosition, sessionStarted });
      return;
    }

    const currentPoint = points[currentPointIndex];
    if (!currentPoint) {
      console.log('No current point found for index:', currentPointIndex);
      return;
    }

    const distance = Math.sqrt(
      Math.pow(handPosition.x - currentPoint.x, 2) +
      Math.pow(handPosition.y - currentPoint.y, 2)
    );

    // 탭핑 감지 (거리 임계값을 포인트 크기에 맞게 조정)
    if (distance < 30) { // 50→30으로 축소
      console.log(`Tapping detected! Distance: ${distance.toFixed(2)}px, Point: ${currentPoint.name}`);
      
      const newCompleted = [...completedPoints];
      newCompleted[currentPointIndex] = true;
      setCompletedPoints(newCompleted);

      onPointProgress?.(currentPointIndex, true);

      // 다음 포인트로 이동
      setCurrentPointIndex(prev => {
        const nextIndex = Math.min(prev + 1, TOTAL_POINTS - 1);
        if (nextIndex >= TOTAL_POINTS - 1 && prev === TOTAL_POINTS - 1) {
          // 세션 완료 (마지막 포인트에서)
          console.log('Session completed!');
          setSessionStarted(false);
          onSessionComplete?.();
          return 0;
        }
        console.log(`Moving to next point: ${nextIndex}`);
        return nextIndex;
      });
    }
  };

  // 세션 제어 (이중 클릭 방지 + 안정화)
  const togglingRef = useRef(false);
  const toggleSession = useCallback(async () => {
    if (togglingRef.current) return;
    togglingRef.current = true;

    try {
      if (sessionStartedRef.current) {
        // ⏹ Stop
        console.log('⏹ Stop clicked → sessionStartedRef = false');
        sessionStartedRef.current = false;
        setSessionStarted(false);
        if (loopRef.current) cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
        camera.stopCurrentStream?.();
        setCurrentPointIndex(0);
        setCompletedPoints(new Array(TOTAL_POINTS).fill(false));
        return;
      }

      // 🚀 Start
      console.log('🚀 toggleSession: Starting session...');
      
      // (중복 초기화 방지) 이미 카메라가 준비되어 있으면 재초기화 금지
      const ok = await ensureCameraReady();
      if (!ok) {
        console.warn('Camera not ready after wait');
        setErrorMsg('카메라 준비 실패: 브라우저 권한/다른 앱 점유를 확인하세요.');
        return;
      }

      // FaceMesh 준비 확인
      if (!faceMeshRef.current) {
        console.log('🎯 FaceMesh not ready, initializing...');
        try {
          faceMeshRef.current = await createFaceMesh();
        } catch (e) {
          setErrorMsg('AR 엔진 준비 실패: ' + (e as any)?.message);
          return;
        }
      }

      // 세션 플래그를 먼저 세우고 루프 시작
      console.log('▶ Start clicked → sessionStartedRef = true');
      sessionStartedRef.current = true;
      setSessionStarted(true);
      startTimeRef.current = performance.now();
      setCurrentPointIndex(0);
      setCompletedPoints(new Array(TOTAL_POINTS).fill(false));
      setDetecting(true);
      framesRef.current = 0;
      lastHitRef.current = Date.now();
      
      if (!loopRef.current) {
        console.log('🎬 RAF 루프 시작됨');
        loopRef.current = requestAnimationFrame(loop);
      }
    } finally {
      togglingRef.current = false;
    }
  }, [loop, camera, ensureCameraReady, createFaceMesh]);

  // 초기화
  useEffect(() => {
    if (isActive) {
      initializeMediaPipe();
    }
  }, [isActive, initializeMediaPipe]);

  // 세션 시작/종료 및 포인트 변경 반응
  useEffect(() => {
    if (sessionStarted) {
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 4000); // 4초로 연장
      return () => clearTimeout(t);
    } else {
      setShowHint(false);
    }
  }, [sessionStarted, currentPointIndex]); // currentPointIndex 의존성 추가

  // 감지 워치독 - 무한 "감지 중" 방지
  useEffect(() => {
    if (!sessionStarted) return;
    
    const watchdogInterval = setInterval(() => {
      const noHitFor = Date.now() - lastHitRef.current;
      if (sessionStartedRef.current && noHitFor > 5000) {
        console.warn('⚠️ No face detected for 5 seconds - loosening detection');
        if (faceMeshRef.current) {
          faceMeshRef.current.setOptions({
            minDetectionConfidence: 0.15,
            minTrackingConfidence: 0.15,
            refineLandmarks: false,
          });
          console.log('🔽 Emergency loosened thresholds to 0.15');
        }
      }
    }, 1000);
    
    return () => clearInterval(watchdogInterval);
  }, [sessionStarted]);

  // 페이지 가시성 변화 시: 루프만 일시 정지/재개(세션 플래그 유지)
  useEffect(() => {
    const onVis = () => {
      const vis = document.visibilityState === 'visible';
      pageVisibleRef.current = vis;
      if (!vis) {
        // 숨김 → 루프만 중단
        if (loopRef.current) cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
      } else {
        // 보임 → 복귀 직후 잠깐 스킵 후 재개
        resumeJitterBlockRef.current = performance.now() + 300;
        if (sessionStartedRef.current && !loopRef.current) {
          loopRef.current = requestAnimationFrame(loop);
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loop]);

  // 🧹 언마운트 정리
  useEffect(() => {
    return () => {
      console.log('🧹 EFTGuideAR unmount cleanup');
      sessionStartedRef.current = false;
      setSessionStarted(false);
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
      camera.stopCamera();
      didInitRef.current = false;
    };
  }, [camera]);

  // 캔버스 크기 조정
  useEffect(() => {
    const handleVideoLoad = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        console.log('Video dimensions:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height
        });
        
        // 🎨 DPR 고려한 고화질 캔버스 크기 조정
        if (video.videoWidth && video.videoHeight) {
          const dpr = window.devicePixelRatio || 1;
          
          // 캔버스 내부 해상도 (실제 렌더링 해상도)
          canvas.width = video.videoWidth * dpr;
          canvas.height = video.videoHeight * dpr;
          
          // 캔버스 표시 크기 (CSS 크기)
          canvas.style.width = `${video.videoWidth}px`;
          canvas.style.height = `${video.videoHeight}px`;
          
          // 컨텍스트 스케일링
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          
          console.log(`🎨 Canvas synced with DPR ${dpr}: ${video.videoWidth}×${video.videoHeight} → ${canvas.width}×${canvas.height}`);
        }
      }
    };

    const videoElement = videoRef.current;
    if (videoElement) {
      videoElement.addEventListener('loadedmetadata', handleVideoLoad);
      return () => {
        videoElement.removeEventListener('loadedmetadata', handleVideoLoad);
      };
    }
  }, [isActive]);

  if (!isActive) return null;

  // ✅ (해결) 항상 렌더 + CSS 표시만 제어 - 조건부 렌더링 금지
  const showCalibration = (!calibrationReady && !calibrationLockedRef.current) || errorMsg;

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* ✅ 항상 렌더되는 Calibration - display 속성으로만 제어 */}
      <div style={{ display: showCalibration ? 'block' : 'none', position: 'absolute', inset: 0, zIndex: 50 }}>
        <Calibration
          onReady={handleCalibrationReady}
          message="AR EFT 세션을 위해 카메라를 설정해주세요"
          showBackButton={true}
        />
      </div>

      {/* 로딩 표시 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">AR 시스템 초기화 중...</p>
          </div>
        </div>
      )}

      {/* 에러 표시 */}
      {errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center">
            <p className="text-red-400 mb-4">{errorMsg}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* 비디오 스트림 - 콜백 ref 사용 */}
      <video
        ref={setVideoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        style={{ transform: 'scaleX(-1)' }} // 거울 모드
      />

      {/* 오버레이 캔버스 */}
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{}} // 캔버스는 거울 해제
      />

      {/* 중앙 시작 버튼 - 세션이 시작되지 않았을 때만 표시 */}
      {!sessionStarted && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <button
            onClick={toggleSession}
            className="px-16 py-8 rounded-2xl font-bold text-3xl shadow-2xl border-4 border-white bg-green-500 hover:bg-green-600 text-white transform transition-all duration-300 hover:scale-105"
            style={{ zIndex: 999 }}
          >
            🚀 AR 세션 시작
          </button>
        </div>
      )}

      {/* UI 컨트롤 레이어 (항상 최상위) */}
      <div className="relative z-40">
        {/* 중지 버튼 - 세션이 시작된 후 오른쪽 상단에 표시 */}
        {sessionStarted && (
          <div className="absolute top-4 right-4">
          <button
            onClick={toggleSession}
            className="px-8 py-4 rounded-xl font-bold text-xl shadow-2xl border-2 border-white bg-red-500 hover:bg-red-600 text-white animate-pulse transform transition-all duration-300 hover:scale-105"
            style={{ zIndex: 999 }}
          >
            🛑 중단하기
          </button>
        </div>
        )}
      </div>

      {/* 상단 진행률 표시 - 카메라 위에 큰 글자로 */}
      {sessionStarted && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50" style={{ zIndex: 999 }}>
          <div className="bg-black/80 backdrop-blur-sm rounded-2xl px-8 py-4 shadow-2xl border-2 border-yellow-400">
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              🎯 {detectedPoints[currentPointIndex]?.name || '감지 중...'} 포인트
            </h2>
            <div className="flex justify-center space-x-2">
              {Array.from({ length: TOTAL_POINTS }).map((_, index) => (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-colors ${
                    completedPoints[index]
                      ? 'bg-green-400'
                      : index === currentPointIndex
                      ? 'bg-yellow-400 animate-ping'
                      : 'bg-gray-500'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 얼굴 감지 상태 표시 */}
      {sessionStarted && detecting && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/60 text-white text-sm font-semibold shadow-lg">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            <span>🎯 얼굴 감지 중... 화면 중앙에 얼굴을 맞춰주세요</span>
          </div>
        </div>
      )}

      {/* 상단 안내 카드: 세션 중에만 잠깐 표시 */}
      {sessionStarted && !detecting && showHint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/60 text-white text-sm font-semibold shadow-lg">
            <span>👆 {detectedPoints[currentPointIndex]?.name || '포인트'}에 손가락을 가져다 대세요</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EFTGuideAR;