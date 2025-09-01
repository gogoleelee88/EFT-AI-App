import React from 'react';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  className?: string;
}

const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({ 
  children, 
  className = '' 
}) => {
  return (
    <div className={`min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 
                     lg:bg-gray-100 lg:py-8 ${className}`}>
      {/* 모바일: 전체 화면 */}
      {/* 데스크톱: 중앙 배치 + 그림자 효과로 앱 느낌 */}
      <div className="w-full h-full 
                      lg:max-w-md lg:mx-auto lg:bg-white lg:shadow-2xl 
                      lg:rounded-xl lg:overflow-hidden lg:border lg:border-gray-200">
        {children}
      </div>
    </div>
  );
};

export default ResponsiveContainer;