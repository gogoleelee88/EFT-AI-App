import React from 'react';
import { Button } from '../ui';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

const Header: React.FC<HeaderProps> = ({
  title = 'EFT 마음챙김',
  showBack = false,
  onBack,
  rightAction,
  className = ''
}) => {
  return (
    <header className={`bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between ${className}`}>
      {/* 왼쪽: 뒤로가기 또는 로고 */}
      <div className="flex items-center">
        {showBack && onBack ? (
          <button 
            onClick={onBack}
            className="mr-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <div className="flex items-center mr-3">
            {/* 앱 아이콘 (임시) */}
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-2">
              <span className="text-white text-sm font-bold">E</span>
            </div>
          </div>
        )}
        
        <h1 className="text-lg font-semibold text-gray-900">
          {title}
        </h1>
      </div>
      
      {/* 오른쪽: 액션 버튼들 */}
      <div className="flex items-center space-x-2">
        {rightAction}
      </div>
    </header>
  );
};

export default Header;