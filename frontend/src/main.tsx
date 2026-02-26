import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { API_CONFIG, resolveBackendUrl, isApiPath } from "./config/api";

declare const __BUILD_ID__: string
declare const __BUILD_TIME__: string
console.info('BUILD', __BUILD_ID__, __BUILD_TIME__)

console.log('Bundle regeneration timestamp:', Date.now())

const shouldUseMockServiceWorker =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_USE_MSW ?? '').toLowerCase() === 'true' &&
  !localStorage.getItem('DISABLE_MSW')

if (shouldUseMockServiceWorker) {
  import('./mocks/browser').then(({ worker }) => {
    worker.start({
      onUnhandledRequest(request, print) {
        if (
          request.url.includes('jsdelivr.net') ||
          request.url.includes('mediapipe') ||
          request.url.includes('.wasm') ||
          request.url.includes('.png') ||
          request.url.includes('cdnjs.cloudflare.com') ||
          request.url.includes('fonts.googleapis.com')
        ) {
          return
        }
        print.warning()
      },
    })
    console.log('MSW mocking enabled (VITE_USE_MSW=true)')
  })

  import('./utils/testScenario')
} else if (import.meta.env.DEV) {
  console.log('MSW mocking disabled (set VITE_USE_MSW=true to enable in DEV)')
}

const originalFetch = window.fetch.bind(window);
const isAbsoluteUrl = (url: string) => /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(url)
const apiOrigin = (() => {
  try {
    return new URL(API_CONFIG.API_BASE_URL).origin
  } catch {
    return ''
  }
})()
const withApiCredentials = (init?: RequestInit): RequestInit => ({
  ...init,
  credentials: init?.credentials ?? 'include',
})
const shouldAttachApiCredentials = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl, window.location.origin)
    return parsed.origin === apiOrigin && isApiPath(parsed.pathname)
  } catch {
    return false
  }
}

window.fetch = async (input: RequestInfo, init?: RequestInit) => {
  if (typeof input === "string") {
    const value = input.trim()
    if (isAbsoluteUrl(value)) {
      return shouldAttachApiCredentials(value)
        ? originalFetch(value, withApiCredentials(init))
        : originalFetch(value, init)
    }
    const requestUrl = new URL(value, window.location.origin)
    if (isApiPath(requestUrl.pathname)) {
      return originalFetch(
        resolveBackendUrl(requestUrl.pathname + requestUrl.search),
        withApiCredentials(init)
      );
    }
    return originalFetch(value, init)
  }
  if (input instanceof Request) {
    const requestUrl = new URL(input.url, window.location.origin);
    if (requestUrl.origin === window.location.origin && isApiPath(requestUrl.pathname)) {
      const rewrittenRequest = new Request(
        resolveBackendUrl(requestUrl.pathname + requestUrl.search),
        input
      );
      return originalFetch(rewrittenRequest, withApiCredentials(init));
    }
  }
  return originalFetch(input, init);
};

console.debug(`API base: ${API_CONFIG.API_BASE_URL}`);

const root = createRoot(document.getElementById('root')!)

root.render(
  // <StrictMode>
  <App />
  // </StrictMode>
)

let hydrationEventSent = false

const signalAppHydrated = () => {
  if (!hydrationEventSent) {
    hydrationEventSent = true
    window.dispatchEvent(new Event('app:hydrated'))
    console.log('App hydration complete')
  }
}

requestAnimationFrame(() => requestAnimationFrame(signalAppHydrated))

const enableSwInDev = import.meta.env.DEV && String(import.meta.env.VITE_ENABLE_SW_IN_DEV || '').toLowerCase() === 'true'
const shouldRegisterSw = import.meta.env.PROD || enableSwInDev

if ('serviceWorker' in navigator) {
  if (shouldRegisterSw) {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration.scope)
        registration.update()
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('Service Worker controller changed, reloading...')
          window.location.reload()
        })
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error)
      })
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister()
        console.log('Service Worker unregistered:', registration.scope)
      })
    })
  }
}
