import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_RUN_NUMBER || Date.now().toString()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    // ⚠️ GPU 서버 복구 시 주의사항:
    // 1. frontend/public/manifest.json 파일이 존재함
    // 2. 아래 VitePWA의 manifest 설정과 충돌하여 404 오류 발생
    // 3. GPU 서버 복구 후 둘 중 하나만 사용해야 함:
    //    - 옵션 A: public/manifest.json 삭제하고 VitePWA manifest 사용 (권장)
    //    - 옵션 B: VitePWA manifest 주석 처리하고 public/manifest.json 사용
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: false, // ⚠️ 임시로 비활성화: public/manifest.json과 충돌 방지
      // GPU 복구 후 아래 주석 해제하고 public/manifest.json 삭제할 것
      /* manifest: {
        name: 'EFT AI 마음챙김 앱',
        short_name: 'EFT AI',
        description: 'AI와 함께하는 마음 여행 - EFT 기반 개인 심리관리 앱',
        theme_color: '#4F46E5',
        background_color: '#6366F1',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        version: new Date().toISOString(), // 빌드마다 바뀌도록
        icons: [
          {
            src: 'vite.svg',
            sizes: '64x64',
            type: 'image/svg+xml'
          },
          {
            src: 'vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }, */
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB로 증가
        clientsClaim: true,
        skipWaiting: true,
        cacheId: `eft-ai-${new Date().getTime()}`, // 빌드마다 고유 캐시 ID
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/eft-guide(\/.*)?$/], // eft-guide는 SW가 가로채지 않음
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'jsdelivr-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /^https:\/\/huggingface\.co\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'huggingface-models-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      },
      // 🔧 개발 환경에서는 PWA 비활성화 (12월 5일 발표용 임시)
      devOptions: {
        enabled: false,  // dev에서 Service Worker 끄기
        type: 'module'
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'ai-vendor': ['@huggingface/transformers'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  },
  server: {
  host: 'localhost',
  hmr: true,
  headers: {
    'X-Content-Type-Options': 'nosniff',
  },
  proxy: {
    '/api': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
    '/suds': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    },
  },
},

})
