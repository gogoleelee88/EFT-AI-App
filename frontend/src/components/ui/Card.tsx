import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  border?: boolean;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  shadow = 'md',
  border = true,
  onClick
}) => {
  const baseClasses = 'bg-white rounded-lg transition-all duration-200';
  
  const paddingClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };
  
  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg'
  };
  
  const borderClasses = border ? 'border border-gray-200' : '';
  const hoverClasses = onClick ? 'hover:shadow-lg cursor-pointer' : '';
  
  const combinedClasses = [
    baseClasses,
    paddingClasses[padding],
    shadowClasses[shadow],
    borderClasses,
    hoverClasses,
    className
  ].join(' ');
  
  return (
    <div
      onClick={onClick}
      className={combinedClasses}
    >
      {children}
    </div>
  );
};

export default Card;