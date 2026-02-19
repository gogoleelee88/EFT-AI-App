import React from 'react';

export interface SpecCardProps {
  children: React.ReactNode;
  className?: string;
  /** 글래스 스타일 사용 여부. true면 backdrop-blur + 반투명 배경 */
  glass?: boolean;
  onClick?: () => void;
}

/**
 * 일정관리(spec_loop) 전용 카드. S1 토큰(radius, shadow, 글래스) 적용.
 */
const SpecCard: React.FC<SpecCardProps> = ({
  children,
  className = '',
  glass = true,
  onClick,
}) => {
  const base = 'rounded-[var(--spec-card-radius)] transition-all duration-200';
  const glassClasses = glass
    ? 'bg-[var(--spec-glass-bg)] dark:bg-[var(--spec-glass-bg-dark)] border border-[var(--spec-glass-border)] dark:border-[var(--spec-glass-border-dark)] backdrop-blur-xl shadow-[var(--spec-card-shadow)]'
    : 'bg-card border border-border shadow-[var(--spec-card-shadow)]';
  const interactive = onClick ? 'cursor-pointer hover:opacity-95' : '';

  return (
    <div
      onClick={onClick}
      className={[base, glassClasses, interactive, className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
};

export default SpecCard;
