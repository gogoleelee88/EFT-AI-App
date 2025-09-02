import { useEffect, useRef } from 'react';
import { drawMarker, drawLabel, drawTip } from '../utils/draw';
import type { XY } from '../types';

interface OverlayCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  eftPoint: XY | null;
  label: string;
  tip?: string;
  pulseTime: number;
}

export default function OverlayCanvas({ 
  videoRef, 
  eftPoint, 
  label, 
  tip, 
  pulseTime 
}: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // 캔버스 크기를 비디오에 맞춤
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // 캔버스 지우기
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // EFT 포인트가 있으면 마커 그리기
      if (eftPoint) {
        const x = eftPoint.x * canvas.width;
        const y = eftPoint.y * canvas.height;

        // 마커 그리기
        drawMarker(ctx, x, y, undefined, pulseTime);
        
        // 라벨 그리기
        if (label) {
          drawLabel(ctx, x, y, label);
        }
      }

      // 팁 표시
      if (tip) {
        drawTip(ctx, tip, canvas.width);
      }
    };

    // 애니메이션 프레임마다 렌더링
    const animationId = requestAnimationFrame(render);
    
    return () => cancelAnimationFrame(animationId);
  }, [videoRef, eftPoint, label, tip, pulseTime]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ transform: 'scaleX(-1)' }} // 거울 효과
    />
  );
}