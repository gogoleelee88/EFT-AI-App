import { AR } from '../ar-config';

export function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number = AR.markerRadius,
  pulseTime: number = 0,
  color: string = AR.color
): void {
  ctx.save();
  
  // 펄스 효과
  const pulseScale = 1 + 0.3 * Math.sin(pulseTime * 2 * Math.PI);
  
  // 외부 펄스 링
  ctx.beginPath();
  ctx.arc(x, y, radius * pulseScale, 0, Math.PI * 2);
  ctx.strokeStyle = color + '55'; // 투명도 추가
  ctx.lineWidth = 3;
  ctx.stroke();
  
  // 메인 마커
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  
  // 내부 하이라이트
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.8;
  ctx.fill();
  
  ctx.restore();
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fontSize: number = AR.fontSize,
  color: string = AR.textColor
): void {
  ctx.save();
  
  ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // 텍스트 배경
  const textWidth = ctx.measureText(text).width;
  const padding = 8;
  const bgHeight = fontSize + padding;
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(
    x - textWidth / 2 - padding / 2,
    y - fontSize - 24 - bgHeight / 2,
    textWidth + padding,
    bgHeight
  );
  
  // 텍스트
  ctx.fillStyle = color;
  ctx.fillText(text, x, y - fontSize - 24);
  
  ctx.restore();
}

export function drawCountdown(
  ctx: CanvasRenderingContext2D,
  count: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  if (count <= 0) return;
  
  ctx.save();
  
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  
  // 배경 원
  ctx.beginPath();
  ctx.arc(centerX, centerY, 80, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fill();
  
  // 카운트다운 숫자
  ctx.font = 'bold 48px ui-sans-serif, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = AR.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count.toString(), centerX, centerY);
  
  ctx.restore();
}

export function drawTip(
  ctx: CanvasRenderingContext2D,
  tip: string,
  canvasWidth: number,
  y: number = 60
): void {
  if (!tip) return;
  
  ctx.save();
  
  const centerX = canvasWidth / 2;
  
  ctx.font = '16px ui-sans-serif, system-ui, -apple-system, sans-serif';
  ctx.fillStyle = AR.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // 배경
  const textWidth = ctx.measureText(tip).width;
  const padding = 12;
  const bgHeight = 32;
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(
    centerX - textWidth / 2 - padding / 2,
    y - padding / 2,
    textWidth + padding,
    bgHeight
  );
  
  // 텍스트
  ctx.fillStyle = AR.textColor;
  ctx.fillText(tip, centerX, y + 4);
  
  ctx.restore();
}