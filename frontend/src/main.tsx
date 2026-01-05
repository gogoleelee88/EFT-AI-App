import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Build info for deployment tracking
declare const __BUILD_ID__: string
declare const __BUILD_TIME__: string
console.info('BUILD', __BUILD_ID__, __BUILD_TIME__)

// Force bundle content change to eliminate old route cache
console.log('🔄 Bundle regeneration timestamp:', Date.now())

// 🧪 MSW 모킹 활성화 (개발 모드 전용)
// 💡 localStorage.setItem('DISABLE_MSW','1') → 새로고침하면 실서버 직접 확인 가능
/*
if (import.meta.env.DEV && !localStorage.getItem('DISABLE_MSW')) {
  import('./mocks/browser').then(({ worker }) => {
    worker.start({
      onUnhandledRequest(request, print) {
        // MediaPipe, CDN, 외부 라이브러리 요청은 MSW가 간섭하지 않고 통과시킴
        if (
          request.url.includes('jsdelivr.net') ||
          request.url.includes('mediapipe') ||
          request.url.includes('.wasm') ||
          request.url.includes('.png') ||
          request.url.includes('cdnjs.cloudflare.com') ||
          request.url.includes('fonts.googleapis.com')
        ) {
          return; // 아무것도 안 함 = MSW가 안 건드림
        }

        // 그 외의 처리되지 않은 API 요청은 경고 로그 출력
        print.warning();
      },
    });
    console.log('🧪 MSW mocking enabled (DEV mode)');
  });

  // 시나리오 토글 유틸 로드
  import('./utils/testScenario');
} else */

if (import.meta.env.DEV) {
  console.log('🔇 MSW mocking disabled (DISABLE_MSW=1)');
}

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
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('🛠️ Service Worker registered:', registration.scope);
      registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker controller changed, reloading...');
        window.location.reload();
      });
    }).catch(error => {
      console.error('Service Worker registration failed:', error);
    });
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
