import React from 'react';

interface IntensitySliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
}

const IntensitySlider: React.FC<IntensitySliderProps> = ({
  value,
  onChange,
  min = 1,
  max = 10,
  label = "감정 강도",
  className = ''
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };
  
  // 강도에 따른 색상 변화
  const getColor = (intensity: number) => {
    if (intensity <= 3) return 'text-green-600';
    if (intensity <= 6) return 'text-yellow-600';
    if (intensity <= 8) return 'text-orange-600';
    return 'text-red-600';
  };
  
  const getSliderColor = (intensity: number) => {
    if (intensity <= 3) return 'accent-green-500';
    if (intensity <= 6) return 'accent-yellow-500';
    if (intensity <= 8) return 'accent-orange-500';
    return 'accent-red-500';
  };
  
  const getIntensityLabel = (intensity: number) => {
    if (intensity <= 2) return '매우 약함';
    if (intensity <= 4) return '약함';
    if (intensity <= 6) return '보통';
    if (intensity <= 8) return '강함';
    return '매우 강함';
  };
  
  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        <div className={`text-lg font-semibold ${getColor(value)}`}>
          {value}/10
        </div>
      </div>
      
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={handleChange}
          className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${getSliderColor(value)}`}
        />
        
        {/* 슬라이더 마크 */}
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>1</span>
          <span>5</span>
          <span>10</span>
        </div>
      </div>
      
      <div className="text-center mt-2">
        <span className={`text-sm font-medium ${getColor(value)}`}>
          {getIntensityLabel(value)}
        </span>
      </div>
      
      {/* 시각적 인디케이터 */}
      <div className="flex justify-center mt-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level) => (
          <div
            key={level}
            className={`w-3 h-3 mx-0.5 rounded-full transition-all duration-200 ${
              level <= value 
                ? value <= 3 ? 'bg-green-500' 
                  : value <= 6 ? 'bg-yellow-500'
                  : value <= 8 ? 'bg-orange-500'
                  : 'bg-red-500'
                : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default IntensitySlider;