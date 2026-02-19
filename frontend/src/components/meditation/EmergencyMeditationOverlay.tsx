/**
 * 명상 중 응급 대처 오버레이 (설계 §10)
 * - 박스 호흡 (4-4-4-4)
 * - 전문 도움 연락처 (1393, 119, 1577-0199)
 */
import React, { useState, useEffect, useCallback } from 'react';

const SIDE_LABELS = ['들이쉬기 (4초)', '멈추기 (4초)', '내쉬기 (4초)', '멈추기 (4초)'];
const PHASE_DURATION_MS = 4000;

interface EmergencyMeditationOverlayProps {
  onBack: () => void;
  onResume?: () => void;
}

export function EmergencyMeditationOverlay({ onBack, onResume }: EmergencyMeditationOverlayProps) {
  const [phase, setPhase] = useState(0);
  const [count, setCount] = useState(4);
  const [cycle, setCycle] = useState(1);

  useEffect(() => {
    const iv = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          setPhase((p) => {
            if (p >= 3) {
              setCycle((cy) => cy + 1);
              return 0;
            }
            return p + 1;
          });
          return 4;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
      {/* 상단: 긴급 안내 */}
      <div className="border-b border-white/20 px-4 py-3">
        <h2 className="text-center text-lg font-bold">지금 힘드시군요</h2>
        <p className="mt-1 text-center text-sm text-white/80">
          박스 호흡(4-4-4-4)으로 천천히 진정해 보세요
        </p>
      </div>

      {/* 중앙: 박스 호흡 카운트 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="rounded-full border-4 border-amber-400/60 bg-amber-400/10 p-12">
          <span className="text-6xl font-bold tabular-nums">{count}</span>
        </div>
        <p className="text-xl font-medium text-amber-200">{SIDE_LABELS[phase]}</p>
        <p className="text-sm text-white/60">{cycle}번째 사이클</p>
      </div>

      {/* 연락처 */}
      <div className="border-t border-white/20 p-4">
        <p className="mb-3 text-center text-sm font-medium text-white/90">전문 도움 연락처</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href="tel:1393"
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium hover:bg-rose-500"
          >
            📞 1393 (자살예방상담)
          </a>
          <a
            href="tel:119"
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium hover:bg-rose-500"
          >
            🚨 119 (응급의료)
          </a>
          <a
            href="tel:15770199"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
          >
            💬 1577-0199 (정신건강위기)
          </a>
        </div>
      </div>

      {/* 하단: 액션 */}
      <div className="flex gap-3 border-t border-white/20 p-4">
        {onResume && (
          <button
            type="button"
            onClick={onResume}
            className="flex-1 rounded-xl bg-indigo-600 py-3 font-medium hover:bg-indigo-500"
          >
            명상 다시 시작
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-white/30 py-3 font-medium hover:bg-white/10"
        >
          명상 종료
        </button>
      </div>
    </div>
  );
}
