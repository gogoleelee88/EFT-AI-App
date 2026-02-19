import React from 'react';

export type SpecMode = 100 | 70 | 40;

const MODE_CONFIG: Record<SpecMode, { label: string; bgClass: string; textClass: string }> = {
  100: {
    label: '100',
    bgClass: 'bg-spec-100',
    textClass: 'text-white',
  },
  70: {
    label: '70',
    bgClass: 'bg-spec-70',
    textClass: 'text-white',
  },
  40: {
    label: '40',
    bgClass: 'bg-spec-40',
    textClass: 'text-white',
  },
};

export interface ModeBadgeProps {
  mode: SpecMode;
  /** 뱃지 텍스트. 없으면 100/70/40 숫자만 */
  label?: string;
  className?: string;
}

/**
 * 일정관리(spec_loop) 모드 뱃지. 100=에메랄드, 70=앰버, 40=인디고 (S1 토큰).
 */
const ModeBadge: React.FC<ModeBadgeProps> = ({ mode, label, className = '' }) => {
  const config = MODE_CONFIG[mode];
  const displayLabel = label ?? config.label;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-sm font-medium ${config.bgClass} ${config.textClass} ${className}`}
      aria-label={`모드 ${displayLabel}`}
    >
      {displayLabel}
    </span>
  );
};

export default ModeBadge;
