/**
 * AR EFT 탭핑 가이드 컴포넌트
 * MediaPipe Face Mesh를 사용한 실시간 얼굴 인식 및 탭핑 포인트 오버레이
 * 468개의 정확한 얼굴 랜드마크를 사용하여 정밀한 EFT 포인트 매핑 제공
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Hands } from '@mediapipe/hands';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { validateAndAssertRefs, createUserFriendlyError } from '../../utils/debug';

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
  const cameraRef = useRef<Camera | null>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const handsRef = useRef<Hands | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const faceMesh = new FaceMesh({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // 더 정확한 랜드마크를 위해
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      faceMesh.onResults((results) => {
        if (canvasRef.current && videoRef.current) {
          console.log('Face mesh results:', results.multiFaceLandmarks?.length || 0);
          drawFaceOverlay(results);
        }
      });

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
      setError('AR 기능을 초기화할 수 없습니다.');
      setIsLoading(false);
    }
  }, []);

  // 카메라 초기화
  const initializeCamera = useCallback(async () => {
    console.log('🎥 Initializing camera...');
    
    const refsToCheck = [
      { name: 'Video', ref: videoRef, type: HTMLVideoElement },
      { name: 'Face mesh', ref: faceMeshRef },
      { name: 'Hands', ref: handsRef }
    ];
    
    // 🚀 통합 Ref 검증 (존재 + 타입 + 로그)
    if (!validateAndAssertRefs(refsToCheck, (userMsg, techMsg) => {
      setError(userMsg);
      console.error('🚨 Camera initialization failed:', techMsg);
    })) {
      return;
    }

    try {
      console.log('Creating Camera instance...');
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (faceMeshRef.current && handsRef.current && videoRef.current) {
            try {
              await faceMeshRef.current.send({ image: videoRef.current });
              await handsRef.current.send({ image: videoRef.current });
            } catch (err) {
              console.error('Error processing frame:', err);
            }
          }
        },
        width: 640,
        height: 480
      });

      console.log('Starting camera...');
      await camera.start();
      cameraRef.current = camera;
      console.log('Camera initialized successfully');

    } catch (err) {
      console.error('카메라 초기화 오류:', err);
      setError('카메라에 접근할 수 없습니다.');
    }
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

    // 캔버스 그리기 좌표계 보정: 비디오는 거울이지만 캔버스는 정상 → X만 뒤집어서 그린다
    const canvasX = (x: number) => {
      const w = canvas.width;
      return w - x; // 거울 보정
    };

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
          console.log(`Crown point calculated: x=${crown.x.toFixed(1)}, y=${crown.y.toFixed(1)}`);
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
      
      console.log(`Fixed point ${realIndex} (${point.name}): x=${x.toFixed(1)}, y=${y.toFixed(1)}, canvas: ${canvas.width}x${canvas.height}`);
    });
    
    // 2. 얼굴 기반 포인트들 (얼굴이 감지된 경우만) - Face Mesh 결과 사용
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const faceLandmarks = results.multiFaceLandmarks[0]; // 첫 번째 얼굴만 사용

      console.log('Face mesh detected! Adding face points...', faceLandmarks.length, 'landmarks');
      
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
          
          console.log(`Face point ${index} (${mapping.name}): landmark=${mapping.landmarkIndex}, x=${x.toFixed(1)}, y=${y.toFixed(1)}`);
        } else {
          console.warn(`Landmark ${mapping.landmarkIndex} not found for ${mapping.name}`);
        }
      });
    } else {
      console.log('No face mesh detected, showing fixed points only');
    }
    
    console.log(`Total points to draw: ${points.length}, canvas size: ${canvas.width}x${canvas.height}, session: ${sessionStarted}`);

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
    console.log(`Drawing LARGE point: ${point.name} at (${point.x.toFixed(1)}, ${point.y.toFixed(1)}), active: ${isCurrentTarget}`);
    
    ctx.save();

    // 배경 원 (적절한 크기로)
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(canvasX(point.x), point.y, radius + 5, 0, 2 * Math.PI); // 10→5로 축소
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();
    
    // 메인 원 (적절한 크기로)
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(canvasX(point.x), point.y, radius, 0, 2 * Math.PI);
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
      ctx.arc(canvasX(point.x), point.y, pulseRadius, 0, 2 * Math.PI);
      ctx.strokeStyle = '#ff0000'; // 빨간색으로 강조
      ctx.lineWidth = 4; // 8→4로 축소
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      
      // 두 번째 펄싱 링
      const pulse2 = radius + Math.sin(Date.now() / 100) * 18; // 35→18로 축소
      ctx.beginPath();
      ctx.arc(canvasX(point.x), point.y, pulse2, 0, 2 * Math.PI);
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 2; // 4→2로 축소
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      
      console.log(`ACTIVE POINT PULSING: ${point.name}`);
    }

    // 적절한 크기의 라벨
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#ffff00'; // 노란색 텍스트
    ctx.strokeStyle = '#000000'; // 검은색 외곽선
    ctx.lineWidth = 3; // 6→3으로 축소
    ctx.font = 'bold 16px Arial'; // 28px→16px로 축소
    ctx.textAlign = 'center';
    
    const labelY = point.y - radius - 15; // 25→15로 축소
    ctx.strokeText(point.name, canvasX(point.x), labelY);
    ctx.fillText(point.name, canvasX(point.x), labelY);
    
    ctx.restore();
  };

  // 손 위치 표시
  const drawHandIndicator = (ctx: CanvasRenderingContext2D, position: { x: number; y: number }) => {
    const canvasX = (x: number) => {
      const w = canvasRef.current?.width ?? 640;
      return w - x;
    };
    ctx.beginPath();
    ctx.arc(canvasX(position.x), position.y, 10, 0, 2 * Math.PI);
    ctx.fillStyle = '#00b894';
    ctx.fill();
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
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
  const toggleSession = useCallback(() => {
    if (togglingRef.current) return;
    togglingRef.current = true;

    console.log('🔄 toggleSession called, sessionStarted:', sessionStarted);
    console.log('🔄 Button click detected!');

    try {
      if (sessionStarted) {
        console.log('🛑 Stopping AR session...');
        setSessionStarted(false);
        setCurrentPointIndex(0);
        setCompletedPoints(
          new Array(EFT_FACE_MAPPINGS.length + ADDITIONAL_POINTS.length).fill(false)
        );
        return;
      }

      const refsToCheck = [
        { name: 'Camera', ref: cameraRef },
        { name: 'Face mesh', ref: faceMeshRef },
        { name: 'Hands', ref: handsRef },
      ];

      if (!validateAndAssertRefs(refsToCheck, (userMsg, techMsg) => {
        setError(userMsg);
        console.error('🚨 AR session initialization failed:', techMsg);
        // 에러 상황에서도 사용자가 알 수 있도록 alert 추가
        alert(`AR 세션 시작 실패: ${userMsg}`);
      })) {
        return;
      }

      console.log('✅ All refs validated, starting session...');
      setSessionStarted(true);
      setCurrentPointIndex(0);
      setCompletedPoints(new Array(TOTAL_POINTS).fill(false));
    } finally {
      // 200ms 이후 다시 클릭 허용 (연타 방지)
      setTimeout(() => {
        togglingRef.current = false;
      }, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStarted]);

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

  useEffect(() => {
    if (!isLoading && !error && isActive) {
      initializeCamera();
    }

    return () => {
      console.log('Cleaning up camera...');
      cameraRef.current?.stop();
      cameraRef.current = null;
    };
  }, [isLoading, error, isActive, initializeCamera]);

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
        
        // 동영상이 로드되면 캔버스 크기 조정
        if (video.videoWidth && video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
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

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex items-center justify-center">
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
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* 비디오 스트림 */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
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

      {/* 상단 안내 카드: 세션 중에만 잠깐 표시 */}
      {sessionStarted && showHint && (
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