// EFT AI 앱 Service Worker
const CACHE_NAME = 'eft-ai-app-v1.0.0';
const STATIC_CACHE_NAME = 'eft-ai-static-v1';
const DYNAMIC_CACHE_NAME = 'eft-ai-dynamic-v1';

// 캐시할 정적 리소스
const STATIC_ASSETS = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  // 오프라인 폴백 페이지
  '/offline.html'
];

// AI 모델 관련 리소스 (큰 파일들)
const AI_ASSETS = [
  // Transformers.js 모델 파일들은 동적으로 캐시
];

// 캐시 우선순위 전략
const CACHE_STRATEGIES = {
  // 정적 파일: Cache First
  static: ['/static/', '/assets/', '/icons/'],
  // API 호출: Network First
  api: ['/api/', 'https://api.'],
  // AI 모델: Cache First (큰 파일)
  aiModels: ['huggingface.co', 'cdn.jsdelivr.net'],
  // 페이지: Network First with Cache Fallback
  pages: ['/']
};

// 설치 이벤트 - 정적 리소스 캐시
self.addEventListener('install', (event) => {
  console.log('🚀 EFT AI Service Worker 설치 중...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('📦 정적 리소스 캐시 중...');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('❌ 정적 리소스 캐시 실패:', error);
      })
  );
  
  // 즉시 활성화
  self.skipWaiting();
});

// 활성화 이벤트 - 오래된 캐시 정리
self.addEventListener('activate', (event) => {
  console.log('✅ EFT AI Service Worker 활성화됨');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== STATIC_CACHE_NAME && 
                     cacheName !== DYNAMIC_CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('🗑️ 오래된 캐시 삭제:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
  );
  
  // 모든 탭에서 즉시 제어
  self.clients.claim();
});

// 개발/번들러 관련 요청 우회(캐시 금지)
const shouldBypass = (url) => {
  try {
    const u = new URL(url);
    // Vite / HMR / source map / dev tools 류
    if (u.pathname.startsWith('/@vite') || u.pathname.includes('vite'))
      return true;
    if (u.pathname.endsWith('.map')) return true;
    // HMR client
    if (u.host === 'localhost:5173') return true;
  } catch {}
  return false;
};

// Fetch 이벤트 - 네트워크 요청 처리
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // WebSocket은 SW가 가로채지 않음(안전하게 우회)
  if (request.headers.get('upgrade') === 'websocket') return;

  // 개발/빌드 도구 요청은 우회
  if (shouldBypass(url.href)) return;

  // Chrome extension 요청 무시
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // 적절한 캐시 전략 선택
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isAIModel(url.href)) {
    event.respondWith(cacheFirstWithUpdateStrategy(request));
  } else if (isAPICall(url.href)) {
    event.respondWith(networkFirstStrategy(request));
  } else {
    event.respondWith(networkFirstWithCacheFallback(request));
  }
});

// 캐시 전략 함수들

// Cache First - 정적 리소스용
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    const cache = await caches.open(STATIC_CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('Cache First 전략 실패:', error);
    return new Response('네트워크 오류', { status: 503 });
  }
}

// Cache First with Background Update - AI 모델용
async function cacheFirstWithUpdateStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    
    // 백그라운드에서 업데이트
    const updateCache = async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        cache.put(request, networkResponse.clone());
      } catch (error) {
        console.log('백그라운드 업데이트 실패 (정상):', error.message);
      }
    };
    
    if (cachedResponse) {
      updateCache(); // 비동기 업데이트
      return cachedResponse;
    }
    
    // 캐시에 없으면 네트워크에서 가져오기
    const networkResponse = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    console.error('AI 모델 캐시 전략 실패:', error);
    return new Response('AI 모델 로딩 실패', { status: 503 });
  }
}

// Network First - API 호출용
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // GET 요청만 캐시 (POST/PUT/DELETE는 캐시하지 않음)
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('네트워크 우선 전략 - 캐시로 폴백');
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response('오프라인 상태입니다', { 
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Network First with Cache Fallback - 페이지용 (네비게이션 우선)
async function networkFirstWithCacheFallback(request) {
  // 네비게이션 요청은 "네트워크 우선, 실패 시 캐시" 전략
  if (request.mode === 'navigate') {
    try {
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (error) {
      console.log('페이지 로딩 실패 - 캐시에서 찾는 중...');
      const cache = await caches.open('app-shell');
      const cached = await cache.match('/index.html');
      if (cached) return cached;
      throw error;
    }
  }

  // 정적 리소스는 기존 로직
  try {
    const networkResponse = await fetch(request);
    
    // 성공한 페이지 응답을 캐시
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('페이지 로딩 실패 - 캐시에서 찾는 중...');
    
    // 캐시에서 찾기
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 오프라인 폴백 페이지
    if (request.destination === 'document') {
      return caches.match('/offline.html');
    }
    
    return new Response('페이지를 찾을 수 없습니다', { status: 404 });
  }
}

// 헬퍼 함수들
function isStaticAsset(pathname) {
  return CACHE_STRATEGIES.static.some(path => pathname.startsWith(path));
}

function isAIModel(url) {
  return CACHE_STRATEGIES.aiModels.some(domain => url.includes(domain));
}

function isAPICall(url) {
  return CACHE_STRATEGIES.api.some(path => url.includes(path));
}

// 백그라운드 동기화 (푸시 알림 등)
self.addEventListener('sync', (event) => {
  if (event.tag === 'ai-response-sync') {
    event.waitUntil(syncAIResponses());
  }
});

async function syncAIResponses() {
  // AI 응답 동기화 로직
  console.log('🔄 AI 응답 백그라운드 동기화 중...');
}

// ==================== 푸시 알림 시스템 (운영 수준) ====================

// 푸시 알림 수신
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json?.() || JSON.parse(event.data?.text() || '{}');
  } catch (e) {
    console.warn('푸시 데이터 파싱 실패:', e);
  }
  
  const title = data.title || 'EFT AI 마음챙김';
  const body = data.body || '새로운 마음 케어 알림이 있습니다';
  const icon = data.icon || '/icons/icon-192x192.png';
  const tag = data.tag || 'eft-ai';
  
  // 🔒 동일 출처 URL만 허용 (보안 강화)
  const safeUrl = (() => {
    try {
      const u = new URL(data.url || '/', self.location.origin);
      return u.origin === self.location.origin ? u.href : self.location.origin + '/';
    } catch { 
      return self.location.origin + '/'; 
    }
  })();
  
  const options = {
    body,
    icon,
    badge: '/icons/badge-72x72.png',
    tag, // 같은 태그는 중복 방지
    vibrate: [100, 50, 100],
    requireInteraction: data.urgent || false, // 긴급시 자동 닫힘 방지
    data: {
      url: safeUrl,
      dateOfArrival: Date.now(),
      clickAction: data.clickAction || 'open-app',
      ...data
    },
    actions: [
      { action: 'open', title: '확인하기', icon: '/icons/checkmark.png' },
      { action: 'dismiss', title: '나중에', icon: '/icons/xmark.png' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const clickAction = event.notification.data?.clickAction || 'open-app';
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        // 동일 경로 탭이 있으면 우선 포커스
        const exact = list.find(c => c.url === targetUrl);
        if (exact && 'focus' in exact) return exact.focus();

        // 같은 오리진 아무 탭이나 있으면 포커스
        const sameOrigin = list.find(c => c.url.startsWith(self.location.origin));
        if (sameOrigin && 'focus' in sameOrigin) return sameOrigin.focus();

        // 새 창
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
      .catch(err => console.error('알림 클릭 처리 실패:', err))
  );
});

// 알림 닫기 분석
self.addEventListener('notificationclose', (event) => {
  // 서버에 이벤트 비콘 전송(실패해도 무시)
  fetch('/api/push/metrics', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ 
      type: 'close', 
      tag: event.notification.tag, 
      at: Date.now() 
    }),
    keepalive: true
  }).catch(() => {});
});

// 푸시 구독 변경 자동 복구
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const appServerKey = (self.APP_VAPID_KEY && urlBase64ToUint8Array(self.APP_VAPID_KEY)) || undefined;
      const reg = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(reg)
      });
      console.log('🔁 push 구독 자동 복구 완료');
    } catch (e) {
      console.warn('push 구독 자동 복구 실패:', e);
    }
  })());
});

// Base64URL 변환 유틸리티 (중복 방지)
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// ==================== 메시지 리스너 (VAPID 키 수신) ====================

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SET_VAPID' && event.data.key) {
    self.APP_VAPID_KEY = event.data.key;
    console.log('🔑 VAPID 공개키 수신');
  }
});

console.log('✨ EFT AI Service Worker 준비 완료!');