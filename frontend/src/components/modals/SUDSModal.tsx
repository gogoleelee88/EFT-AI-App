/**
 * SUDS (Subjective Units of Distress Scale) Modal
 * - EFT ?�션 ?????�트?�스 ?��?(0~10) 측정
 * - props:
 *   open: boolean
 *   label: 'pre' | 'post'
 *   onSubmit: (score: number) => void
 *   onClose?: () => void
 *   currentValue?: number
 */

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

interface SUDSModalProps {
  open: boolean;
  label: 'pre' | 'post';
  onSubmit: (score: number) => void;
  onClose?: () => void;
  currentValue?: number;
}

const SUDSModal: React.FC<SUDSModalProps> = ({
  open,
  label,
  onSubmit,
  onClose,
  currentValue = 5,
}) => {
  const [score, setScore] = useState<number>(currentValue);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) setScore(currentValue);
  }, [open, currentValue]);

  // ESC ?�기
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
  const title = isPre ? 'EFT 시작 전 상태' : 'EFT 적용 후 상태';
  const description = isPre
    ? 'EFT AR 가이드를 시작하기 전에 지금 느끼는 스트레스/불편의 정도를 선택해주세요 (0=매우 편안, 10=매우 불편).'
    : 'EFT 적용 후 스트레스/불편함의 변화를 알려주세요.';

  const getScoreDescription = (v: number): string => {
    if (v <= 2) return '매우 편안';
    if (v <= 4) return '약간 편안';
    if (v <= 6) return '보통';
    if (v <= 8) return '약소 불편';
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
        {/* ?�더 */}
        <div className="mb-6 text-center">
          <h3 className="mb-2 text-xl font-bold text-gray-800">
            SUDS 측정 {isPre ? '(?�전)' : '(?�후)'}
          </h3>
          <h4 className="mb-3 text-lg font-semibold text-gray-700">{title}</h4>
          <p className="text-sm text-gray-600">{description}</p>
        </div>

        {/* 슬라이더 */}
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
            aria-label="SUDS ?�수"
          />

          <div className="mt-1 flex justify-between text-xs text-gray-400">
            {Array.from({ length: 11 }, (_, i) => i).map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>

        {/* 현재 점수 */}
        <div className="mb-6 rounded-xl bg-gray-50 p-4 text-center">
          <div className={`mb-2 text-3xl font-bold ${getScoreColor(score)}`}>
            {score}
          </div>
          <div className={`text-sm font-medium ${getScoreColor(score)}`}>
            {getScoreDescription(score)}
          </div>
        </div>

        {/* 가이드 */}
        <div className="mb-6 rounded-lg bg-blue-50 p-3">
          <h5 className="mb-2 text-sm font-semibold text-blue-800">SUDS 점수 가이드</h5>
          <div className="space-y-1 text-xs text-blue-700">
            <div>0~2: 매우 편안 / 안정</div>
            <div>3~4: 약간 불편하지만 견딜 만함</div>
            <div>5~6: 보통 수준의 불편감</div>
            <div>7~8: 상당한 불편, 주의 필요</div>
            <div>9~10: 매우 큰 고통 / 스트레스</div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          {onClose && (
            <Button variant="outline" onClick={onClose} className="flex-1">
              취소
            </Button>
          )}
          <Button onClick={() => onSubmit(score)} className="flex-1 bg-blue-600 text-white hover:bg-blue-700">
            {isPre ? 'EFT ?�작?�기' : '?�료?�기'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SUDSModal;
