import { useEffect, useRef, useState } from 'react';
import { useStepPlayer } from './StepPlayer';
import { mapEFTPoint } from '../eft-mapping';
import { drawMarker, drawLabel } from '../utils/draw';
import { AR } from '../ar-config';
import type { EFTSessionPlan } from '../types';

// getCameraStream 함수
async function getCameraStream(video: HTMLVideoElement, width: number = 640, height: number = 480) {
  const stream = await navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'user', width, height }, 
    audio: false 
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

// createPose 함수  
async function createPose() {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm"
  );
  const pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  return pose;
}

// pointXY = mapEFTPoint 함수 alias
const pointXY = mapEFTPoint;

interface ARSessionSimpleProps {
  plan: EFTSessionPlan;
}

export default function ARSessionSimple({ plan }: ARSessionSimpleProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const player = useStepPlayer(plan, true);

  useEffect(() => {
    let raf = 0, running = true, pose: any;
    (async () => {
      const v = videoRef.current!;
      await getCameraStream(v, 640, 480);
      pose = await createPose();
      setReady(true);

      const loop = async () => {
        if (!running) return;
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const nowMs = performance.now();
        const res = await pose.detectForVideo(v, nowMs);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const landmarks = res?.landmarks?.[0];
        if (landmarks && player.currentStep) {
          const p = pointXY({ landmarks }, player.currentStep.point, player.currentStep.side);
          if (p) {
            const x = p.x * canvas.width;
            const y = p.y * canvas.height;
            drawMarker(ctx, x, y, AR.markerRadius, (nowMs / 1000) % 1, AR.color);
            drawLabel(ctx, x, y, `${player.currentStep.point} (${player.timeLeft}s)`);
          }
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [plan, player.currentStep]);

  return (
    <div className="w-full grid gap-3">
      <div className="relative mx-auto">
        <video 
          ref={videoRef} 
          className="rounded-xl shadow" 
          muted 
          playsInline 
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>
      <div className="flex items-center justify-center gap-2">
        <button onClick={player.prevStep} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
          이전
        </button>
        <div>{player.stepIndex + 1}/{plan.steps.length}</div>
        <button onClick={player.nextStep} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
          다음
        </button>
      </div>
    </div>
  );
}