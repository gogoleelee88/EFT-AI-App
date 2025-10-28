import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './components/auth/Login';
import Dashboard from './pages/Dashboard';
import AIChat from './components/feature/AIChat';
import EFTSessionSelector from './components/feature/EFTSessionSelector';
import ARDemo from './pages/ARDemo';
import ARTest from './pages/ARTest';
import ARHolisticTest from './pages/ARHolisticTest';
import ArCalibrationPage from './pages/ArCalibrationPage';
import ResponsiveContainer from './components/layout/ResponsiveContainer';
import AppHeader from './components/layout/AppHeader';
import PWAInstallHintIOS from './components/PWAInstallHintIOS';

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

  // 로그인되지 않은 경우 로그인 화면
  if (!isAuthenticated) {
    return (
      <ResponsiveContainer>
        <Login />
      </ResponsiveContainer>
    );
  }

  // 로그인된 경우 메인 앱 (React Router 기반 + 반응형)
  return (
    <Router>
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
          {/* 방어적 리다이렉트: /eft-guide → /ar-holistic */}
          <Route path="/eft-guide" element={<Navigate to="/ar-holistic" replace />} />
          {/* EFT AR 경로: /eftar → /ar-holistic */}
          <Route path="/eftar" element={<Navigate to="/ar-holistic" replace />} />
          {/* 잘못된 경로는 홈으로 리다이렉트 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ResponsiveContainer>
    </Router>
  );
};

export default App
