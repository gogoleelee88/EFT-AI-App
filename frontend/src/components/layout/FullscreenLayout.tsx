/**
 * FullscreenLayout
 * 전체 화면 페이지용 레이아웃 (헤더/푸터 없음)
 * 명상, AR 가이드 등에 사용
 */

import React from 'react';

interface FullscreenLayoutProps {
  children: React.ReactNode;
}

export const FullscreenLayout: React.FC<FullscreenLayoutProps> = ({ children }) => {
  return (
    <div className="h-screen w-full overflow-hidden">
      {children}
    </div>
  );
};

export default FullscreenLayout;
