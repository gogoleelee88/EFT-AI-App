import { useRef, useCallback } from 'react';
import type { XY } from './types';

export function useSmoothing(alpha: number = 0.3) {
  const previousRef = useRef<Map<string, XY>>(new Map());

  const smooth = useCallback((key: string, current: XY | null): XY | null => {
    if (!current) return null;

    const previous = previousRef.current.get(key);
    
    if (!previous) {
      previousRef.current.set(key, current);
      return current;
    }

    // 지수이동평균 (EMA) 적용
    const smoothed: XY = {
      x: alpha * current.x + (1 - alpha) * previous.x,
      y: alpha * current.y + (1 - alpha) * previous.y,
      vis: current.vis
    };

    previousRef.current.set(key, smoothed);
    return smoothed;
  }, [alpha]);

  const reset = useCallback(() => {
    previousRef.current.clear();
  }, []);

  return { smooth, reset };
}