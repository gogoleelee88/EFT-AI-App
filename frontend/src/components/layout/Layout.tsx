import React from 'react';
import Header from './Header';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  hideBottomNav?: boolean;
  className?: string;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  title,
  showBack = false,
  onBack,
  rightAction,
  activeTab = 'home',
  onTabChange = () => {},
  hideBottomNav = false,
  className = ''
}) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <Header 
        title={title}
        showBack={showBack}
        onBack={onBack}
        rightAction={rightAction}
      />
      
      {/* 메인 콘텐츠 */}
      <main className={`flex-1 overflow-auto ${hideBottomNav ? 'pb-4' : 'pb-20'} ${className}`}>
        {children}
      </main>
      
      {/* 하단 네비게이션 */}
      {!hideBottomNav && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <BottomNav 
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
        </div>
      )}
    </div>
  );
};

export default Layout;