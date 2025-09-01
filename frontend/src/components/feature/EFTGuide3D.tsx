/**
 * 3D EFT 탭핑 가이드 컴포넌트
 * Three.js와 React Three Fiber를 사용한 3D 아바타 시각화
 */

import React, { useRef, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Sphere, Box } from '@react-three/drei';
import * as THREE from 'three';

// EFT 탭핑 포인트 정의
const EFT_TAPPING_POINTS = [
  { id: 'crown', name: '정수리', position: [0, 2.2, 0], color: '#ff6b6b' },
  { id: 'eyebrow', name: '눈썹', position: [0.3, 1.8, 0.4], color: '#4ecdc4' },
  { id: 'side_eye', name: '눈가', position: [0.5, 1.7, 0.3], color: '#45b7d1' },
  { id: 'under_eye', name: '눈 밑', position: [0.3, 1.5, 0.4], color: '#f9ca24' },
  { id: 'under_nose', name: '코 밑', position: [0, 1.3, 0.5], color: '#f0932b' },
  { id: 'chin', name: '턱', position: [0, 1.0, 0.4], color: '#eb4d4b' },
  { id: 'collarbone', name: '쇄골', position: [0.4, 0.3, 0.3], color: '#6c5ce7' },
  { id: 'under_arm', name: '겨드랑이', position: [0.8, 0.0, 0], color: '#a29bfe' },
  { id: 'karate_chop', name: '손날', position: [0.6, -0.5, 0.8], color: '#fd79a8' }
] as const;

// 3D 아바타 몸체 (간소화된 형태)
const Avatar3D: React.FC<{ currentPoint: number; isAnimating: boolean }> = ({ 
  currentPoint, 
  isAnimating 
}) => {
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (meshRef.current && isAnimating) {
      // 호흡 애니메이션
      const breathScale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.02;
      meshRef.current.scale.setScalar(breathScale);
    }
  });

  return (
    <group ref={meshRef}>
      {/* 머리 */}
      <Sphere args={[0.4]} position={[0, 1.6, 0]}>
        <meshStandardMaterial color="#fdbcb4" />
      </Sphere>
      
      {/* 몸통 */}
      <Box args={[0.6, 1.2, 0.4]} position={[0, 0.2, 0]}>
        <meshStandardMaterial color="#74b9ff" />
      </Box>
      
      {/* 팔 */}
      <Box args={[0.2, 0.8, 0.2]} position={[0.6, 0.2, 0]}>
        <meshStandardMaterial color="#fdbcb4" />
      </Box>
      <Box args={[0.2, 0.8, 0.2]} position={[-0.6, 0.2, 0]}>
        <meshStandardMaterial color="#fdbcb4" />
      </Box>
      
      {/* 다리 */}
      <Box args={[0.2, 0.8, 0.2]} position={[0.2, -1.0, 0]}>
        <meshStandardMaterial color="#0984e3" />
      </Box>
      <Box args={[0.2, 0.8, 0.2]} position={[-0.2, -1.0, 0]}>
        <meshStandardMaterial color="#0984e3" />
      </Box>
    </group>
  );
};

// 탭핑 포인트 마커
const TappingPoint: React.FC<{
  point: typeof EFT_TAPPING_POINTS[0];
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  onPointClick: (index: number) => void;
}> = ({ point, index, isActive, isCompleted, onPointClick }) => {
  const markerRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (markerRef.current && isActive) {
      // 활성 포인트 펄싱 애니메이션
      const pulseScale = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.3;
      markerRef.current.scale.setScalar(pulseScale);
    }
  });

  const markerColor = isCompleted ? '#2d3436' : isActive ? '#00b894' : point.color;
  const markerSize = isActive ? 0.15 : 0.1;

  return (
    <group>
      <Sphere
        ref={markerRef}
        args={[markerSize]}
        position={point.position as [number, number, number]}
        onClick={() => onPointClick(index)}
      >
        <meshStandardMaterial 
          color={markerColor} 
          emissive={isActive ? '#00b894' : '#000000'}
          emissiveIntensity={isActive ? 0.3 : 0}
        />
      </Sphere>
      
      {/* 포인트 라벨 */}
      <Text
        position={[
          point.position[0] + 0.3,
          point.position[1] + 0.3,
          point.position[2]
        ] as [number, number, number]}
        fontSize={0.12}
        color={isActive ? '#00b894' : '#2d3436'}
        anchorX="left"
        anchorY="middle"
      >
        {point.name}
      </Text>
    </group>
  );
};

// 메인 3D EFT 가이드 컴포넌트
interface EFTGuide3DProps {
  isActive: boolean;
  onSessionComplete?: () => void;
  onPointProgress?: (pointIndex: number, isCompleted: boolean) => void;
}

export const EFTGuide3D: React.FC<EFTGuide3DProps> = ({
  isActive,
  onSessionComplete,
  onPointProgress
}) => {
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [completedPoints, setCompletedPoints] = useState<boolean[]>(
    new Array(EFT_TAPPING_POINTS.length).fill(false)
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  // 자동 진행 타이머
  useEffect(() => {
    if (!isAutoPlaying || !sessionStarted) return;

    const timer = setInterval(() => {
      setCurrentPointIndex(prev => {
        const nextIndex = prev + 1;
        if (nextIndex >= EFT_TAPPING_POINTS.length) {
          // 세션 완료
          setIsAutoPlaying(false);
          setSessionStarted(false);
          onSessionComplete?.();
          return 0;
        }
        return nextIndex;
      });
    }, 3000); // 각 포인트 3초씩

    return () => clearInterval(timer);
  }, [isAutoPlaying, sessionStarted, onSessionComplete]);

  // 포인트 클릭 핸들러
  const handlePointClick = (pointIndex: number) => {
    if (!sessionStarted) return;

    const newCompleted = [...completedPoints];
    newCompleted[pointIndex] = true;
    setCompletedPoints(newCompleted);
    
    onPointProgress?.(pointIndex, true);

    // 다음 포인트로 이동
    if (pointIndex === currentPointIndex) {
      setCurrentPointIndex(prev => 
        prev + 1 >= EFT_TAPPING_POINTS.length ? 0 : prev + 1
      );
    }
  };

  // 세션 시작/중지
  const toggleSession = () => {
    if (sessionStarted) {
      setSessionStarted(false);
      setIsAutoPlaying(false);
      setCurrentPointIndex(0);
      setCompletedPoints(new Array(EFT_TAPPING_POINTS.length).fill(false));
    } else {
      setSessionStarted(true);
      setIsAutoPlaying(true);
      setCurrentPointIndex(0);
    }
  };

  if (!isActive) return null;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* 컨트롤 패널 */}
      <div className="absolute top-4 left-4 z-10 space-y-2">
        <button
          onClick={toggleSession}
          className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
            sessionStarted
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white'
          }`}
        >
          {sessionStarted ? '세션 중지' : 'EFT 세션 시작'}
        </button>
        
        {sessionStarted && (
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-3">
            <p className="text-sm font-medium text-gray-800">
              현재 포인트: {EFT_TAPPING_POINTS[currentPointIndex]?.name}
            </p>
            <div className="mt-2 flex space-x-1">
              {EFT_TAPPING_POINTS.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    completedPoints[index]
                      ? 'bg-green-500'
                      : index === currentPointIndex
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3D 캔버스 */}
      <Canvas
        camera={{ position: [2, 1, 3], fov: 60 }}
        className="w-full h-full"
      >
        <Suspense fallback={null}>
          {/* 조명 */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <pointLight position={[-2, 2, 2]} intensity={0.4} />

          {/* 3D 아바타 */}
          <Avatar3D 
            currentPoint={currentPointIndex} 
            isAnimating={sessionStarted}
          />

          {/* 탭핑 포인트들 */}
          {EFT_TAPPING_POINTS.map((point, index) => (
            <TappingPoint
              key={point.id}
              point={point}
              index={index}
              isActive={index === currentPointIndex && sessionStarted}
              isCompleted={completedPoints[index]}
              onPointClick={handlePointClick}
            />
          ))}

          {/* 카메라 컨트롤 */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={1}
            maxDistance={8}
          />
        </Suspense>
      </Canvas>

      {/* 하단 안내 텍스트 */}
      {sessionStarted && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg p-4 text-center max-w-md">
            <h3 className="font-semibold text-gray-800 mb-2">
              {EFT_TAPPING_POINTS[currentPointIndex]?.name} 탭핑
            </h3>
            <p className="text-sm text-gray-600">
              해당 부위를 손가락으로 7-10회 가볍게 두드려주세요
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default EFTGuide3D;