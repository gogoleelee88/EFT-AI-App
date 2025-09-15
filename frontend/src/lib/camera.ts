// iOS 자동재생/인라인 정책 준수 카메라 유틸리티
export async function startCamera(video: HTMLVideoElement, facing: 'user'|'environment'='user') {
  if (!video) throw new Error('Video element missing');
  if (video.srcObject) return video.srcObject as MediaStream;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing } }
  });
  
  video.srcObject = stream;
  video.muted = true;
  // @ts-ignore - iOS Safari playsInline 필수
  video.playsInline = true;
  
  try { 
    await video.play(); 
  } catch (e) {
    console.warn('Video play failed, retrying:', e);
  }

  // 영상 메타데이터 로드 대기 (0차원 방지)
  if (!video.videoWidth || !video.videoHeight) {
    await new Promise<void>(res =>
      video.addEventListener('loadedmetadata', () => res(), { once: true })
    );
  }
  
  console.log(`📷 Camera started: ${video.videoWidth}x${video.videoHeight}`);
  return stream;
}

export function stopCamera(video?: HTMLVideoElement) {
  const stream = (video?.srcObject as MediaStream | undefined);
  if (stream) {
    stream.getTracks().forEach(track => {
      console.log(`🛑 Stopping track: ${track.kind}`);
      track.stop();
    });
  }
  if (video) video.srcObject = null;
}

// DPR 기반 캔버스 크기 동기화
export function syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(video.videoWidth * dpr);
  canvas.height = Math.floor(video.videoHeight * dpr);
  
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  console.log(`🎨 Canvas synced: ${canvas.width}x${canvas.height} (DPR: ${dpr})`);
  return ctx;
}