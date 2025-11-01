/**
 * Tri-Modal Meditation Component
 * Camera + Microphone + Coaching System
 *
 * Privacy-first meditation coaching with:
 * - FaceMesh for facial signals
 * - Audio analysis for breathing rate
 * - rPPG for heart rate (optional, confidence-gated)
 * - RED/YELLOW/GREEN coaching policy
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { requestMediaOnce, stopMediaStream } from "../../services/meditation/mediaAccess";
import { initFaceLandmarker, analyzeFace, cleanupFaceLandmarker } from "../../signals/face";
import { calculateRppgConfidence } from "../../signals/rppg";
import { decideCoach } from "../../policy/coach";
import { saveSession, type SessionSummary } from "../../services/meditation/sessionStore";
import HUD from "./HUD";
import TopStats from "./TopStats";
import BreathPacer from "./BreathPacer";
import type { FaceSignals } from "../../signals/face";
import type { CoachDecision } from "../../policy/coach";

interface TriModalMeditationProps {
  onComplete?: (summary: SessionSummary) => void;
  targetDuration?: number; // in seconds, 0 = infinite
  showMetrics?: boolean;
}

export const TriModalMeditation: React.FC<TriModalMeditationProps> = ({
  onComplete,
  targetDuration = 0,
  showMetrics = true,
}) => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const loopOn = useRef(false);

  // FPS tracking
  const fpsFrames = useRef(0);
  const fpsLastLog = useRef(0);

  // Frame counter for coaching decision (2프레임에 1회만 계산)
  const frameCounter = useRef(0);

  // State
  const [hasStarted, setHasStarted] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(0);

  // Signals
  const [faceSignals, setFaceSignals] = useState<FaceSignals | null>(null);
  const [breathRate, setBreathRate] = useState<number | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [rppgConfidence, setRppgConfidence] = useState(0);

  // Coaching
  const [coaching, setCoaching] = useState<CoachDecision | null>(null);

  // Session data accumulation
  const tensionHistory = useRef<number[]>([]);
  const breathHistory = useRef<number[]>([]);
  const coachingEvents = useRef<SessionSummary["coachingEvents"]>([]);

  /**
   * Initialize meditation session
   */
  const initSession = useCallback(async () => {
    try {
      setHasStarted(true);
      setIsLoading(true);
      setError(null);

      // Request camera and microphone
      const stream = await requestMediaOnce();

      // Attach to video element
      console.log('🔍 videoRef.current:', videoRef.current);

      if (videoRef.current) {
        try {
          videoRef.current.srcObject = stream;
          console.log('📹 Video srcObject set:', stream);

          await videoRef.current.play();

          console.log('▶️ Video playing successfully!', {
            videoWidth: videoRef.current.videoWidth,
            videoHeight: videoRef.current.videoHeight,
            readyState: videoRef.current.readyState,
            paused: videoRef.current.paused,
            src: videoRef.current.src || 'stream'
          });
        } catch (playError) {
          console.error('❌ Video play failed:', playError);
          throw playError;
        }
      } else {
        console.error('❌ videoRef.current is null!');
        throw new Error('Video element not found');
      }

      // Initialize MediaPipe FaceLandmarker
      await initFaceLandmarker();

      // Initialize audio context for breathing analysis
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const analyzer = audioContextRef.current.createAnalyser();
      analyzer.fftSize = 2048;
      source.connect(analyzer);

      // Start session
      setSessionStartTime(Date.now());
      setIsActive(true);
      setIsLoading(false);

      console.log("✅ Meditation session started");
    } catch (err: any) {
      console.error("❌ Session initialization failed:", err);
      setError(err.message || "세션을 시작할 수 없습니다.");
      setIsLoading(false);
    }
  }, []);

  /**
   * Stop meditation session
   */
  const stopSession = useCallback(() => {
    // Stop animation loop
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Stop media
    stopMediaStream();

    // Cleanup MediaPipe
    cleanupFaceLandmarker();

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    // Calculate session summary
    const endTime = Date.now();
    const durationSec = Math.floor((endTime - sessionStartTime) / 1000);

    const avgTension =
      tensionHistory.current.length > 0
        ? tensionHistory.current.reduce((a, b) => a + b, 0) / tensionHistory.current.length
        : 0;

    const avgBreathRate =
      breathHistory.current.length > 0
        ? breathHistory.current.reduce((a, b) => a + b, 0) / breathHistory.current.length
        : 12;

    // Simple quality score (0-100)
    const qualityScore = Math.round(
      Math.max(0, 100 - avgTension * 50 - Math.abs(avgBreathRate - 8) * 5)
    );

    const summary: SessionSummary = {
      id: `session_${sessionStartTime}`,
      startTime: sessionStartTime,
      endTime,
      durationSec,
      qualityScore,
      avgTension,
      avgBreathRate,
      avgHeartRate: heartRate || undefined,
      coachingEvents: coachingEvents.current,
    };

    // Save session
    saveSession(summary);

    // Callback
    if (onComplete) {
      onComplete(summary);
    }

    setIsActive(false);
    console.log("✅ Meditation session ended", summary);
  }, [sessionStartTime, heartRate, onComplete]);

  /**
   * Main animation loop - ALWAYS RUNNING
   */
  const tick = useCallback(() => {
    if (!loopOn.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      animationFrameRef.current = requestAnimationFrame(tick);
      return;
    }

    // FPS tracking
    fpsFrames.current++;
    const now = performance.now();
    if (now - fpsLastLog.current > 1000) {
      console.log(`🎞️ tick fps≈${fpsFrames.current}`);
      fpsFrames.current = 0;
      fpsLastLog.current = now;
    }

    // Draw video to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Analyze face
    const timestamp = performance.now();
    const face = analyzeFace(video, timestamp);

    if (face) {
      setFaceSignals(face);

      // Accumulate tension
      tensionHistory.current.push(face.tension);
      if (tensionHistory.current.length > 300) {
        tensionHistory.current.shift();
      }

      // Calculate rPPG confidence
      const confidence = calculateRppgConfidence(null, face.quality);
      setRppgConfidence(confidence);

      // Decide coaching - 2프레임에 1회만 계산 (성능 최적화)
      frameCounter.current++;
      if (frameCounter.current % 2 === 0) {
        const decision = decideCoach(face, breathRate, confidence);
        setCoaching(decision);

        // Debug: Log signals every 5 seconds
        if (Math.floor(timestamp / 5000) !== Math.floor((timestamp - 16) / 5000)) {
          console.log('🧘 Meditation Signals:', {
            tension: Math.round(face.tension * 100) + '%',
            eyeOpen: Math.round(face.eyeOpen * 100) + '%',
            blinkRate: Math.round(face.blinkRate) + '/min',
            breathRate: breathRate ? Math.round(breathRate) + '/min' : 'N/A',
            quality: Math.round(face.quality * 100) + '%',
            coaching: decision.level + ': ' + decision.actions.join(', '),
            cooldown: Math.round(decision.cooldownSec) + 's'
          });
        }

        // Record coaching events
        if (decision.level !== "GREEN" && decision.actions.length > 0) {
          coachingEvents.current.push({
            level: decision.level,
            timestamp: Date.now(),
            actions: decision.actions,
          });
        }
      }
    } else {
      setFaceSignals(null);
    }

    // Update session duration
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    setSessionDuration(elapsed);

    // Auto-complete if target duration reached
    if (targetDuration > 0 && elapsed >= targetDuration) {
      stopSession();
      return;
    }

    // Next frame - ALWAYS!
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [sessionStartTime, breathRate, targetDuration, stopSession]);

  /**
   * Analyze audio for breathing rate
   */
  useEffect(() => {
    if (!audioContextRef.current || !isActive) return;

    const analyzer = audioContextRef.current.createAnalyser();
    analyzer.fftSize = 2048;

    const dataArray = new Uint8Array(analyzer.fftSize);
    let breathPeaks: number[] = [];
    let lastPeakTime = 0;

    const analyzeAudio = () => {
      if (!isActive) return;

      analyzer.getByteTimeDomainData(dataArray);

      // Calculate RMS (root mean square) for volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Detect breath peaks (simple threshold)
      const now = Date.now();
      if (rms > 0.05 && now - lastPeakTime > 2000) {
        breathPeaks.push(now);
        lastPeakTime = now;

        // Keep last 10 peaks
        if (breathPeaks.length > 10) {
          breathPeaks.shift();
        }

        // Calculate breath rate
        if (breathPeaks.length >= 3) {
          const intervals = [];
          for (let i = 1; i < breathPeaks.length; i++) {
            intervals.push(breathPeaks[i] - breathPeaks[i - 1]);
          }
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const rate = 60000 / avgInterval; // Convert to breaths per minute

          setBreathRate(rate);
          breathHistory.current.push(rate);

          if (breathHistory.current.length > 60) {
            breathHistory.current.shift();
          }
        }
      }

      setTimeout(analyzeAudio, 100); // Check every 100ms
    };

    analyzeAudio();
  }, [isActive]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (isActive) {
        stopSession();
      }
    };
  }, [isActive, stopSession]);

  /**
   * Start animation loop when active - ALWAYS RUNNING
   */
  useEffect(() => {
    if (isActive) {
      loopOn.current = true;
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    }

    return () => {
      loopOn.current = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isActive, tick]);

  /**
   * Render
   */
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Video feed - 항상 DOM에 존재 (videoRef를 위해) */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover z-0"
        playsInline
        muted
        autoPlay
      />

      {/* Canvas for drawing (optional, can be hidden) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Start screen - 시작 전 화면 */}
      {!hasStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 z-50">
          <div className="text-white text-center max-w-md px-6">
            <div className="text-6xl mb-6 animate-bounce">🧘‍♀️</div>
            <h1 className="text-3xl font-bold mb-4">명상 세션</h1>
            <p className="text-lg text-gray-200 mb-8">
              카메라와 마이크를 통해<br />
              실시간 명상 가이드를 제공합니다
            </p>
            <button
              onClick={initSession}
              className="px-8 py-4 bg-white text-purple-900 rounded-full font-bold text-lg hover:bg-gray-100 transition-all transform hover:scale-105 shadow-lg"
            >
              ✨ 시작하기
            </button>
            <div className="mt-6 text-sm text-gray-300">
              💡 조용한 공간에서 편안한 자세로 준비해주세요
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900 z-40">
          <div className="text-white text-center">
            <div className="text-4xl mb-4 animate-pulse">🧘</div>
            <div className="text-xl">명상 세션 준비 중...</div>
            <div className="text-sm text-gray-300 mt-2">카메라와 마이크 접근을 허용해주세요</div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-red-900 to-pink-900 z-40">
          <div className="text-white text-center max-w-md p-6">
            <div className="text-4xl mb-4">⚠️</div>
            <div className="text-xl font-bold mb-2">오류 발생</div>
            <div className="text-sm text-gray-200">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-3 bg-white text-red-900 rounded-full font-bold hover:bg-gray-200 transition"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* TopStats & HUD Overlay (활성화 시에만) */}
      {!isLoading && !error && isActive && (
        <>
          {/* 상단 정보띠 (z-30) */}
          <TopStats
            elapsedSec={sessionDuration}
            breathsPerMin={breathRate}
            faceSignals={faceSignals}
            onEnd={stopSession}
          />

          {/* 하단 코칭 메시지 (z-40) - ALWAYS VISIBLE */}
          <HUD
            coaching={coaching}
            faceSignals={faceSignals}
            breathRate={breathRate}
            heartRate={heartRate}
            rppgConfidence={rppgConfidence}
            sessionDuration={sessionDuration}
            showMetrics={showMetrics}
          />
        </>
      )}

      {/* 호흡 메트로놈 (z-30) - 우하단 - 독립 렌더링 */}
      {isActive && <BreathPacer mode="4-4" autoStart={true} />}
    </div>
  );
};

export default TriModalMeditation;
