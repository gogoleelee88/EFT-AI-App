/**
 * MainLayout
 * 일반 페이지용 레이아웃 (헤더 + ResponsiveContainer 포함)
 */

import React from 'react';
import ResponsiveContainer from './ResponsiveContainer';
import AppHeader from './AppHeader';
import PWAInstallHintIOS from '../PWAInstallHintIOS';

interface MainLayoutProps {
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <ResponsiveContainer>
      <AppHeader />
      <PWAInstallHintIOS />
      {children}
    </ResponsiveContainer>
  );
};

export default MainLayout;
