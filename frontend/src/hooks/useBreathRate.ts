/**
 * Phase 2: 오디오 기반 호흡률 추정 (TriModalMeditation 로직 재사용)
 * 마이크 RMS 피크 감지 → breaths/min
 */
import { useState, useEffect, useRef } from 'react';

const PEAK_MIN_INTERVAL_MS = 2000;
const PEAK_RMS_THRESHOLD = 0.05;
const MIN_PEAKS_FOR_RATE = 3;
const MAX_PEAK_HISTORY = 10;

export function useBreathRate(stream: MediaStream | null, active: boolean): number | null {
  const [breathRate, setBreathRate] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const breathPeaksRef = useRef<number[]>([]);
  const lastPeakTimeRef = useRef(0);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!stream || !active) {
      setBreathRate(null);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      return;
    }

    const ctx = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = 2048;
    source.connect(analyzer);

    const dataArray = new Uint8Array(analyzer.fftSize);

    function analyze() {
      if (!audioContextRef.current) return;

      analyzer.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const n = (dataArray[i] - 128) / 128;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const now = Date.now();

      if (rms > PEAK_RMS_THRESHOLD && now - lastPeakTimeRef.current > PEAK_MIN_INTERVAL_MS) {
        breathPeaksRef.current.push(now);
        lastPeakTimeRef.current = now;
        if (breathPeaksRef.current.length > MAX_PEAK_HISTORY) {
          breathPeaksRef.current.shift();
        }

        if (breathPeaksRef.current.length >= MIN_PEAKS_FOR_RATE) {
          const peaks = breathPeaksRef.current;
          const intervals: number[] = [];
          for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i] - peaks[i - 1]);
          }
          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const rate = 60000 / avgInterval; // breaths per minute
          setBreathRate(Math.round(rate * 10) / 10);
        }
      }

      rafRef.current = setTimeout(analyze, 100);
    }

    analyze();

    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
      audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [stream?.id, active]);

  return breathRate;
}
