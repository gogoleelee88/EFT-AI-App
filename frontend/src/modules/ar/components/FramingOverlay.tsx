import { useEffect, useRef } from 'react';

interface FramingOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isAligned: boolean;
  onAlignmentChange: (aligned: boolean) => void;
}

export default function FramingOverlay({ videoRef, isAligned, onAlignmentChange }: FramingOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const checkAlignment = () => {
      // 캔버스 크기를 비디오와 맞춤
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 프레이밍 가이드 박스 그리기
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const boxWidth = canvas.width * 0.6;
      const boxHeight = canvas.height * 0.8;
      
      // 메인 프레이밍 박스
      ctx.strokeStyle = isAligned ? '#10B981' : '#EF4444'; // green : red
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(
        centerX - boxWidth / 2,
        centerY - boxHeight / 2,
        boxWidth,
        boxHeight
      );
      
      // 머리 위치 가이드
      ctx.setLineDash([]);
      ctx.strokeStyle = isAligned ? '#10B981' : '#F59E0B'; // green : amber
      ctx.lineWidth = 2;
      
      // 머리 원형 가이드
      const headY = centerY - boxHeight / 2 + boxHeight * 0.15;
      const headRadius = boxWidth * 0.08;
      ctx.beginPath();
      ctx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      // 어깨 라인 가이드
      const shoulderY = headY + boxHeight * 0.25;
      const shoulderWidth = boxWidth * 0.4;
      ctx.beginPath();
      ctx.moveTo(centerX - shoulderWidth / 2, shoulderY);
      ctx.lineTo(centerX + shoulderWidth / 2, shoulderY);
      ctx.stroke();
      
      // 가이드 텍스트
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      
      const message = isAligned ? 
        '✓ 자세가 완벽합니다!' : 
        '초록 박스 안에 상반신을 맞춰주세요';
      
      // 텍스트 배경
      ctx.strokeText(message, centerX, centerY + boxHeight / 2 + 40);
      ctx.fillText(message, centerX, centerY + boxHeight / 2 + 40);
      
      // 가이드 라인들
      if (!isAligned) {
        // 거리 가이드
        ctx.font = '14px sans-serif';
        ctx.fillText('📏 팔 길이 정도 거리 유지', centerX, 50);
        ctx.fillText('💡 밝은 곳에서 촬영', centerX, 80);
        ctx.fillText('📱 화면을 안정적으로 고정', centerX, 110);
      }
    };

    // 정렬 상태 시뮬레이션 (실제로는 포즈 검출로 판단)
    const simulateAlignment = () => {
      // 간단한 시뮬레이션: 3초 후 정렬됨으로 가정
      const aligned = Date.now() % 6000 > 3000;
      onAlignmentChange(aligned);
    };

    const animationId = setInterval(() => {
      checkAlignment();
      simulateAlignment();
    }, 100);

    return () => clearInterval(animationId);
  }, [videoRef, isAligned, onAlignmentChange]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ transform: 'scaleX(-1)' }} // 거울 효과
    />
  );
}