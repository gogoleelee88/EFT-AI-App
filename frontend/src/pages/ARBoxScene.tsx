import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import ResponsiveContainer from '@/components/layout/ResponsiveContainer';

export interface ARBoxSceneProps {}

const useThemeColor = (token: string, fallback: string) => {
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    const root = document.documentElement;
    const value = getComputedStyle(root).getPropertyValue(token).trim();
    if (value) {
      setColor(`oklch(${value})`);
    }
  }, [token]);

  return color;
};

const Ground: React.FC = () => {
  const muted = useThemeColor('--muted', 'oklch(0.93 0.015 280)');

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color={muted} />
    </mesh>
  );
};

const SquarePath: React.FC = () => {
  const accent = useThemeColor('--accent', 'oklch(0.65 0.12 175)');
  const points = useMemo(
    () => [
      [-1, 0, 1],
      [1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
      [-1, 0, 1],
    ],
    []
  );

  return <Line points={points} color={accent} lineWidth={3} />;
};

const MOVE_DURATION = 4;
const PAUSE_DURATION = 4;
const STAR_THRESHOLDS = [0.25, 0.5, 0.75] as const;

type Phase = 'move' | 'pause';

interface StarHit {
  segment: number;
  starIndex: number;
}

interface AnimatedCharacterProps {
  path: [number, number, number][];
  onStarHit: (hit: StarHit) => void;
  onGoal: (duration: number) => void;
  onSegmentChange: (idx: number) => void;
  onPauseProgress: (progress: number) => void;
  isRunning: boolean;
}

const playChime = () => {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 660;
  gain.gain.value = 0.06;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 5;
  lfoGain.gain.value = 20;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.connect(gain).connect(ctx.destination);
  lfo.start();
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
  osc.stop(ctx.currentTime + 0.35);
  lfo.stop(ctx.currentTime + 0.35);
};

const AnimatedCharacter: React.FC<AnimatedCharacterProps> = ({
  path,
  onStarHit,
  onGoal,
  onSegmentChange,
  onPauseProgress,
  isRunning,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const headMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const segmentIndexRef = useRef(0);
  const phaseRef = useRef<Phase>('move');
  const segmentTimeRef = useRef(0);
  const collectedRef = useRef<[boolean, boolean, boolean]>([false, false, false]);

  const headColor = useThemeColor('--accent', 'oklch(0.65 0.12 175)');
  const bodyColor = useThemeColor('--primary', 'oklch(0.55 0.15 280)');

  useFrame((_, delta) => {
    if (!isRunning || !groupRef.current) return;

    const segmentIndex = segmentIndexRef.current;
    const segmentTime = segmentTimeRef.current;
    const isMoving = phaseRef.current === 'move';

    const start = path[segmentIndex];
    const end = path[(segmentIndex + 1) % path.length];

    const position = new THREE.Vector3();
    if (isMoving) {
      const moveT = segmentTime / MOVE_DURATION;
      position.set(start[0] + (end[0] - start[0]) * moveT, 0, start[2] + (end[2] - start[2]) * moveT);
      const beatPhase = segmentTime % 1;
      const bob = Math.sin(beatPhase * Math.PI) * 0.12;
      position.y = 0.25 + bob;

      STAR_THRESHOLDS.forEach((threshold, idx) => {
        if (!collectedRef.current[idx] && moveT >= threshold) {
          collectedRef.current[idx] = true;
          onStarHit({ segment: segmentIndex, starIndex: idx });
          playChime();
        }
      });

      segmentTimeRef.current += delta;
      if (segmentTimeRef.current >= MOVE_DURATION) {
        const duration = segmentTimeRef.current;
        onGoal(duration);
        phaseRef.current = 'pause';
        segmentTimeRef.current = 0;
        onPauseProgress(1);
        if (bodyMaterialRef.current) bodyMaterialRef.current.emissiveIntensity = 0.2;
        if (headMaterialRef.current) headMaterialRef.current.emissiveIntensity = 0.25;
      }
    } else {
      position.set(end[0], 0.25, end[2]);
      const pausePhase = segmentTime;
      const pulse = 1 + 0.05 * Math.sin(pausePhase * Math.PI * 2);
      groupRef.current.scale.setScalar(pulse);
      if (bodyMaterialRef.current) {
        bodyMaterialRef.current.emissiveIntensity = 0.2 + 0.15 * Math.sin(pausePhase * Math.PI * 2);
      }
      if (headMaterialRef.current) {
        headMaterialRef.current.emissiveIntensity = 0.3 + 0.2 * Math.sin(pausePhase * Math.PI * 2);
      }

      segmentTimeRef.current += delta;
      const pauseProgress = Math.max(0, 1 - segmentTimeRef.current / PAUSE_DURATION);
      onPauseProgress(pauseProgress);

      if (segmentTimeRef.current >= PAUSE_DURATION) {
        segmentIndexRef.current = (segmentIndexRef.current + 1) % path.length;
        onSegmentChange(segmentIndexRef.current);
        collectedRef.current = [false, false, false];
        phaseRef.current = 'move';
        segmentTimeRef.current = 0;
        groupRef.current.scale.setScalar(1);
        if (bodyMaterialRef.current) bodyMaterialRef.current.emissiveIntensity = 0;
        if (headMaterialRef.current) headMaterialRef.current.emissiveIntensity = 0.1;
      }
    }

    groupRef.current.position.copy(position);
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.4, 0.5, 0.4]} />
        <meshStandardMaterial ref={bodyMaterialRef} color={bodyColor} emissive={bodyColor} emissiveIntensity={0} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.28, 0.25, 0.28]} />
        <meshStandardMaterial ref={headMaterialRef} color={headColor} emissive={headColor} emissiveIntensity={0.1} />
      </mesh>
      <Html center distanceFactor={10}>
        <div className="rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur">
          calm
        </div>
      </Html>
    </group>
  );
};

const ARBoxScene: React.FC<ARBoxSceneProps> = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [pauseProgress, setPauseProgress] = useState(1);
  const [segmentIdx, setSegmentIdx] = useState(0);
  const [starsState, setStarsState] = useState<Record<number, [boolean, boolean, boolean]>>({
    0: [false, false, false],
    1: [false, false, false],
    2: [false, false, false],
    3: [false, false, false],
  });
  const [coaching, setCoaching] = useState<string | null>(null);

  const path = useMemo<[number, number, number][]>(
    () => [
      [-1, 0, 1],
      [1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
    ],
    []
  );

  const handleStarHit = (hit: StarHit) => {
    setStarsState((prev) => {
      const next = { ...prev };
      const updated = [...next[hit.segment]] as [boolean, boolean, boolean];
      updated[hit.starIndex] = true;
      next[hit.segment] = updated;
      return next;
    });
  };

  const handleGoal = (duration: number) => {
    if (duration >= 3.5 && duration <= 4.5) {
      setCoaching('편안한 리듬이에요');
    } else if (duration < 3.5) {
      setCoaching('조금 더 천천히... 호흡을 깊게 느껴보세요.');
    } else {
      setCoaching('호흡이 너무 길어지지 않게 리듬을 타보세요.');
    }
  };

  const handleSegmentChange = (idx: number) => {
    setSegmentIdx(idx);
    setStarsState((prev) => {
      const next = { ...prev };
      next[idx] = [false, false, false];
      return next;
    });
    setCoaching(null);
  };

  const renderMarkers = () => {
    return path.map((start, idx) => {
      const end = path[(idx + 1) % path.length];
      const segmentVec = new THREE.Vector3(end[0] - start[0], 0, end[2] - start[2]);
      return (
        <group key={`segment-${idx}`}>
          {STAR_THRESHOLDS.map((t, starIdx) => {
            const pos = new THREE.Vector3(start[0], 0.1, start[2]).add(segmentVec.clone().multiplyScalar(t));
            const collected = starsState[idx]?.[starIdx];
            return (
              <mesh key={`star-${idx}-${starIdx}`} position={[pos.x, pos.y, pos.z]}>
                <sphereGeometry args={[0.08, 12, 12]} />
                <meshStandardMaterial
                  color={collected ? 'oklch(0.9 0.02 280)' : 'oklch(0.65 0.12 175)'}
                  emissive={collected ? 'oklch(0.9 0.02 280)' : 'oklch(0.65 0.12 175)'}
                  emissiveIntensity={collected ? 0.2 : 0.5}
                  opacity={collected ? 0.35 : 1}
                  transparent
                />
              </mesh>
            );
          })}
          <mesh position={[end[0], 0.15, end[2]]}>
            <boxGeometry args={[0.18, 0.3, 0.18]} />
            <meshStandardMaterial
              color="oklch(0.55 0.15 280)"
              emissive="oklch(0.55 0.15 280)"
              emissiveIntensity={0.15}
            />
          </mesh>
        </group>
      );
    });
  };

  return (
    <ResponsiveContainer>
      <div className="flex min-h-screen flex-col bg-background text-foreground lg:min-h-0">
        <div className="flex flex-col gap-3 px-6 py-6 lg:px-8 lg:py-8">
          <div>
            <p className="text-sm font-medium text-foreground/70">Calm & Dreamy</p>
            <h1 className="text-3xl font-bold tracking-tight text-primary">AR Box Breathing Guide</h1>
            <p className="mt-1 text-base text-foreground/70">
              빛의 조각을 따라 이동하며 호흡 리듬을 몸에 익히는 부드러운 명상 도구입니다.
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/80 shadow-sm">
            <div
              className="relative aspect-video"
              role="button"
              tabIndex={0}
              onClick={() => setIsRunning((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsRunning((prev) => !prev);
                }
              }}
            >
              <Canvas camera={{ position: [4, 4, 6], fov: 50 }}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[5, 8, 5]} intensity={0.9} />
                <Ground />
                <SquarePath />
                {renderMarkers()}
                <AnimatedCharacter
                  path={path}
                  onStarHit={handleStarHit}
                  onGoal={handleGoal}
                  onSegmentChange={handleSegmentChange}
                  onPauseProgress={setPauseProgress}
                  isRunning={isRunning}
                />
                <OrbitControls />
              </Canvas>
              <div className="pointer-events-none absolute inset-0 flex items-start justify-between px-4 py-3">
                <div className="rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur">
                  {isRunning ? '탭으로 잠시 멈추기' : '탭하여 시작'}
                </div>
                {coaching && (
                  <div className="rounded-full bg-accent/80 px-3 py-1 text-xs font-semibold text-accent-foreground shadow-sm backdrop-blur">
                    {coaching}
                  </div>
                )}
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                <div className="flex w-44 flex-col items-center gap-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-2 rounded-full bg-accent transition-[width]"
                      style={{ width: `${pauseProgress * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveContainer>
  );
};

export default ARBoxScene;
export { ARBoxScene };

