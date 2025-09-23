import React from 'react';

type Props = {
  measurementType?: string;
  prompt?: string;
  context?: any;
  onSudsSubmit?: (score: number) => void;
  value?: number;
  onClick?: () => void;
  className?: string;
};

export default function SUDSInlineCard({
  measurementType,
  prompt,
  context,
  onSudsSubmit,
  value,
  onClick,
  className
}: Props) {
  const handleScoreClick = (score: number) => {
    if (onSudsSubmit) {
      onSudsSubmit(score);
    }
  };

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className ?? ''}`}>
      <div className="text-center">
        <h3 className="font-medium text-blue-800 mb-2">
          {prompt || 'SUDS 점수를 선택해주세요'}
        </h3>

        <div className="text-sm text-blue-600 mb-3">
          스트레스 수준 (0 = 매우 편안함, 10 = 극도로 불안함)
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleScoreClick(i)}
              className={`w-10 h-10 rounded-full border-2 font-medium transition-colors ${
                value === i
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-100'
              }`}
            >
              {i}
            </button>
          ))}
        </div>

        <div className="text-xs text-gray-500 mt-2">
          {measurementType === 'pre' ? '세션 전 측정' : measurementType === 'post' ? '세션 후 측정' : '현재 측정'}
        </div>
      </div>
    </div>
  );
}