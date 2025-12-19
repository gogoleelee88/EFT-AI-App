// import React from 'react';
// import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
// import { useAuth } from './hooks/useAuth';
// import Dashboard from './pages/Dashboard';
// import AIChat from './components/feature/AIChat';
// import ARDemo from './pages/ARDemo';
// import ARTest from './pages/ARTest';
// import ARHolisticTest from './pages/ARHolisticTest';
// import ArCalibrationPage from './pages/ArCalibrationPage';
// import ARBoxBreathingPage from './pages/ARBoxBreathingPage';
// import { EFTStrictPage } from './pages/EFTStrictPage';
// import EFTPage from './pages/EFT';
// import { EFTScriptProvider } from './contexts/EFTScriptContext';
// import LoginPage from './pages/LoginPage';
// import ResponsiveContainer from './components/layout/ResponsiveContainer';
// import AppHeader from './components/layout/AppHeader';
// import PWAInstallHintIOS from './components/PWAInstallHintIOS';
// import TriModalMeditation from './components/meditation/TriModalMeditation';

// // 1. LandingFrame: 스타일 깨짐 방지를 위해 landing.html을 iframe으로 로드
// const LandingFrame: React.FC = () => {
//   return (
//     <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
//       <iframe 
//         src="/landing.html" 
//         style={{ 
//           width: '100%', 
//           height: '100%', 
//           border: 'none',
//           display: 'block' 
//         }} 
//         title="Landing Page"
//       />
//     </div>
//   );
// };

// // 2. 레이아웃 컨트롤러: 현재 경로가 '/' 이면 헤더를 숨김
// const LayoutController: React.FC<{ children: React.ReactNode }> = ({ children }) => {
//   const { isAuthenticated } = useAuth();
//   const location = useLocation();
  
//   // 루트 경로('/')일 때는 헤더를 절대 보여주지 않음
//   const isLandingPage = location.pathname === '/';

//   return (
//     <>
//       {!isLandingPage && isAuthenticated && <AppHeader />}
//       {children}
//     </>
//   );
// };

// const App: React.FC = () => {
//   const { loading } = useAuth();

//   if (loading) {
//     return (
//       <ResponsiveContainer>
//         <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-indigo-50 flex items-center justify-center">
//           <div className="w-8 h-8 border-3 border-blue-600 rounded-full animate-spin"></div>
//         </div>
//       </ResponsiveContainer>
//     );
//   }

//   return (
//     <Router>
//       <EFTScriptProvider>
//         <div className="min-h-screen bg-gray-50">
//           <LayoutController>
//             <Routes>
//               {/* 🔴 핵심 수정: 로그인 체크 제거! 무조건 LandingFrame 보여줌 */}
//               <Route path="/" element={<LandingFrame />} />

//               {/* 나머지 경로들은 정상 작동 */}
//               <Route path="/dashboard" element={<Dashboard />} />

//               <Route path="/eft-strict" element={<EFTStrictPage />} />
//               <Route path="/ar-demo" element={<ARDemo />} />
//               <Route path="/ar-test" element={<ARTest />} />
//               <Route path="/ar-holistic" element={<ARHolisticTest />} />
//               <Route path="/ar-box-breathing" element={<ARBoxBreathingPage />} />  
//               <Route path="/ar-calibration" element={<ArCalibrationPage />} />
//               <Route path="/meditation" element={<TriModalMeditation />} />
//             </Routes>
//           </LayoutController>
//           <PWAInstallHintIOS />
//         </div>
//       </EFTScriptProvider>
//     </Router>
//   );
// };

// export default App;
import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { EFTScriptProvider } from "./contexts/EFTScriptContext";
import ResponsiveContainer from "./components/layout/ResponsiveContainer";
import PWAInstallHintIOS from "./components/PWAInstallHintIOS";
import AppRoutes from "./routes";
import LayoutController from "./components/layout/LayoutController";

export default function App() {
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
            <AppRoutes />
          </LayoutController>
          <PWAInstallHintIOS />
        </div>
      </EFTScriptProvider>
    </Router>
  );
}
