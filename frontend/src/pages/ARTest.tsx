import { useEffect, useRef, useState } from "react";

export default function ARTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const syncCanvasSize = () => {
    const v = videoRef.current!;
    const c = canvasRef.current!;
    if (!v || !c) return;
    if (v.videoWidth && v.videoHeight) {
      if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
      }
    }
  };

  const drawOverlay = () => {
    const c = canvasRef.current!;
    const v = videoRef.current!;
    const ctx = c.getContext("2d")!;
    if (!v.videoWidth || !v.videoHeight) return;

    syncCanvasSize();

    // 단순 스모크: 반투명 박스 + 텍스트
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(20, 20, 180, 90);
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.fillText("Overlay OK", 32, 72);
  };

  const loop = () => {
    drawOverlay();
    rafRef.current = requestAnimationFrame(loop);
  };

  const startCamera = async () => {
    try {
      setError(null);
      setIsLoading(true);

      console.log("🎥 카메라 권한 요청...");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        // AR 성능 확인은 낮은 해상도부터
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false
      });

      console.log("✅ 카메라 스트림 획득");
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);

        // iOS/Safari 대응: metadata 로드 후 play
        const onLoaded = async () => {
          try {
            await videoRef.current?.play();
          } catch (e) {
            console.warn("video.play() failed, will retry on user gesture", e);
          } finally {
            setIsLoading(false);
            syncCanvasSize();
            cancelAnimationFrame(rafRef.current!);
            loop(); // 렌더 루프 시작
          }
        };

        if (videoRef.current.readyState >= 2) {
          await videoRef.current.play();
          setIsLoading(false);
          syncCanvasSize();
          cancelAnimationFrame(rafRef.current!);
          loop();
        } else {
          videoRef.current.addEventListener("loadedmetadata", onLoaded, { once: true });
        }
      }
    } catch (err) {
      console.error("❌ 카메라 오류:", err);
      setError(err instanceof Error ? err.message : "카메라 접근 실패");
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6">AR 카메라 테스트</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-300 rounded-md">
            <p className="text-red-700">오류: {error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>카메라를 초기화하는 중...</p>
            </div>
          ) : stream ? (
            <div className="relative w-full max-w-2xl mx-auto">
              <video
                ref={videoRef}
                className="w-full h-auto rounded-lg"
                autoPlay
                muted
                playsInline
                style={{ transform: "scaleX(-1)" }} // 미러링(셀피)
              />
              {/* 오버레이 캔버스 */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0"
                style={{ zIndex: 10, pointerEvents: "none" }}
              />
              <div className="mt-4 flex gap-3 justify-center">
                <button
                  onClick={stopCamera}
                  className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  카메라 중지
                </button>
                <button
                  onClick={startCamera}
                  className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  카메라 재시작
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <button
                onClick={startCamera}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                카메라 시작
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">문제 해결 체크리스트:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• F12 → Console에서 오류 메시지 확인</li>
            <li>• HTTPS 환경(모바일 PWA는 필수)</li>
            <li>• 캔버스가 <code>absolute</code>, <code>z-index:10+</code>, <code>pointer-events:none</code>인지</li>
            <li>• <code>video.videoWidth/Height</code>로 캔버스 크기 동기화</li>
            <li>• 과도한 해상도면 640×480부터 테스트</li>
          </ul>
        </div>
      </div>
    </div>
  );
}