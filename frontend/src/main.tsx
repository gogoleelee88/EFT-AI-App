import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

root.render(
  <StrictMode>
    <App />
  </StrictMode>
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
