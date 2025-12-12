// import React, { useEffect } from 'react';
// import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import { useAuth } from './hooks/useAuth';
// import Dashboard from './pages/Dashboard';
// import AIChat from './components/feature/AIChat';
// import ARDemo from './pages/ARDemo';
// import ARTest from './pages/ARTest';
// import ARHolisticTest from './pages/ARHolisticTest';
// import ArCalibrationPage from './pages/ArCalibrationPage';
// import { EFTStrictPage } from './pages/EFTStrictPage';
// import { EFTScriptProvider } from './contexts/EFTScriptContext';
// import ResponsiveContainer from './components/layout/ResponsiveContainer';
// import AppHeader from './components/layout/AppHeader';
// import PWAInstallHintIOS from './components/PWAInstallHintIOS';
// import TriModalMeditation from './components/meditation/TriModalMeditation';

// const App: React.FC = () => {
//   const { user, loading, isAuthenticated } = useAuth();

//   // 🚀 서비스 런칭 전: 메인 URL → /landing.html 리다이렉트
//   // ✅ 수정: 루트('/') 경로일 때만 landing.html로 리다이렉트
//   useEffect(() => {
//     if (!loading) {
//       // 현재 경로가 정확히 '/' (루트)인 경우에만 정적 랜딩페이지로 이동
//       if (window.location.pathname === '/') {
//         window.location.href = '/landing.html';
//       }
//     }
//   }, [loading]);

//   // 로딩 중 스플래시 화면
//   if (loading) {
//     return (
//       <ResponsiveContainer>
//         <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent flex items-center justify-center">
//           <div className="text-center">
//             <div className="text-6xl mb-4 animate-pulse">🌿</div>
//             <div className="text-xl font-medium text-gray-600">마음을 치유하는 여행</div>
//             <div className="text-sm text-gray-500 mt-2">잠시만 기다려주세요...</div>

//             {/* 로딩 애니메이션 */}
//             <div className="mt-6 flex justify-center">
//               <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
//             </div>
//           </div>
//         </div>
//       </ResponsiveContainer>
//     );
//   }

//   // ✅ 기존 Router 구조 유지 (다른 경로들은 정상 작동)
//   return (
//     <Router>
//       <EFTScriptProvider>
//         <ResponsiveContainer>
//           <AppHeader />
//           <Routes>
//             <Route path="/dashboard" element={<Dashboard />} />
//             <Route path="/ai-chat" element={<AIChat />} />
//             <Route path="/ar-demo" element={<ARDemo />} />
//             <Route path="/ar-test" element={<ARTest />} />
//             <Route path="/ar-holistic" element={<ARHolisticTest />} />
//             <Route path="/ar-calibration" element={<ArCalibrationPage />} />
//             <Route path="/eft-strict" element={<EFTStrictPage />} />
//             <Route path="/meditation" element={<TriModalMeditation />} />
//             <Route path="*" element={<Navigate to="/" replace />} />
//           </Routes>
//           <PWAInstallHintIOS />
//         </ResponsiveContainer>
//       </EFTScriptProvider>
//     </Router>
//   );
// };

// export default App
// // trigger deploy

//로그인 여부
// import React from 'react'; // useEffect 불필요하여 제거
// import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import { useAuth } from './hooks/useAuth';

// // 페이지 컴포넌트 임포트
// import LandingPage from './pages/LandingPage'; // 👈 주석 해제 및 사용!
// import Dashboard from './pages/Dashboard';
// import AIChat from './components/feature/AIChat';
// import ARDemo from './pages/ARDemo';
// import ARTest from './pages/ARTest';
// import ARHolisticTest from './pages/ARHolisticTest';
// import ArCalibrationPage from './pages/ArCalibrationPage';
// import { EFTStrictPage } from './pages/EFTStrictPage';
// import { EFTScriptProvider } from './contexts/EFTScriptContext';
// import ResponsiveContainer from './components/layout/ResponsiveContainer';
// import AppHeader from './components/layout/AppHeader';
// import PWAInstallHintIOS from './components/PWAInstallHintIOS';
// import TriModalMeditation from './components/meditation/TriModalMeditation';

// const App: React.FC = () => {
//   const { user, loading, isAuthenticated } = useAuth();

//   // 로딩 중 스플래시 화면
//   if (loading) {
//     return (
//       <ResponsiveContainer>
//         <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 lg:bg-transparent flex items-center justify-center">
//           <div className="text-center">
//             <div className="text-6xl mb-4 animate-pulse">🌿</div>
//             <div className="text-xl font-medium text-gray-600">마음을 치유하는 여행</div>
//             <div className="text-sm text-gray-500 mt-2">잠시만 기다려주세요...</div>
//             <div className="mt-6 flex justify-center">
//               <div className="w-8 h-8 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
//             </div>
//           </div>
//         </div>
//       </ResponsiveContainer>
//     );
//   }

//   return (
//     <Router>
//       <EFTScriptProvider>
//         <div className="min-h-screen bg-gray-50">
//           {/* 헤더는 로그인 되었을 때만, 혹은 랜딩페이지가 아닐 때만 보여줄지 결정 필요.
//               보통 랜딩페이지는 자체 헤더를 쓰므로 여기서는 isAuthenticated일 때만 띄웁니다. 
//               (LandingPage 내부 코드에 이미 네비게이션바가 포함되어 있습니다) */}
//           {isAuthenticated && window.location.pathname !== '/' && <AppHeader />}
          
//           <Routes>
//             {/* 🚀 핵심 수정 사항:
//               루트('/') 경로 접속 시 리다이렉트 없이 'LandingPage' 컴포넌트를 그대로 렌더링합니다.
//               URL은 http://localhost:5173/ 그대로 유지됩니다.
//             */}
//             <Route 
//               path="/" 
//               element={
//                 // 만약 로그인 상태면 대시보드로, 아니면 랜딩페이지를 보여줌
//                 // (무조건 랜딩을 보여주고 싶으면 삼항연산자 빼고 <LandingPage />만 넣으시면 됩니다)
//                 isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />
//               } 
//             />

//             <Route path="/dashboard" element={<Dashboard />} />
//             <Route path="/ai-chat" element={<AIChat />} />
//             <Route path="/eft-strict" element={<EFTStrictPage />} />
//             <Route path="/ar-demo" element={<ARDemo />} />
//             <Route path="/ar-test" element={<ARTest />} />
//             <Route path="/ar-holistic" element={<ARHolisticTest />} />
//             <Route path="/ar-calibration" element={<ArCalibrationPage />} />
//             <Route path="/meditation" element={<TriModalMeditation />} />
            
//             {/* 로그인 페이지 경로가 없다면 추가 필요 (LandingPage에서 이동할 경로) */}
//             <Route path="/login" element={<div>로그인 페이지 컴포넌트를 여기에 넣으세요</div>} />
//           </Routes>
//           <PWAInstallHintIOS />
//         </div>
//       </EFTScriptProvider>
//     </Router>
//   );
// };

// export default App;
import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import ARBoxBreathingPage from '@/pages/ARBoxBreathingPage';// 박스 ar
import ARBoxScene from '@/pages/ARBoxScene';
import Dashboard from './pages/Dashboard';
import AIChat from './components/feature/AIChat';
import ARDemo from './pages/ARDemo';
import ARTest from './pages/ARTest';
import ARHolisticTest from './pages/ARHolisticTest';
import ArCalibrationPage from './pages/ArCalibrationPage';
import { EFTStrictPage } from './pages/EFTStrictPage';
import EFTPage from './pages/EFT';
import { EFTScriptProvider } from './contexts/EFTScriptContext';
import LoginPage from './pages/LoginPage';
import ResponsiveContainer from './components/layout/ResponsiveContainer';
import AppHeader from './components/layout/AppHeader';
import PWAInstallHintIOS from './components/PWAInstallHintIOS';
import TriModalMeditation from './components/meditation/TriModalMeditation';

// 1. LandingFrame: 스타일 깨짐 방지를 위해 landing.html을 iframe으로 로드
const LandingFrame: React.FC = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <iframe 
        src="/landing.html" 
        style={{ 
          width: '100%', 
          height: '100%', 
          border: 'none',
          display: 'block' 
        }} 
        title="Landing Page"
      />
    </div>
  );
};

// 2. 레이아웃 컨트롤러: 현재 경로가 '/' 이면 헤더를 숨김
const LayoutController: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  
  // 루트 경로('/')일 때는 헤더를 절대 보여주지 않음
  const isLandingPage = location.pathname === '/';

  return (
    <>
      {!isLandingPage && isAuthenticated && <AppHeader />}
      {children}
    </>
  );
};

const App: React.FC = () => {
  const { loading } = useAuth();

  if (loading) {
    return (
      <ResponsiveContainer>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-blue-600 rounded-full animate-spin"></div>
        </div>
      </ResponsiveContainer>
    );
  }

  return (
    <Router>
      <EFTScriptProvider>
        <div className="min-h-screen bg-gray-50">
          <LayoutController>
            <Routes>
              {/* 🔴 핵심 수정: 로그인 체크 제거! 무조건 LandingFrame 보여줌 */}
              <Route path="/" element={<LandingFrame />} />

              {/* 나머지 경로들은 정상 작동 */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/ai-chat" element={<AIChat userId="guest" />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/eft-strict" element={<EFTStrictPage />} />
              <Route path="/ar-demo" element={<ARDemo />} />
              <Route path="/ar-test" element={<ARTest />} />
              <Route path="/ar-holistic" element={<ARHolisticTest />} />
              <Route path="/ar-box-scene" element={<ARBoxScene />} />
              <Route path="/ar-box-breathing" element={<ARBoxBreathingPage />} />
              <Route path="/ar-calibration" element={<ArCalibrationPage />} />
              <Route path="/meditation" element={<TriModalMeditation />} />
            </Routes>
          </LayoutController>
          <PWAInstallHintIOS />
        </div>
      </EFTScriptProvider>
    </Router>
  );
};

export default App;