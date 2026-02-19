import { useCallback, useEffect, useRef, useState } from 'react';

type QueueItem =
  | { kind: 'blob'; audioUrl: string; text: string }
  | { kind: 'speech'; text: string };

/** 백엔드 TTS가 mock일 때 blob이 작음. 1KB 미만이면 Web Speech API 폴백 */
const MOCK_AUDIO_SIZE_THRESHOLD = 1000;

interface UseMeditationAudioResult {
  /** 현재 재생 중인 오디오에 대응하는 텍스트 (오디오 onPlay 시점에 업데이트) */
  currentText: string | null;
  /** 오디오가 재생 중인지 여부 */
  isPlaying: boolean;
  /** BGM 볼륨 (0.0~1.0), ducking/fading 결과 */
  bgmVolume: number;
  /** 내부에서 사용할 오디오 엘리먼트 ref를 부모에서 연결할 수 있게 함 */
  attachAudioRef: (el: HTMLAudioElement | null) => void;
  /** Blob + 텍스트를 큐에 추가. blob이 mock(작음)이면 Web Speech API 폴백 */
  enqueueAudio: (blob: Blob, text: string) => void;
  /** 텍스트만으로 Web Speech API로 재생 (API 실패 시 폴백) */
  enqueueText: (text: string) => void;
  /** 큐와 현재 재생 상태 초기화 */
  reset: () => void;
}

/**
 * 명상용 오디오 큐 + 자막 동기화 + BGM ducking을 관리하는 훅.
 * - audioQueue: { audioUrl, text } 형태로 관리
 * - 오디오 onPlay 시 currentText 업데이트
 * - 오디오 onEnded 시 다음 큐로 자동 전환
 * - BGM 볼륨을 0.5~1초에 걸쳐 부드럽게 fade in/out
 */
export function useMeditationAudio(): UseMeditationAudioResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null);
  const [currentText, setCurrentText] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(1.0);

  const fadeIntervalRef = useRef<number | null>(null);

  const clearFadeInterval = () => {
    if (fadeIntervalRef.current != null) {
      window.clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
  };

  const fadeTo = useCallback((target: number, durationMs: number) => {
    clearFadeInterval();
    const start = bgmVolume;
    const diff = target - start;
    if (durationMs <= 0 || Math.abs(diff) < 0.01) {
      setBgmVolume(target);
      return;
    }
    const steps = 20;
    const stepMs = durationMs / steps;
    let i = 0;
    fadeIntervalRef.current = window.setInterval(() => {
      i += 1;
      const ratio = Math.min(1, i / steps);
      const next = start + diff * ratio;
      setBgmVolume(Math.max(0, Math.min(1, next)));
      if (ratio >= 1 && fadeIntervalRef.current != null) {
        window.clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
    }, stepMs);
  }, [bgmVolume]);

  const attachAudioRef = useCallback((el: HTMLAudioElement | null) => {
    if (audioRef.current && audioRef.current !== el) {
      // 이전 audio 엘리먼트 이벤트 정리
      audioRef.current.onplay = null;
      audioRef.current.onended = null;
    }
    audioRef.current = el;
  }, []);

  const playNext = useCallback(() => {
    const audio = audioRef.current;
    setQueue((q) => {
      const nextItem = q[0];
      if (!nextItem || q.length === 0) {
        setIsPlaying(false);
        fadeTo(1.0, 600);
        return q;
      }
      const rest = q.slice(1);
      const text = nextItem.text;

      // Web Speech API 폴백 (백엔드 TTS mock 시)
      if (nextItem.kind === 'speech') {
        setCurrentItem(nextItem);
        setIsPlaying(true);
        setCurrentText(text);
        fadeTo(0.3, 500);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ko-KR';
        u.rate = 0.9;
        u.onend = () => {
          setIsPlaying(false);
          fadeTo(1.0, 600);
          setCurrentItem(null);
          window.setTimeout(playNext, 50);
        };
        u.onerror = () => {
          setIsPlaying(false);
          fadeTo(1.0, 600);
          setCurrentItem(null);
          window.setTimeout(playNext, 50);
        };
        window.speechSynthesis.speak(u);
        return rest;
      }

      // Blob 오디오 재생
      if (!audio) return rest;
      if (nextItem.kind === 'blob') {
        setCurrentItem(nextItem);
        audio.src = nextItem.audioUrl;
        audio.onplay = () => {
          setIsPlaying(true);
          setCurrentText(text);
          fadeTo(0.3, 500);
        };
        audio.onended = () => {
          setIsPlaying(false);
          URL.revokeObjectURL(nextItem.audioUrl);
          setCurrentItem(null);
          fadeTo(1.0, 600);
          window.setTimeout(playNext, 50);
        };
        audio.play().catch(() => {
          setIsPlaying(false);
          URL.revokeObjectURL(nextItem.audioUrl);
          setCurrentItem(null);
          fadeTo(1.0, 600);
          window.setTimeout(playNext, 50);
        });
      }
      return rest;
    });
  }, [fadeTo]);

  const enqueueAudio = useCallback((blob: Blob, text: string) => {
    const item: QueueItem =
      blob.size < MOCK_AUDIO_SIZE_THRESHOLD
        ? { kind: 'speech', text }
        : { kind: 'blob', audioUrl: URL.createObjectURL(blob), text };
    setQueue((prev) => [...prev, item]);
    // 재생 중이 아니면 바로 시작
    if (!isPlaying && !currentItem) {
      // 약간 지연 후 playNext 호출 (queue setState 이후)
      window.setTimeout(() => {
        playNext();
      }, 0);
    }
  }, [currentItem, isPlaying, playNext]);

  const enqueueText = useCallback((text: string) => {
    if (!text.trim()) return;
    const item: QueueItem = { kind: 'speech', text: text.trim() };
    setQueue((prev) => [...prev, item]);
    if (!isPlaying && !currentItem) {
      window.setTimeout(playNext, 0);
    }
  }, [currentItem, isPlaying, playNext]);

  const reset = useCallback(() => {
    window.speechSynthesis.cancel();
    setQueue((q) => {
      q.forEach((item) => {
        if (item.kind === 'blob') URL.revokeObjectURL(item.audioUrl);
      });
      return [];
    });
    if (currentItem && currentItem.kind === 'blob') {
      URL.revokeObjectURL(currentItem.audioUrl);
    }
    setCurrentItem(null);
    setCurrentText(null);
    setIsPlaying(false);
    setBgmVolume(1.0);
    clearFadeInterval();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audio.onplay = null;
      audio.onended = null;
    }
  }, [currentItem]);

  useEffect(() => {
    return () => {
      // 언마운트 시 정리
      reset();
    };
  }, [reset]);

  return {
    currentText,
    isPlaying,
    bgmVolume,
    attachAudioRef,
    enqueueAudio,
    enqueueText,
    reset,
  };
}

