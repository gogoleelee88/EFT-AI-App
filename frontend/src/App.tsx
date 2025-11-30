import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Dashboard from './pages/Dashboard';
import AIChat from './components/feature/AIChat';
import ARDemo from './pages/ARDemo';
import ARTest from './pages/ARTest';
import ARHolisticTest from './pages/ARHolisticTest';
import ArCalibrationPage from './pages/ArCalibrationPage';
import { EFTStrictPage } from './pages/EFTStrictPage';
import { EFTScriptProvider } from './contexts/EFTScriptContext';
import ResponsiveContainer from './components/layout/ResponsiveContainer';
import AppHeader from './components/layout/AppHeader';
import PWAInstallHintIOS from './components/PWAInstallHintIOS';
import TriModalMeditation from './components/meditation/TriModalMeditation';

const App: React.FC = () => {
  const { user, loading, isAuthenticated } = useAuth();

  // 로딩 중 스플래시 화면
  if (loading) {
    return (
      <ResponsiveContainer>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-pulse">🌿</div>
            <div className="text-xl font-medium text-gray-600">마음을 치유하는 여행</div>
            <div className="text-sm text-gray-500 mt-2">잠시만 기다려주세요...</div>

            {/* 로딩 애니메이션 */}
            <div className="mt-6 flex justify-center">
              <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          </div>
        </div>
      </ResponsiveContainer>
    );
  }

  // 로그인되지 않은 경우 → HTML 랜딩페이지로 리다이렉트
  useEffect(() => {
    if (!isAuthenticated && !loading) {
      window.location.href = '/landing.html';
    }
  }, [isAuthenticated, loading]);

  if (!isAuthenticated) {
    return null; // 리다이렉트 중
  }

  // 로그인된 경우 → 메인 앱 (대시보드)
  return (
    <Router>
      <EFTScriptProvider>
        <ResponsiveContainer>
        <AppHeader />
        <PWAInstallHintIOS />
        <Routes>
          <Route path="/dashboard" element={<Dashboard user={user} />} />
          <Route path="/" element={<Dashboard user={user} />} />
          <Route
            path="/ai-chat"
            element={<AIChat userId={user?.uid || 'demo'} />}
          />
          <Route
            path="/ar-demo"
            element={<ARDemo />}
          />
          <Route
            path="/ar-test"
            element={<ARTest />}
          />
          <Route
            path="/ar-holistic"
            element={<ARHolisticTest />}
          />
          <Route
            path="/ar/calibration"
            element={<ArCalibrationPage />}
          />
          <Route
            path="/eft-strict"
            element={<EFTStrictPage />}
          />
          <Route path="/eft-guide" element={<Navigate to="/ar-holistic" replace />} />
          <Route path="/eftar" element={<Navigate to="/ar-holistic" replace />} />
          <Route path="/tri-modal" element={<TriModalMeditation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ResponsiveContainer>
      </EFTScriptProvider>
    </Router>
  );
};

export default App
// trigger deploy
