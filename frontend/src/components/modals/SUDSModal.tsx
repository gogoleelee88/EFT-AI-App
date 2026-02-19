/**
 * Generic SUDS (0~10) modal used by EFT and meditation flows.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

interface SUDSModalProps {
  open: boolean;
  label: 'pre' | 'post';
  onSubmit: (score: number) => void;
  onClose?: () => void;
  currentValue?: number;
  submitting?: boolean;
  contextName?: string;
  submitLabelPre?: string;
  submitLabelPost?: string;
}

const SUDSModal: React.FC<SUDSModalProps> = ({
  open,
  label,
  onSubmit,
  onClose,
  currentValue = 5,
  submitting = false,
  contextName = 'EFT',
  submitLabelPre,
  submitLabelPost,
}) => {
  const [score, setScore] = useState<number>(currentValue);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setScore(currentValue);
  }, [open, currentValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isPre = label === 'pre';
  const title = isPre ? `${contextName} 시작 전 상태` : `${contextName} 종료 후 상태`;
  const description = isPre
    ? `${contextName} 시작 전에 현재 감정 강도를 선택해 주세요 (0 = 매우 편안, 10 = 매우 불편).`
    : `${contextName} 종료 후 감정 강도의 변화를 기록해 주세요.`;

  const getScoreDescription = (v: number): string => {
    if (v <= 2) return '매우 편안';
    if (v <= 4) return '약간 불편';
    if (v <= 6) return '보통';
    if (v <= 8) return '꽤 불편';
    return '매우 불편';
  };

  const getScoreColor = (v: number): string => {
    if (v <= 3) return 'text-green-600';
    if (v <= 5) return 'text-yellow-600';
    if (v <= 7) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl outline-none"
      >
        <div className="mb-6 text-center">
          <h3 className="mb-2 text-xl font-bold text-gray-800">
            SUDS 측정 {isPre ? '(사전)' : '(사후)'}
          </h3>
          <h4 className="mb-3 text-lg font-semibold text-gray-700">{title}</h4>
          <p className="text-sm text-gray-600">{description}</p>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex justify-between text-xs text-gray-500">
            <span>매우 편안</span>
            <span>매우 불편</span>
          </div>

          <input
            type="range"
            min={0}
            max={10}
            value={score}
            onChange={(e) => setScore(parseInt(e.target.value, 10))}
            className="
              w-full cursor-pointer appearance-none
              [&::-webkit-slider-runnable-track]:h-2
              [&::-webkit-slider-runnable-track]:rounded-md
              [&::-webkit-slider-runnable-track]:bg-gradient-to-r
              [&::-webkit-slider-runnable-track]:from-emerald-500
              [&::-webkit-slider-runnable-track]:via-amber-500
              [&::-webkit-slider-runnable-track]:to-red-500
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-blue-600
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-white
              [&::-webkit-slider-thumb]:shadow
              [&::-moz-range-track]:h-2
              [&::-moz-range-track]:rounded-md
              [&::-moz-range-track]:bg-gradient-to-r
              [&::-moz-range-track]:from-emerald-500
              [&::-moz-range-track]:via-amber-500
              [&::-moz-range-track]:to-red-500
              [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-blue-600
              [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-white
              [&::-moz-range-thumb]:shadow
            "
            aria-label="SUDS 점수"
          />

          <div className="mt-1 flex justify-between text-xs text-gray-400">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>

        <div className="mb-6 rounded-xl bg-gray-50 p-4 text-center">
          <div className={`mb-2 text-3xl font-bold ${getScoreColor(score)}`}>
            {score}
          </div>
          <div className={`text-sm font-medium ${getScoreColor(score)}`}>
            {getScoreDescription(score)}
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-blue-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-blue-800">SUDS 점수 가이드</h5>
          <div className="space-y-1 text-xs text-blue-700">
            <div>0~2: 매우 편안</div>
            <div>3~4: 약간 불편하지만 견딜 만함</div>
            <div>5~6: 보통 수준의 불편감</div>
            <div>7~8: 강한 불편감</div>
            <div>9~10: 매우 강한 고통/스트레스</div>
          </div>
        </div>

        <div className="flex gap-3">
          {onClose && (
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={submitting}>
              취소
            </Button>
          )}
          <Button
            onClick={() => onSubmit(score)}
            className="flex-1 bg-blue-600 text-white hover:bg-blue-700"
            disabled={submitting}
          >
            {submitting
              ? '저장 중...'
              : (isPre ? (submitLabelPre ?? `${contextName} 시작하기`) : (submitLabelPost ?? '완료하기'))}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SUDSModal;