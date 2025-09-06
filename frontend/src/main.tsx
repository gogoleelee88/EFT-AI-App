import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

root.render(
  // <StrictMode> - 임시 비활성화 (카메라 디버깅 중)
    <App />
  // </StrictMode>
)

// ✅ React 앱 하이드레이션 완료 신호 (1회만 보장)
// StrictMode에서 effect 2번 호출 방지
let hydrationEventSent = false;

const signalAppHydrated = () => {
  if (!hydrationEventSent) {
    hydrationEventSent = true;
    window.dispatchEvent(new Event('app:hydrated'));
    console.log('🚀 React 앱 하이드레이션 완료');
  }
};

// 이중 requestAnimationFrame으로 더 매끄러운 타이밍 보장
requestAnimationFrame(() => requestAnimationFrame(signalAppHydrated));

// 개발 모드에서 Service Worker 자동 정리 (재발 방지)
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js');
  } else {
    // DEV: 혹시 남아 있던 SW를 전부 제거
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.unregister();
        console.log('🧹 개발 모드에서 Service Worker 제거:', registration.scope);
      });
    });
  }
}
