import React from 'react';

interface EmotionButtonProps {
  emotion: string;
  isSelected?: boolean;
  onClick: () => void;
  intensity?: number;
  className?: string;
}

const EmotionButton: React.FC<EmotionButtonProps> = ({
  emotion,
  isSelected = false,
  onClick,
  intensity,
  className = ''
}) => {
  // 감정별 색상 (임시 - 나중에 피그마 디자인으로 교체)
  const emotionColors: Record<string, string> = {
    '스트레스': 'from-red-400 to-red-600',
    '불안': 'from-orange-400 to-orange-600',
    '분노': 'from-red-500 to-red-700',
    '슬픔': 'from-blue-400 to-blue-600',
    '두려움': 'from-purple-400 to-purple-600',
    '외로움': 'from-gray-400 to-gray-600',
    '좌절감': 'from-yellow-500 to-orange-500',
    '질투/시기': 'from-green-400 to-green-600',
    '수치심': 'from-pink-400 to-pink-600',
    '죄책감': 'from-indigo-400 to-indigo-600'
  };
  
  const gradientClass = emotionColors[emotion] || 'from-gray-400 to-gray-600';
  
  const baseClasses = 'relative px-4 py-3 rounded-lg font-medium text-white transition-all duration-200 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';
  
  const selectedClasses = isSelected 
    ? 'ring-2 ring-blue-400 ring-offset-2 scale-105' 
    : 'hover:shadow-lg';
  
  const backgroundClasses = `bg-gradient-to-br ${gradientClass}`;
  
  const combinedClasses = [
    baseClasses,
    backgroundClasses,
    selectedClasses,
    className
  ].join(' ');
  
  return (
    <button
      onClick={onClick}
      className={combinedClasses}
    >
      <div className="text-center">
        <div className="text-lg font-semibold">{emotion}</div>
        {intensity && (
          <div className="text-sm opacity-90 mt-1">
            강도: {intensity}/10
          </div>
        )}
      </div>
      
      {isSelected && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
          <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </button>
  );
};

export default EmotionButton;